import { useState } from 'react';
import { Link } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { z } from 'zod';
import {
  TASK_PRIORITIES,
  TASK_PRIORITY_LABELS,
  TASK_TYPES,
  TASK_TYPE_LABELS,
  taskPrioritySchema,
  taskTypeSchema,
  type TaskSummary,
} from '@taskflow/core';
import { copyLink } from '../../app/copyLink';
import { LoadError, SkeletonRows } from '../../app/feedback';
import { Icon } from '../../app/icons';
import { UrlTextInput } from '../../app/UrlTextInput';
import { formatRange, todayIso } from '../../lib/dates';
import { useUrlState } from '../../lib/useUrlState';
import { useCan, useSession } from '../auth/session';
import { useCurrentProject } from '../projects/ProjectPage';
import { CompleteSprintDialog, destinationName, useCompleteSprint } from '../sprints/CompleteSprintDialog';
import { sprintTiming } from '../sprints/sprint-timing';
import { fetchSprints, sprintKeys } from '../sprints/sprints-api';
import { NewTaskDialog } from '../tasks/NewTaskDialog';
import { TaskDialog } from '../tasks/TaskDialog';
import { useTaskParam } from '../tasks/useTaskParam';
import { boardKey, fetchBoard, useMoveCard } from './board-api';
import { KanbanBoard } from './KanbanBoard';

/** Board filters, kept in the URL (`?q=login&priority=high`). Unknown values fall back to "all". */
const boardFilters = z.object({
  q: z.string().max(100).catch(''),
  assignee: z.union([z.literal('none'), z.uuid()]).catch(''),
  priority: taskPrioritySchema.or(z.literal('')).catch(''),
  type: taskTypeSchema.or(z.literal('')).catch(''),
});
type BoardFilters = z.output<typeof boardFilters>;

const matches = (f: BoardFilters) => (t: TaskSummary) => {
  const q = f.q.trim().toLowerCase();
  return (!q || t.title.toLowerCase().includes(q) || t.key.toLowerCase().includes(q))
    && (!f.assignee || (f.assignee === 'none' ? t.assignee === null : t.assignee?.id === f.assignee))
    && (!f.priority || t.priority === f.priority)
    && (!f.type || t.type === f.type);
};

/** /projects/:key/board — the active sprint as a Kanban board. */
export function BoardPage() {
  const project = useCurrentProject();
  const can = useCan();
  const session = useSession();
  const board = useQuery({ queryKey: boardKey(project.key), queryFn: ({ signal }) => fetchBoard(project.key, signal) });
  const sprints = useQuery({ queryKey: sprintKeys.list(project.key), queryFn: ({ signal }) => fetchSprints(project.key, signal) });
  const [filters, setFilters, { isDefault, reset }] = useUrlState(boardFilters);
  const { openNumber, open, close: closeTask } = useTaskParam(project.key);
  const [dialog, setDialog] = useState<'none' | 'create' | 'complete'>('none');
  const closeDialog = () => setDialog('none');
  const mover = useMoveCard(project.key);
  const complete = useCompleteSprint(project.key, closeDialog);
  const canMove = can('task:move');

  if (board.status === 'pending') {
    return (
      <div className="board" aria-busy="true">
        {[0, 1, 2, 3].map((i) => <div key={i} className="col"><SkeletonRows rows={3} label={i === 0 ? 'Loading board' : ''} /></div>)}
      </div>
    );
  }
  if (board.status === 'error') return <LoadError error={board.error} onRetry={() => void board.refetch()} />;

  const { sprint, tasks } = board.data;
  if (!sprint) {
    return (
      <div className="card empty-state">
        <div className="empty-icon"><Icon name="board" size={22} /></div>
        <h2>No active sprint</h2>
        <p className="muted">Start a sprint to see its tasks on the board.</p>
        <Link className="btn primary" to={`/projects/${project.key}/sprints`}>Go to sprints</Link>
      </div>
    );
  }

  const visible = tasks.filter(matches(filters));
  const planned = sprints.data?.sprints.filter((s) => s.status === 'planned') ?? [];
  const role = session.status === 'authenticated' ? session.user.role.name : 'current';
  const today = todayIso();

  return (
    <>
      <div className="section-head">
        <div>
          <h2>{sprint.name} board</h2>
          <p className="muted small">
            {sprint.goal ? `${sprint.goal} · ` : ''}{formatRange(sprint.startDate, sprint.endDate)} · <b>{sprintTiming(sprint, today)}</b>
          </p>
        </div>
        <div className="page-actions">
          {can('sprint:manage') && <button className="btn" onClick={() => setDialog('complete')}>Complete sprint</button>}
          {can('task:create') && <button className="btn primary" onClick={() => setDialog('create')}><Icon name="plus" size={16} /> Add task</button>}
        </div>
      </div>

      <div className="filters" role="search" aria-label="Filter cards">
        <UrlTextInput className="input search" type="search" placeholder="Filter cards…" aria-label="Filter cards by title or key"
          value={filters.q} maxLength={100} onValueChange={(q) => setFilters({ q })} />
        <select className="input" aria-label="Assignee" value={filters.assignee} onChange={(e) => setFilters({ assignee: e.target.value })}>
          <option value="">All assignees</option>
          <option value="none">Unassigned</option>
          {project.members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
        </select>
        <select className="input" aria-label="Priority" value={filters.priority}
          onChange={(e) => setFilters({ priority: taskPrioritySchema.or(z.literal('')).catch('').parse(e.target.value) })}>
          <option value="">All priorities</option>
          {TASK_PRIORITIES.map((p) => <option key={p} value={p}>{TASK_PRIORITY_LABELS[p]}</option>)}
        </select>
        <select className="input" aria-label="Type" value={filters.type}
          onChange={(e) => setFilters({ type: taskTypeSchema.or(z.literal('')).catch('').parse(e.target.value) })}>
          <option value="">All types</option>
          {TASK_TYPES.map((t) => <option key={t} value={t}>{TASK_TYPE_LABELS[t]}</option>)}
        </select>
        {!isDefault && <button className="btn sm" onClick={reset}>Clear filters</button>}
        <button className="btn sm" onClick={() => void copyLink('this board')} title="Filters are saved in the URL. Share this link to show the same view.">
          <Icon name="link" size={14} /> Copy link
        </button>
      </div>

      {canMove ? (
        <p className="muted board-hint">Drag cards, or focus a card and press <kbd>Shift</kbd> + <kbd>→</kbd> / <kbd>←</kbd> to move it.</p>
      ) : (
        <div className="note">Read-only: the <b>{role}</b> role can't move cards.</div>
      )}

      {visible.length === 0 && (
        <p className="muted small board-empty" role="status">
          {tasks.length === 0
            ? 'This sprint has no tasks yet. Add one here, or move tasks in from the backlog on the Sprints page.'
            : <>No cards match these filters. <button className="link-btn" onClick={reset}>Clear filters</button></>}
        </p>
      )}

      <KanbanBoard tasks={visible} canMove={canMove} onOpen={(t) => open(t.key)} onMove={mover.move}
        saving={mover.saving} reverted={mover.reverted} onRevertShown={mover.clearReverted}
        onAddTask={can('task:create') ? () => setDialog('create') : undefined} />

      {dialog === 'create' && <NewTaskDialog projectKey={project.key} onClose={closeDialog} onCreated={open} />}
      {dialog === 'complete' && (
        <CompleteSprintDialog sprint={sprint} unfinished={tasks.filter((t) => t.status !== 'done').length} planned={planned}
          pending={complete.isPending} onClose={closeDialog}
          onConfirm={(moveTo) => complete.mutate({ sprint, moveTo, destination: destinationName(moveTo, planned) })} />
      )}
      {openNumber !== null && <TaskDialog key={openNumber} project={project} number={openNumber} onClose={closeTask} />}
    </>
  );
}

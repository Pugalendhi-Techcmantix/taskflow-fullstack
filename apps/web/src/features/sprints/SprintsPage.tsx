import { useId, useState, type ReactNode } from 'react';
import { Link } from 'react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { SPRINT_STATUS_LABELS, addDays, daysBetween, sortSprints, type Sprint, type TaskSummary } from '@taskflow/core';
import { Avatar } from '../../app/Avatar';
import { ConfirmDialog } from '../../app/ConfirmDialog';
import { LoadError, SkeletonRows, errorMessage } from '../../app/feedback';
import { Icon } from '../../app/icons';
import { toast } from '../../app/toast';
import { formatRange, inclusiveDays, plural, todayIso } from '../../lib/dates';
import { ApiError } from '../../lib/http';
import { reloadSessionUser, useCan } from '../auth/session';
import { projectKeys } from '../projects/projects-api';
import { useCurrentProject } from '../projects/ProjectPage';
import { StatusBadge, TypeIcon, PriorityBadge } from '../tasks/badges';
import { TaskDialog } from '../tasks/TaskDialog';
import { fetchTasks, taskKeys, updateTask } from '../tasks/tasks-api';
import { useTaskParam } from '../tasks/useTaskParam';
import { SprintFormDialog } from './SprintFormDialog';
import { completeSprint, deleteSprint, fetchSprints, sprintKeys, startSprint } from './sprints-api';

type Dialog =
  | { kind: 'none' }
  | { kind: 'create' }
  | { kind: 'edit'; sprint: Sprint }
  | { kind: 'complete'; sprint: Sprint }
  | { kind: 'delete'; sprint: Sprint };

/** "6 days left", "Starts in 3 days", "Overdue by 2 days"… relative to today in the user's time zone. */
function timing(s: Sprint, today: string): string {
  if (s.status === 'completed') return 'Completed';
  if (s.status === 'active') {
    const left = daysBetween(today, s.endDate);
    if (left > 0) return `${plural(left, 'day')} left`;
    if (left === 0) return 'Ends today';
    return `Overdue by ${plural(-left, 'day')}`;
  }
  const until = daysBetween(today, s.startDate);
  if (until > 0) return `Starts in ${plural(until, 'day')}`;
  if (until === 0) return 'Starts today';
  return `Planned start was ${plural(-until, 'day')} ago`;
}

const SHOWN_PER_SPRINT = 5;
const sumPoints = (ts: TaskSummary[]) => ts.reduce((n, t) => n + (t.points ?? 0), 0);

export function SprintsPage() {
  const project = useCurrentProject();
  const can = useCan();
  const qc = useQueryClient();
  const listKey = sprintKeys.list(project.key);
  const tasksKey = taskKeys.list(project.key);
  const sprints = useQuery({ queryKey: listKey, queryFn: ({ signal }) => fetchSprints(project.key, signal) });
  const tasks = useQuery({ queryKey: tasksKey, queryFn: ({ signal }) => fetchTasks(project.key, signal) });
  const [dialog, setDialog] = useState<Dialog>({ kind: 'none' });
  const close = () => setDialog({ kind: 'none' });
  const { openNumber, open, close: closeTask } = useTaskParam(project.key);
  const manage = can('sprint:manage');
  const today = todayIso();
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: listKey });
    void qc.invalidateQueries({ queryKey: tasksKey });
    void qc.invalidateQueries({ queryKey: projectKeys.all });
  };
  const onError = (err: unknown) => {
    toast(errorMessage(err), 'error');
    if (err instanceof ApiError && err.status === 403) void reloadSessionUser();
  };

  /** Optimistic start: the card becomes active at once and snaps back if the server refuses. */
  const start = useMutation({
    mutationFn: (sprint: Sprint) => startSprint(project.key, sprint.id),
    onMutate: async (sprint) => {
      await qc.cancelQueries({ queryKey: listKey });
      const previous = qc.getQueryData<{ sprints: Sprint[] }>(listKey);
      qc.setQueryData<{ sprints: Sprint[] }>(listKey, (old) =>
        old && { sprints: sortSprints(old.sprints.map((s) => (s.id === sprint.id ? { ...s, status: 'active' } : s))) });
      return { previous };
    },
    onError: (err, _v, ctx) => {
      if (ctx?.previous) qc.setQueryData(listKey, ctx.previous);
      onError(err);
    },
    onSuccess: ({ sprint }) => toast(`${sprint.name} started`),
    onSettled: refresh,
  });

  const complete = useMutation({
    mutationFn: ({ sprint, moveTo }: { sprint: Sprint; moveTo: string }) => completeSprint(project.key, sprint.id, { moveUnfinishedTo: moveTo }),
    onError,
    onSuccess: ({ sprint, movedTasks }, { moveTo }) => {
      const where = moveTo === 'backlog' ? 'the backlog' : (sprints.data?.sprints.find((s) => s.id === moveTo)?.name ?? 'the next sprint');
      toast(`${sprint.name} completed${movedTasks ? ` · ${plural(movedTasks, 'unfinished task')} moved to ${where}` : ''}`);
      close();
    },
    onSettled: refresh,
  });

  const remove = useMutation({
    mutationFn: (sprint: Sprint) => deleteSprint(project.key, sprint.id),
    onError,
    onSuccess: (_d, sprint) => {
      toast(`${sprint.name} deleted · its tasks are in the backlog`);
      close();
    },
    onSettled: refresh,
  });

  /** "Move to sprint…" in the backlog: optimistic, rolls back on failure. */
  const moveTask = useMutation({
    mutationFn: ({ task, sprintId }: { task: TaskSummary; sprintId: string }) => updateTask(project.key, task.number, { sprintId }),
    onMutate: async ({ task, sprintId }) => {
      await qc.cancelQueries({ queryKey: tasksKey });
      const previous = qc.getQueryData<{ tasks: TaskSummary[] }>(tasksKey);
      const target = sprints.data?.sprints.find((s) => s.id === sprintId);
      qc.setQueryData<{ tasks: TaskSummary[] }>(tasksKey, (old) =>
        old && { tasks: old.tasks.map((t) => (t.id === task.id ? { ...t, sprint: target ? { id: target.id, name: target.name } : null } : t)) });
      return { previous };
    },
    onError: (err, _v, ctx) => {
      if (ctx?.previous) qc.setQueryData(tasksKey, ctx.previous);
      onError(err);
    },
    onSuccess: ({ task }) => toast(`${task.key} added to ${task.sprint?.name ?? 'the sprint'}`),
    onSettled: refresh,
  });

  if (sprints.status === 'pending') return <div className="card"><SkeletonRows rows={5} label="Loading sprints" /></div>;
  if (sprints.status === 'error') return <LoadError error={sprints.error} onRetry={() => void sprints.refetch()} />;

  const list = sprints.data.sprints;
  const allTasks = tasks.data?.tasks ?? [];
  const tasksOf = (sprintId: string) => allTasks.filter((t) => t.sprint?.id === sprintId);
  const backlog = allTasks.filter((t) => t.sprint === null);
  const active = list.find((s) => s.status === 'active');
  const planned = list.filter((s) => s.status === 'planned');
  // New sprint: starts the day after the latest sprint ends (or today), named "Sprint N".
  const lastEnd = list.reduce<string | null>((max, s) => (max === null || s.endDate > max ? s.endDate : max), null);
  const nextStart = lastEnd && addDays(lastEnd, 1) > today ? addDays(lastEnd, 1) : today;

  return (
    <>
      <div className="section-head">
        <div>
          <h2>Sprints</h2>
          <p className="muted small">{active ? `${active.name} is active · ${timing(active, today)}` : 'No active sprint'} · {plural(list.length, 'sprint')}</p>
        </div>
        {manage && <button className="btn primary" onClick={() => setDialog({ kind: 'create' })}>+ New sprint</button>}
      </div>

      {list.length === 0 && (
        <div className="card empty-state">
          <div className="empty-icon"><Icon name="sprint" size={22} /></div>
          <h2>No sprints yet</h2>
          <p className="muted">{manage ? 'Plan the first sprint: give it a goal and a 1–4 week time box.' : 'A Project Manager will plan the first sprint.'}</p>
          {manage && <button className="btn primary" onClick={() => setDialog({ kind: 'create' })}>+ New sprint</button>}
        </div>
      )}

      <ul className="sprint-list">
        {list.map((s) => {
          const ts = tasksOf(s.id);
          const done = ts.filter((t) => t.status === 'done');
          const pts = sumPoints(ts);
          const donePts = sumPoints(done);
          return (
            <li key={s.id} className={`card sprint ${s.status}`}>
              <div className="sprint-head">
                <h3>{s.name}</h3>
                <span className={`badge chip-${s.status}`}>{SPRINT_STATUS_LABELS[s.status]}</span>
                <span className="muted small nowrap"><Icon name="cal" size={13} /> {formatRange(s.startDate, s.endDate)} · {plural(inclusiveDays(s.startDate, s.endDate), 'day')}</span>
                <span className={`small nowrap ${s.status === 'active' && daysBetween(today, s.endDate) < 0 ? 'overdue' : 'muted'}`}>{timing(s, today)}</span>
                {manage && (
                  <span className="sprint-actions">
                    {s.status === 'planned' && (
                      <button className="btn sm" disabled={Boolean(active) || start.isPending}
                        title={active ? `Complete ${active.name} first — only one sprint can be active` : undefined}
                        onClick={() => start.mutate(s)}>Start sprint</button>
                    )}
                    {s.status === 'active' && <button className="btn sm" onClick={() => setDialog({ kind: 'complete', sprint: s })}>Complete sprint</button>}
                    {s.status !== 'completed' && <button className="btn sm" onClick={() => setDialog({ kind: 'edit', sprint: s })} aria-label={`Edit ${s.name}`}>Edit</button>}
                    {s.status === 'planned' && <button className="btn sm danger" onClick={() => setDialog({ kind: 'delete', sprint: s })} aria-label={`Delete ${s.name}`}>Delete</button>}
                  </span>
                )}
              </div>
              <p className={s.goal ? 'sprint-goal' : 'sprint-goal muted'}>{s.goal || 'No goal set.'}</p>
              <div className={`progress ${s.status === 'completed' ? 'done' : ''}`} role="progressbar" aria-label={`${s.name} progress`}
                aria-valuemin={0} aria-valuemax={Math.max(pts, 1)} aria-valuenow={donePts}>
                <span style={{ width: `${pts ? (donePts / pts) * 100 : ts.length ? (done.length / ts.length) * 100 : 0}%` }} />
              </div>
              <p className="muted small">{done.length} of {plural(ts.length, 'task')} done · {donePts} / {pts} points</p>
              {s.status !== 'completed' && ts.length > 0 && (
                <TaskRows tasks={ts.slice(0, SHOWN_PER_SPRINT)} onOpen={(t) => open(t.key)} />
              )}
              {s.status !== 'completed' && ts.length > SHOWN_PER_SPRINT && (
                <p className="muted small more-line">+ {ts.length - SHOWN_PER_SPRINT} more · <Link to={`/projects/${project.key}/tasks`}>see all</Link></p>
              )}
            </li>
          );
        })}

        <li className="card sprint backlog">
          <div className="sprint-head">
            <h3>Backlog</h3>
            <span className="muted small">{plural(backlog.length, 'task')} not in a sprint</span>
          </div>
          {tasks.status === 'pending' && <SkeletonRows rows={3} label="Loading backlog" />}
          {tasks.status === 'error' && <LoadError error={tasks.error} onRetry={() => void tasks.refetch()} />}
          {tasks.status === 'success' && backlog.length === 0 && <p className="muted small" style={{ marginTop: 8 }}>The backlog is empty.</p>}
          {backlog.length > 0 && (
            <TaskRows tasks={backlog} onOpen={(t) => open(t.key)}
              action={can('task:update') && (active || planned.length > 0)
                ? (t) => <MoveToSprint task={t} sprints={[...(active ? [active] : []), ...planned]} onMove={(sprintId) => moveTask.mutate({ task: t, sprintId })} />
                : undefined} />
          )}
        </li>
      </ul>

      {dialog.kind === 'create' && (
        <SprintFormDialog mode="create" projectKey={project.key} defaults={{ name: `Sprint ${list.length + 1}`, startDate: nextStart }} onClose={close} />
      )}
      {dialog.kind === 'edit' && <SprintFormDialog mode="edit" projectKey={project.key} sprint={dialog.sprint} onClose={close} />}
      {dialog.kind === 'complete' && (
        <CompleteSprintDialog sprint={dialog.sprint} unfinished={tasksOf(dialog.sprint.id).filter((t) => t.status !== 'done').length}
          planned={planned} pending={complete.isPending} onClose={close}
          onConfirm={(moveTo) => complete.mutate({ sprint: dialog.sprint, moveTo })} />
      )}
      {dialog.kind === 'delete' && (
        <ConfirmDialog title={`Delete ${dialog.sprint.name}?`} confirmLabel="Delete sprint" pendingLabel="Deleting…" danger pending={remove.isPending}
          onConfirm={() => remove.mutate(dialog.sprint)} onClose={close}>
          <p>This planned sprint will be removed. Its {plural(tasksOf(dialog.sprint.id).length, 'task')} will move to the backlog.</p>
        </ConfirmDialog>
      )}
      {openNumber !== null && <TaskDialog key={openNumber} project={project} number={openNumber} onClose={closeTask} />}
    </>
  );
}

/* ---------- pieces ---------- */

function TaskRows({ tasks, onOpen, action }: { tasks: TaskSummary[]; onOpen: (t: TaskSummary) => void; action?: ((t: TaskSummary) => ReactNode) | undefined }) {
  return (
    <ul className="task-rows">
      {tasks.map((t) => (
        <li key={t.id}>
          <button className="task-row" onClick={() => onOpen(t)}>
            <TypeIcon type={t.type} />
            <span className="key">{t.key}</span>
            <span className="title">{t.title}</span>
          </button>
          {action ? <PriorityBadge priority={t.priority} /> : <StatusBadge status={t.status} />}
          {action?.(t)}
          {t.assignee ? <Avatar id={t.assignee.id} name={t.assignee.name} size="sm" title={t.assignee.name} /> : <span className="avatar sm empty" title="Unassigned" aria-label="Unassigned" />}
        </li>
      ))}
    </ul>
  );
}

function MoveToSprint({ task, sprints, onMove }: { task: TaskSummary; sprints: Sprint[]; onMove: (sprintId: string) => void }) {
  const id = useId();
  return (
    <>
      <label htmlFor={id} className="visually-hidden">Move {task.key} to a sprint</label>
      <select id={id} className="input compact mini" value="" onChange={(e) => { if (e.target.value) onMove(e.target.value); }}>
        <option value="">Move to sprint…</option>
        {sprints.map((s) => <option key={s.id} value={s.id}>{s.name}{s.status === 'active' ? ' (active)' : ''}</option>)}
      </select>
    </>
  );
}

/** Asks where unfinished tasks should go: the next planned sprint (default) or the backlog. */
function CompleteSprintDialog({ sprint, unfinished, planned, pending, onConfirm, onClose }: {
  sprint: Sprint; unfinished: number; planned: Sprint[]; pending: boolean; onConfirm: (moveTo: string) => void; onClose: () => void;
}) {
  const selectId = useId();
  const [moveTo, setMoveTo] = useState(planned[0]?.id ?? 'backlog');
  return (
    <ConfirmDialog title={`Complete ${sprint.name}?`} confirmLabel="Complete sprint" pendingLabel="Completing…" pending={pending}
      onConfirm={() => onConfirm(moveTo)} onClose={onClose}>
      <p>The sprint becomes read-only and another sprint can be started.</p>
      {unfinished > 0 ? (
        <div className="field" style={{ marginTop: 14 }}>
          <label htmlFor={selectId}>Move the {plural(unfinished, 'unfinished task')} to</label>
          <select id={selectId} className="input" value={moveTo} onChange={(e) => setMoveTo(e.target.value)}>
            {planned.map((s) => <option key={s.id} value={s.id}>{s.name} (planned)</option>)}
            <option value="backlog">Backlog</option>
          </select>
        </div>
      ) : (
        <p className="muted small" style={{ marginTop: 8 }}>All its tasks are done. 🎉</p>
      )}
    </ConfirmDialog>
  );
}

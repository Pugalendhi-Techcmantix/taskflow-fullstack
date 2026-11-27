import { useRef, useState } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { z } from 'zod';
import {
  PAGE_SIZES,
  SEARCH_TEXT_MAX,
  TASK_PRIORITIES,
  TASK_PRIORITY_LABELS,
  TASK_STATUSES,
  TASK_STATUS_LABELS,
  TASK_TYPES,
  TASK_TYPE_LABELS,
  assigneeFilterSchema,
  isOverdue,
  sortSprints,
  sprintFilterSchema,
  taskPrioritySchema,
  taskStatusSchema,
  taskTypeSchema,
  type TaskListQuery,
  type TaskSummary,
} from '@taskflow/core';
import { Avatar } from '../../app/Avatar';
import { copyLink } from '../../app/copyLink';
import { DataGrid, type Column } from '../../app/DataGrid';
import { LoadError, SkeletonRows } from '../../app/feedback';
import { Icon } from '../../app/icons';
import { Pager } from '../../app/Pager';
import { UrlTextInput } from '../../app/UrlTextInput';
import { formatDay, plural, todayIso } from '../../lib/dates';
import { useUrlState } from '../../lib/useUrlState';
import { TYPING_DEBOUNCE_MS, wait } from '../../lib/wait';
import { useCan } from '../auth/session';
import { useCurrentProject } from '../projects/ProjectPage';
import { fetchSprints, sprintKeys } from '../sprints/sprints-api';
import { PriorityBadge, StatusBadge, TypeIcon } from './badges';
import { NewTaskDialog } from './NewTaskDialog';
import { COLUMN_OF_SORT, NO_FILTERS, SORTABLE_COLUMNS, hasFilters, sortOfColumn, taskTableState, toTaskListQuery } from './task-table-state';
import { TaskDialog } from './TaskDialog';
import { fetchTaskPage, taskKeys } from './tasks-api';
import { useTaskParam } from './useTaskParam';

/** Parses a <select> value, falling back to '' ("all") for anything unexpected. */
const pick = <S extends z.ZodType>(schema: S, value: string) => schema.or(z.literal('')).catch('').parse(value);

/**
 * One page of the Tasks table. A new search text waits for a short pause in typing; if the user keeps
 * typing, the query key changes and TanStack Query aborts the waiting (or running) request.
 * Other changes (page, sort, filters) load at once. The previous page stays on screen meanwhile.
 */
function useTaskPage(projectKey: string, query: TaskListQuery) {
  const lastText = useRef(query.q);
  return useQuery({
    queryKey: taskKeys.page(projectKey, query),
    queryFn: async ({ signal }) => {
      if (query.q !== lastText.current) await wait(TYPING_DEBOUNCE_MS, signal);
      lastText.current = query.q;
      return fetchTaskPage(projectKey, query, signal);
    },
    placeholderData: keepPreviousData,
  });
}

/** /projects/:key/tasks: every task of the project, searched, filtered, sorted and paged on the server. */
export function TasksPage() {
  const project = useCurrentProject();
  const can = useCan();
  const [creating, setCreating] = useState(false);
  const [view, setView] = useUrlState(taskTableState);
  const query = toTaskListQuery(view);
  const tasks = useTaskPage(project.key, query);
  const sprints = useQuery({ queryKey: sprintKeys.list(project.key), queryFn: ({ signal }) => fetchSprints(project.key, signal) });
  const filtering = hasFilters(view);
  const today = todayIso();

  const { openNumber, open, close: closeTask } = useTaskParam(project.key);
  const openTask = (t: TaskSummary) => open(t.key);
  const filter = (patch: Partial<typeof view>) => setView({ ...patch, page: 1 });
  const clearFilters = () => setView(NO_FILTERS);

  const columns: Column<TaskSummary>[] = [
    { id: 'key', header: 'Key', render: (t) => <span className="key-cell"><TypeIcon type={t.type} /><span className="key">{t.key}</span></span> },
    { id: 'title', header: 'Title', className: 'title-cell', render: (t) => (
      <span className="title-wrap">
        <b>{t.title}</b>
        {(t.subtasks.total > 0 || t.commentCount > 0) && (
          <span className="muted small task-counts">
            {t.subtasks.total > 0 && <span title="Subtasks done"><Icon name="check" size={12} /> {t.subtasks.done}/{t.subtasks.total}</span>}
            {t.commentCount > 0 && <span title="Comments">💬 {t.commentCount}</span>}
          </span>
        )}
      </span>
    ) },
    { id: 'status', header: 'Status', render: (t) => <StatusBadge status={t.status} /> },
    { id: 'priority', header: 'Priority', render: (t) => <PriorityBadge priority={t.priority} /> },
    { id: 'assignee', header: 'Assignee', render: (t) => t.assignee
      ? <span className="who"><Avatar id={t.assignee.id} name={t.assignee.name} size="sm" />{t.assignee.name}</span>
      : <span className="muted">Unassigned</span> },
    { id: 'sprint', header: 'Sprint', className: 'nowrap muted', render: (t) => t.sprint?.name ?? 'Backlog' },
    { id: 'points', header: 'Points', render: (t) => t.points ?? <span className="muted">—</span> },
    { id: 'dueDate', header: 'Due', className: 'nowrap', render: (t) => t.dueDate
      ? <span className={isOverdue(t, today) ? 'overdue' : undefined}><Icon name="cal" size={12} /> {formatDay(t.dueDate, false)}</span>
      : <span className="muted">—</span> },
  ];

  const summary = tasks.status !== 'success'
    ? 'Search, filter, sort and page through every task'
    : filtering
      ? `${plural(tasks.data.total, 'task')} match these filters`
      : `${plural(tasks.data.total, 'task')} · click a row to open it`;

  return (
    <>
      <div className="section-head">
        <div>
          <h2>Tasks & issues</h2>
          <p className="muted small">{summary}</p>
        </div>
        {can('task:create') && <button className="btn primary" onClick={() => setCreating(true)}>+ New task</button>}
      </div>

      <div className="filters dense" role="search" aria-label="Filter tasks">
        <UrlTextInput className="input search" type="search" placeholder="Search by key or title…" aria-label="Search tasks by key or title"
          value={view.q} maxLength={SEARCH_TEXT_MAX} onValueChange={(q) => filter({ q })} />
        <select className="input" aria-label="Status" value={view.status} onChange={(e) => filter({ status: pick(taskStatusSchema, e.target.value) })}>
          <option value="">All statuses</option>
          {TASK_STATUSES.map((s) => <option key={s} value={s}>{TASK_STATUS_LABELS[s]}</option>)}
        </select>
        <select className="input" aria-label="Priority" value={view.priority} onChange={(e) => filter({ priority: pick(taskPrioritySchema, e.target.value) })}>
          <option value="">All priorities</option>
          {TASK_PRIORITIES.map((p) => <option key={p} value={p}>{TASK_PRIORITY_LABELS[p]}</option>)}
        </select>
        <select className="input" aria-label="Type" value={view.type} onChange={(e) => filter({ type: pick(taskTypeSchema, e.target.value) })}>
          <option value="">All types</option>
          {TASK_TYPES.map((t) => <option key={t} value={t}>{TASK_TYPE_LABELS[t]}</option>)}
        </select>
        <select className="input" aria-label="Assignee" value={view.assignee} onChange={(e) => filter({ assignee: pick(assigneeFilterSchema, e.target.value) })}>
          <option value="">All assignees</option>
          <option value="none">Unassigned</option>
          {project.members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
        </select>
        <select className="input" aria-label="Sprint" value={view.sprint} onChange={(e) => filter({ sprint: pick(sprintFilterSchema, e.target.value) })}>
          <option value="">All sprints</option>
          <option value="backlog">Backlog</option>
          {sortSprints(sprints.data?.sprints ?? []).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
        {filtering && <button className="btn sm" onClick={clearFilters}>Clear filters</button>}
        <button className="btn sm" onClick={() => void copyLink('this table')} title="Filters, sort and page are saved in the URL. Share this link to show the same view.">
          <Icon name="link" size={14} /> Copy link
        </button>
      </div>

      {tasks.status === 'pending' && <div className="card"><SkeletonRows rows={8} label="Loading tasks" /></div>}
      {tasks.status === 'error' && <LoadError error={tasks.error} onRetry={() => void tasks.refetch()} />}
      {tasks.status === 'success' && (
        <div className="card table-card">
          <DataGrid
            label={`Tasks in ${project.name}`}
            rows={tasks.data.tasks}
            columns={columns}
            rowKey={(t) => t.id}
            onRowClick={openTask}
            busy={tasks.isPlaceholderData}
            sorting={{
              mode: 'server',
              sortable: SORTABLE_COLUMNS,
              sort: { by: COLUMN_OF_SORT[view.sort], dir: view.dir },
              onSort: ({ by, dir }) => {
                const sort = sortOfColumn(by);
                if (sort) setView({ sort, dir, page: 1 });
              },
            }}
            empty={filtering ? (
              <div className="empty-state">
                <div className="empty-icon"><Icon name="search" size={22} /></div>
                <h2>No tasks match these filters</h2>
                <p className="muted">Try a different search, or clear the filters to see every task.</p>
                <button className="btn" onClick={clearFilters}>Clear filters</button>
              </div>
            ) : (
              <div className="empty-state">
                <div className="empty-icon"><Icon name="list" size={22} /></div>
                <h2>No tasks yet</h2>
                <p className="muted">{can('task:create') ? 'Create the first task: a story, task or bug.' : 'Tasks will appear here when someone creates them.'}</p>
                {can('task:create') && <button className="btn primary" onClick={() => setCreating(true)}>+ New task</button>}
              </div>
            )}
          />
          {tasks.data.total > 0 && (
            <Pager page={tasks.data.page} size={view.size} total={tasks.data.total} sizes={PAGE_SIZES} noun="tasks"
              onPage={(page) => setView({ page })} onSize={(size) => setView({ size, page: 1 })} />
          )}
        </div>
      )}

      {creating && <NewTaskDialog projectKey={project.key} onClose={() => setCreating(false)} />}
      {openNumber !== null && <TaskDialog key={openNumber} project={project} number={openNumber} onClose={closeTask} />}
    </>
  );
}

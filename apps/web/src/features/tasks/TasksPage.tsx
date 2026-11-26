import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { TASK_PRIORITIES, TASK_STATUSES, isOverdue, type TaskSummary } from '@taskflow/core';
import { Avatar } from '../../app/Avatar';
import { DataGrid, type Column } from '../../app/DataGrid';
import { LoadError, SkeletonRows } from '../../app/feedback';
import { Icon } from '../../app/icons';
import { formatDay, plural, todayIso } from '../../lib/dates';
import { useCan } from '../auth/session';
import { useCurrentProject } from '../projects/ProjectPage';
import { PriorityBadge, StatusBadge, TypeIcon } from './badges';
import { NewTaskDialog } from './NewTaskDialog';
import { TaskDialog } from './TaskDialog';
import { fetchTasks, taskKeys } from './tasks-api';
import { useTaskParam } from './useTaskParam';

/** /projects/:key/tasks — every task of the project. `?task=TF-107` opens that task (shareable link). */
export function TasksPage() {
  const project = useCurrentProject();
  const can = useCan();
  const [creating, setCreating] = useState(false);
  const tasks = useQuery({ queryKey: taskKeys.list(project.key), queryFn: ({ signal }) => fetchTasks(project.key, signal) });
  const today = todayIso();

  const { openNumber, open, close: closeTask } = useTaskParam(project.key);
  const openTask = (t: TaskSummary) => open(t.key);

  const columns: Column<TaskSummary>[] = [
    { id: 'key', header: 'Key', sortValue: (t) => t.number, render: (t) => <span className="key-cell"><TypeIcon type={t.type} /><span className="key">{t.key}</span></span> },
    { id: 'title', header: 'Title', sortValue: (t) => t.title.toLowerCase(), className: 'title-cell', render: (t) => (
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
    { id: 'status', header: 'Status', sortValue: (t) => TASK_STATUSES.indexOf(t.status), render: (t) => <StatusBadge status={t.status} /> },
    { id: 'priority', header: 'Priority', sortValue: (t) => TASK_PRIORITIES.indexOf(t.priority), render: (t) => <PriorityBadge priority={t.priority} /> },
    { id: 'assignee', header: 'Assignee', sortValue: (t) => t.assignee?.name.toLowerCase() ?? null, render: (t) => t.assignee
      ? <span className="who"><Avatar id={t.assignee.id} name={t.assignee.name} size="sm" />{t.assignee.name}</span>
      : <span className="muted">Unassigned</span> },
    { id: 'sprint', header: 'Sprint', sortValue: (t) => t.sprint?.name ?? null, className: 'nowrap muted', render: (t) => t.sprint?.name ?? 'Backlog' },
    { id: 'points', header: 'Points', sortValue: (t) => t.points, render: (t) => t.points ?? <span className="muted">—</span> },
    { id: 'dueDate', header: 'Due', sortValue: (t) => t.dueDate, className: 'nowrap', render: (t) => t.dueDate
      ? <span className={isOverdue(t, today) ? 'overdue' : undefined}><Icon name="cal" size={12} /> {formatDay(t.dueDate, false)}</span>
      : <span className="muted">—</span> },
  ];

  return (
    <>
      <div className="section-head">
        <div>
          <h2>Tasks & issues</h2>
          <p className="muted small">{tasks.status === 'success' ? `${plural(tasks.data.tasks.length, 'task')} · click a row to open it` : 'All tasks in this project'}</p>
        </div>
        {can('task:create') && <button className="btn primary" onClick={() => setCreating(true)}>+ New task</button>}
      </div>

      {tasks.status === 'pending' && <div className="card"><SkeletonRows rows={6} label="Loading tasks" /></div>}
      {tasks.status === 'error' && <LoadError error={tasks.error} onRetry={() => void tasks.refetch()} />}
      {tasks.status === 'success' && (
        <div className="card table-card">
          <DataGrid
            label={`Tasks in ${project.name}`}
            rows={tasks.data.tasks}
            columns={columns}
            rowKey={(t) => t.id}
            onRowClick={openTask}
            empty={
              <div className="empty-state">
                <div className="empty-icon"><Icon name="list" size={22} /></div>
                <h2>No tasks yet</h2>
                <p className="muted">{can('task:create') ? 'Create the first task: a story, task or bug.' : 'Tasks will appear here when someone creates them.'}</p>
                {can('task:create') && <button className="btn primary" onClick={() => setCreating(true)}>+ New task</button>}
              </div>
            }
          />
        </div>
      )}

      {creating && <NewTaskDialog projectKey={project.key} onClose={() => setCreating(false)} />}
      {openNumber !== null && <TaskDialog key={openNumber} project={project} number={openNumber} onClose={closeTask} />}
    </>
  );
}

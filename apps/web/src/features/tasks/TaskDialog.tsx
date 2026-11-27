import { useId, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  STORY_POINTS,
  TASK_PRIORITIES,
  TASK_PRIORITY_LABELS,
  TASK_STATUSES,
  TASK_STATUS_LABELS,
  TASK_TYPES,
  TASK_TYPE_LABELS,
  storyPointsSchema,
  taskPrioritySchema,
  taskStatusSchema,
  taskTypeSchema,
  updateTaskInput,
  type Project,
  type TaskDetail,
  type TaskSummary,
  type UpdateTaskInput,
} from '@taskflow/core';
import { ConfirmDialog } from '../../app/ConfirmDialog';
import { LoadError, SkeletonRows, errorMessage } from '../../app/feedback';
import { Icon } from '../../app/icons';
import { toast } from '../../app/toast';
import { formatDay } from '../../lib/dates';
import { ApiError } from '../../lib/http';
import { reloadSessionUser, useCan } from '../auth/session';
import { projectKeys } from '../projects/projects-api';
import { fetchSprints, sprintKeys } from '../sprints/sprints-api';
import { TypeIcon } from './badges';
import { Comments, Subtasks } from './TaskItems';
import { deleteTask, fetchTask, patchTaskLists, taskKeys, updateTask } from './tasks-api';

type Props = { project: Project; number: number; onClose: () => void };

/** The task "drawer" from the prototype, as a large modal. Every field saves on change, optimistically. */
export function TaskDialog({ project, number, onClose }: Props) {
  const qc = useQueryClient();
  const can = useCan();
  const editable = can('task:update');
  const detailKey = taskKeys.detail(project.key, number);
  const listKey = taskKeys.list(project.key);
  const task = useQuery({ queryKey: detailKey, queryFn: ({ signal }) => fetchTask(project.key, number, signal), retry: false });
  const sprints = useQuery({ queryKey: sprintKeys.list(project.key), queryFn: ({ signal }) => fetchSprints(project.key, signal) });
  const [confirmDelete, setConfirmDelete] = useState(false);

  /** Applies a change to the cached task (detail + list row) so the UI updates before the server answers. */
  const save = useMutation({
    mutationFn: (input: UpdateTaskInput) => updateTask(project.key, number, input),
    onMutate: async (input) => {
      await Promise.all([qc.cancelQueries({ queryKey: detailKey }), qc.cancelQueries({ queryKey: listKey })]);
      const prevDetail = qc.getQueryData<{ task: TaskDetail }>(detailKey);
      const members = project.members;
      const sprintList = sprints.data?.sprints ?? [];
      const patch = <T extends TaskSummary>(t: T): T => ({
        ...t,
        ...(input.title !== undefined ? { title: input.title } : {}),
        ...(input.status !== undefined ? { status: input.status } : {}),
        ...(input.priority !== undefined ? { priority: input.priority } : {}),
        ...(input.type !== undefined ? { type: input.type } : {}),
        ...(input.points !== undefined ? { points: input.points } : {}),
        ...(input.dueDate !== undefined ? { dueDate: input.dueDate } : {}),
        ...(input.assigneeId !== undefined
          ? { assignee: input.assigneeId ? { id: input.assigneeId, name: members.find((m) => m.id === input.assigneeId)?.name ?? '…' } : null }
          : {}),
        ...(input.sprintId !== undefined
          ? { sprint: input.sprintId ? { id: input.sprintId, name: sprintList.find((s) => s.id === input.sprintId)?.name ?? '…' } : null }
          : {}),
      });
      qc.setQueryData<{ task: TaskDetail }>(detailKey, (old) => old && { task: { ...patch(old.task), ...(input.description !== undefined ? { description: input.description } : {}) } });
      const rollbackLists = patchTaskLists(qc, project.key, (t) => (t.number === number ? patch(t) : t));
      return { prevDetail, rollbackLists };
    },
    onError: (err, _input, ctx) => {
      if (ctx?.prevDetail) qc.setQueryData(detailKey, ctx.prevDetail);
      ctx?.rollbackLists();
      toast(`Not saved: ${errorMessage(err)}`, 'error');
      if (err instanceof ApiError && err.status === 403) void reloadSessionUser();
    },
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: detailKey });
      void qc.invalidateQueries({ queryKey: listKey });
      void qc.invalidateQueries({ queryKey: sprintKeys.list(project.key) });
      void qc.invalidateQueries({ queryKey: projectKeys.all });
    },
  });

  const remove = useMutation({
    mutationFn: () => deleteTask(project.key, number),
    onError: (err) => toast(errorMessage(err), 'error'),
    onSuccess: () => {
      qc.removeQueries({ queryKey: detailKey });
      void qc.invalidateQueries({ queryKey: listKey });
      void qc.invalidateQueries({ queryKey: sprintKeys.list(project.key) });
      toast(`${project.key}-${number} deleted`);
      onClose();
    },
  });

  return (
    <dialog className="modal lg" aria-labelledby="task-h" onClose={onClose} ref={(el) => { if (el && !el.open) el.showModal(); }}>
      {task.status === 'pending' && <div className="modal-body"><SkeletonRows rows={8} label="Loading task" /></div>}
      {task.status === 'error' && (
        <div className="modal-body">
          <h2 id="task-h" className="card-title">{project.key}-{number}</h2>
          {task.error instanceof ApiError && task.error.status === 404
            ? <p className="muted">This task doesn't exist (it may have been deleted).</p>
            : <LoadError error={task.error} onRetry={() => void task.refetch()} />}
          <div className="modal-foot flat"><button className="btn" onClick={onClose}>Close</button></div>
        </div>
      )}
      {task.status === 'success' && (
        <TaskBody
          task={task.data.task}
          project={project}
          sprints={(sprints.data?.sprints ?? []).filter((s) => s.status !== 'completed' || s.id === task.data.task.sprint?.id)}
          editable={editable}
          canDelete={can('task:delete')}
          onChange={(input) => save.mutate(input)}
          onDelete={() => setConfirmDelete(true)}
          onClose={onClose}
        />
      )}
      {confirmDelete && (
        <ConfirmDialog title={`Delete ${project.key}-${number}?`} confirmLabel="Delete task" pendingLabel="Deleting…" danger pending={remove.isPending}
          onConfirm={() => remove.mutate()} onClose={() => setConfirmDelete(false)}>
          <p>The task, its subtasks and comments will be removed for everyone. This can't be undone.</p>
        </ConfirmDialog>
      )}
    </dialog>
  );
}

type BodyProps = {
  task: TaskDetail;
  project: Project;
  sprints: { id: string; name: string; status: string }[];
  editable: boolean;
  canDelete: boolean;
  onChange: (input: UpdateTaskInput) => void;
  onDelete: () => void;
  onClose: () => void;
};

function TaskBody({ task: t, project, sprints, editable, canDelete, onChange, onDelete, onClose }: BodyProps) {
  const ids = { status: useId(), prio: useId(), who: useId(), type: useId(), sprint: useId(), pts: useId(), due: useId(), desc: useId() };
  const [title, setTitle] = useState(t.title);
  const [desc, setDesc] = useState(t.description);
  const [descState, setDescState] = useState<'idle' | 'saving' | 'saved'>('idle');
  const descTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  function saveTitle() {
    const next = title.trim();
    if (next === t.title) return;
    const ok = updateTaskInput.safeParse({ title: next });
    if (!ok.success) {
      toast('Title must be 3–200 characters', 'error');
      setTitle(t.title);
      return;
    }
    onChange({ title: next });
  }

  /** Description autosave: waits until typing pauses for 0.8 s. */
  function typeDescription(value: string) {
    setDesc(value);
    setDescState('saving');
    clearTimeout(descTimer.current);
    descTimer.current = setTimeout(() => {
      onChange({ description: value });
      setDescState('saved');
    }, 800);
  }

  return (
    <>
      <div className="modal-head">
        <div className="task-head">
          <TypeIcon type={t.type} />
          <span className="key">{t.key}</span>
          <span className="muted small">· {project.name}</span>
        </div>
        <div className="task-head-actions">
          {canDelete && <button className="btn sm danger" onClick={onDelete}>Delete</button>}
          <button className="icon-btn" aria-label="Close" onClick={onClose}>×</button>
        </div>
      </div>
      <div className="task-grid">
        <div className="task-main">
          <label htmlFor="task-title" className="visually-hidden">Title</label>
          <input id="task-title" className="title-input" value={title} disabled={!editable} maxLength={200}
            onChange={(e) => setTitle(e.target.value)} onBlur={saveTitle}
            onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); if (e.key === 'Escape') setTitle(t.title); }} />
          <h2 id="task-h" className="visually-hidden">{t.key} {t.title}</h2>
          {!editable && <div className="note" style={{ marginTop: 10 }}>Read-only: your role can view this task but not edit it.</div>}

          <h3 className="sub-h">
            <label htmlFor={ids.desc}>Description</label>
            <span className="save-ind" aria-live="polite">{descState === 'saving' ? 'Saving…' : descState === 'saved' ? 'Saved' : editable ? 'Saves automatically as you type' : ''}</span>
          </h3>
          <textarea id={ids.desc} className="input" rows={5} value={desc} disabled={!editable} maxLength={10_000}
            placeholder="Add a description…" onChange={(e) => typeDescription(e.target.value)} />

          <Subtasks project={project} task={t} editable={editable} />
          <Comments project={project} task={t} />
        </div>

        <aside className="task-side" aria-label="Task fields">
          <Select id={ids.status} label="Status" value={t.status} disabled={!editable}
            options={TASK_STATUSES.map((s) => [s, TASK_STATUS_LABELS[s]])}
            onChange={(v) => { const s = taskStatusSchema.safeParse(v); if (s.success) onChange({ status: s.data }); }} />
          <Select id={ids.prio} label="Priority" value={t.priority} disabled={!editable}
            options={TASK_PRIORITIES.map((p) => [p, TASK_PRIORITY_LABELS[p]])}
            onChange={(v) => { const p = taskPrioritySchema.safeParse(v); if (p.success) onChange({ priority: p.data }); }} />
          <Select id={ids.who} label="Assignee" value={t.assignee?.id ?? ''} disabled={!editable}
            options={[['', 'Unassigned'], ...project.members.map((m): [string, string] => [m.id, m.name])]}
            onChange={(v) => onChange({ assigneeId: v || null })} />
          <Select id={ids.type} label="Type" value={t.type} disabled={!editable}
            options={TASK_TYPES.map((x) => [x, TASK_TYPE_LABELS[x]])}
            onChange={(v) => { const x = taskTypeSchema.safeParse(v); if (x.success) onChange({ type: x.data }); }} />
          <Select id={ids.sprint} label="Sprint" value={t.sprint?.id ?? ''} disabled={!editable}
            options={[['', 'Backlog'], ...sprints.map((s): [string, string] => [s.id, `${s.name}${s.status === 'active' ? ' (active)' : ''}`])]}
            onChange={(v) => onChange({ sprintId: v || null })} />
          <Select id={ids.pts} label="Story points" value={t.points === null ? '' : String(t.points)} disabled={!editable}
            options={[['', 'Not estimated'], ...STORY_POINTS.map((p): [string, string] => [String(p), String(p)])]}
            onChange={(v) => {
              if (!v) return onChange({ points: null });
              const p = storyPointsSchema.safeParse(Number(v));
              if (p.success) onChange({ points: p.data });
            }} />
          <div className="field">
            <label htmlFor={ids.due}>Due date</label>
            <input id={ids.due} className="input" type="date" value={t.dueDate ?? ''} disabled={!editable}
              onChange={(e) => onChange({ dueDate: e.target.value || null })} />
          </div>
          <dl className="task-meta">
            <dt>Reporter</dt><dd>{t.reporter?.name ?? '—'}</dd>
            <dt>Created</dt><dd>{formatDay(t.createdAt.slice(0, 10))}</dd>
            {t.doneAt && <><dt>Done</dt><dd><Icon name="check" size={12} /> {formatDay(t.doneAt.slice(0, 10))}</dd></>}
          </dl>
        </aside>
      </div>
    </>
  );
}

function Select({ id, label, value, options, disabled, onChange }: {
  id: string; label: string; value: string; options: readonly (readonly [string, string])[]; disabled: boolean; onChange: (value: string) => void;
}) {
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <select id={id} className="input" value={value} disabled={disabled} onChange={(e) => onChange(e.target.value)}>
        {options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
      </select>
    </div>
  );
}

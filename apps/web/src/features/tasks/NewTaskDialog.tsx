import { useActionState, useId } from 'react';
import { useNavigate } from 'react-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  STORY_POINTS,
  TASK_PRIORITIES,
  TASK_PRIORITY_LABELS,
  TASK_TYPES,
  TASK_TYPE_LABELS,
  createTaskInput,
  fieldErrors,
} from '@taskflow/core';
import { errorMessage } from '../../app/feedback';
import { formText } from '../../app/forms';
import { toast } from '../../app/toast';
import { ApiError } from '../../lib/http';
import { reloadSessionUser } from '../auth/session';
import { fetchProject, projectKeys } from '../projects/projects-api';
import { fetchSprints, sprintKeys } from '../sprints/sprints-api';
import { createTask, taskKeys } from './tasks-api';

type FormState = { status: 'idle' } | { status: 'error'; message: string; fields: Record<string, string>; values: Record<string, string> };

/** "+ New task" — also used from the top bar. Opens the created task afterwards. */
/**
 * `onCreated` decides what happens with the new task (the board opens it in place);
 * by default the Tasks page opens with the new task's dialog.
 */
export function NewTaskDialog({ projectKey, onClose, onCreated }: { projectKey: string; onClose: () => void; onCreated?: (taskKey: string) => void }) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const project = useQuery({ queryKey: projectKeys.detail(projectKey), queryFn: ({ signal }) => fetchProject(projectKey, signal) });
  const sprints = useQuery({ queryKey: sprintKeys.list(projectKey), queryFn: ({ signal }) => fetchSprints(projectKey, signal) });
  const openSprints = sprints.data?.sprints.filter((s) => s.status !== 'completed') ?? [];
  const active = openSprints.find((s) => s.status === 'active');
  const ids = { title: useId(), type: useId(), prio: useId(), who: useId(), sprint: useId(), pts: useId(), due: useId(), desc: useId() };

  const [state, formAction, isPending] = useActionState<FormState, FormData>(async (_prev, form) => {
    const values = Object.fromEntries(['title', 'type', 'priority', 'assigneeId', 'sprintId', 'points', 'dueDate', 'description'].map((k) => [k, formText(form.get(k))]));
    const parsed = createTaskInput.safeParse({
      title: values.title,
      type: values.type,
      priority: values.priority,
      description: values.description,
      assigneeId: values.assigneeId || null,
      sprintId: values.sprintId || null,
      points: values.points ? Number(values.points) : null,
      dueDate: values.dueDate || null,
    });
    if (!parsed.success) return { status: 'error', message: 'Please fix the highlighted fields', fields: fieldErrors(parsed.error), values };
    try {
      const { task } = await createTask(projectKey, parsed.data);
      void qc.invalidateQueries({ queryKey: taskKeys.list(projectKey) });
      void qc.invalidateQueries({ queryKey: sprintKeys.list(projectKey) });
      void qc.invalidateQueries({ queryKey: projectKeys.all });
      toast(`${task.key} created`);
      onClose();
      if (onCreated) onCreated(task.key);
      else void navigate(`/projects/${projectKey}/tasks?task=${task.key}`);
      return { status: 'idle' };
    } catch (err) {
      if (err instanceof ApiError && err.status === 403) void reloadSessionUser();
      return { status: 'error', message: errorMessage(err), fields: err instanceof ApiError ? err.fields : {}, values };
    }
  }, { status: 'idle' });

  const errors = state.status === 'error' ? state.fields : {};
  const v = state.status === 'error' ? state.values : {};
  const formMessage = state.status === 'error' && Object.keys(state.fields).length === 0 ? state.message : null;
  const err = (field: string, id: string) => errors[field] ? <div className="err" id={`${id}-e`}>{errors[field]}</div> : null;
  const invalid = (field: string, id: string) => (errors[field] ? { 'aria-invalid': true, 'aria-describedby': `${id}-e` } : {});

  return (
    <dialog className="modal" aria-labelledby="new-task-h" onClose={onClose} ref={(el) => { if (el && !el.open) el.showModal(); }}>
      <form action={formAction} noValidate>
        <div className="modal-head">
          <h2 id="new-task-h">New task in {project.data?.project.name ?? projectKey}</h2>
          <button type="button" className="icon-btn" aria-label="Close" onClick={onClose}>×</button>
        </div>
        <div className="modal-body">
          {formMessage && <div className="form-alert" role="alert">{formMessage}</div>}
          <div className="field">
            <label htmlFor={ids.title}>Title</label>
            <input id={ids.title} className="input" name="title" autoFocus autoComplete="off" maxLength={200} placeholder="What needs to be done?" defaultValue={v.title ?? ''} {...invalid('title', ids.title)} />
            {err('title', ids.title)}
          </div>
          <div className="row">
            <div className="field">
              <label htmlFor={ids.type}>Type</label>
              <select id={ids.type} className="input" name="type" defaultValue={v.type ?? 'story'}>
                {TASK_TYPES.map((t) => <option key={t} value={t}>{TASK_TYPE_LABELS[t]}</option>)}
              </select>
            </div>
            <div className="field">
              <label htmlFor={ids.prio}>Priority</label>
              <select id={ids.prio} className="input" name="priority" defaultValue={v.priority ?? 'medium'}>
                {TASK_PRIORITIES.map((p) => <option key={p} value={p}>{TASK_PRIORITY_LABELS[p]}</option>)}
              </select>
            </div>
          </div>
          <div className="row">
            <div className="field">
              <label htmlFor={ids.who}>Assignee</label>
              <select id={ids.who} className="input" name="assigneeId" defaultValue={v.assigneeId ?? ''} {...invalid('assigneeId', ids.who)}>
                <option value="">Unassigned</option>
                {project.data?.project.members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
              </select>
              {err('assigneeId', ids.who)}
            </div>
            <div className="field">
              <label htmlFor={ids.sprint}>Sprint</label>
              {/* key: re-render with the active sprint pre-selected once sprints have loaded */}
              <select key={sprints.status} id={ids.sprint} className="input" name="sprintId" defaultValue={v.sprintId ?? active?.id ?? ''} {...invalid('sprintId', ids.sprint)}>
                <option value="">Backlog</option>
                {openSprints.map((s) => <option key={s.id} value={s.id}>{s.name}{s.status === 'active' ? ' (active)' : ''}</option>)}
              </select>
              {err('sprintId', ids.sprint)}
            </div>
          </div>
          <div className="row">
            <div className="field">
              <label htmlFor={ids.pts}>Story points</label>
              <select id={ids.pts} className="input" name="points" defaultValue={v.points ?? '3'}>
                <option value="">Not estimated</option>
                {STORY_POINTS.map((p) => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>
            <div className="field">
              <label htmlFor={ids.due}>Due date</label>
              <input id={ids.due} className="input" type="date" name="dueDate" defaultValue={v.dueDate ?? ''} {...invalid('dueDate', ids.due)} />
              {err('dueDate', ids.due)}
            </div>
          </div>
          <div className="field">
            <label htmlFor={ids.desc}>Description</label>
            <textarea id={ids.desc} className="input" name="description" rows={3} placeholder="Add details, acceptance criteria…" defaultValue={v.description ?? ''} />
          </div>
        </div>
        <div className="modal-foot">
          <button type="button" className="btn" onClick={onClose}>Cancel</button>
          <button className="btn primary" disabled={isPending}>{isPending ? 'Creating…' : 'Create task'}</button>
        </div>
      </form>
    </dialog>
  );
}

import { useId, useState, type ReactNode } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { createCommentInput, type Project, type TaskDetail, type TaskSummary } from '@taskflow/core';
import { Avatar } from '../../app/Avatar';
import { errorMessage } from '../../app/feedback';
import { Icon } from '../../app/icons';
import { toast } from '../../app/toast';
import { timeAgo } from '../../lib/dates';
import { ApiError } from '../../lib/http';
import { reloadSessionUser, useCan, useSession } from '../auth/session';
import { addComment, addSubtask, deleteComment, deleteSubtask, taskKeys, updateSubtask } from './tasks-api';

type Ctx = { project: Project; task: TaskDetail };

/** Shared mutation plumbing: the server returns the whole updated task, which replaces the cached copy. */
function useTaskItemMutation<V>(ctx: Ctx, fn: (vars: V) => Promise<{ task: TaskDetail }>, optimistic?: (task: TaskDetail, vars: V) => TaskDetail) {
  const qc = useQueryClient();
  const detailKey = taskKeys.detail(ctx.project.key, ctx.task.number);
  const listKey = taskKeys.list(ctx.project.key);
  return useMutation({
    mutationFn: fn,
    onMutate: async (vars) => {
      if (!optimistic) return { previous: undefined };
      await qc.cancelQueries({ queryKey: detailKey });
      const previous = qc.getQueryData<{ task: TaskDetail }>(detailKey);
      qc.setQueryData<{ task: TaskDetail }>(detailKey, (old) => old && { task: optimistic(old.task, vars) });
      return { previous };
    },
    onError: (err, _vars, c) => {
      if (c?.previous) qc.setQueryData(detailKey, c.previous);
      toast(errorMessage(err), 'error');
      if (err instanceof ApiError && err.status === 403) void reloadSessionUser();
    },
    onSuccess: ({ task }) => {
      qc.setQueryData(detailKey, { task });
      // keep the table's counters (subtasks done, comments) in step
      qc.setQueryData<{ tasks: TaskSummary[] }>(listKey, (old) =>
        old && { tasks: old.tasks.map((x) => (x.id === task.id ? { ...x, subtasks: task.subtasks, commentCount: task.commentCount } : x)) },
      );
    },
  });
}

/* ---------- subtasks ---------- */

export function Subtasks({ project, task, editable }: Ctx & { editable: boolean }) {
  const inputId = useId();
  const [draft, setDraft] = useState('');
  const ctx = { project, task };
  const recount = (t: TaskDetail): TaskDetail => ({ ...t, subtasks: { total: t.subtaskList.length, done: t.subtaskList.filter((s) => s.done).length } });

  const add = useTaskItemMutation(ctx, (title: string) => addSubtask(project.key, task.number, title));
  const toggle = useTaskItemMutation(ctx, (v: { id: string; done: boolean }) => updateSubtask(project.key, task.number, v.id, { done: v.done }),
    (t, v) => recount({ ...t, subtaskList: t.subtaskList.map((s) => (s.id === v.id ? { ...s, done: v.done } : s)) }));
  const remove = useTaskItemMutation(ctx, (id: string) => deleteSubtask(project.key, task.number, id),
    (t, id) => recount({ ...t, subtaskList: t.subtaskList.filter((s) => s.id !== id) }));

  const { total, done } = task.subtasks;
  const submit = () => {
    const title = draft.trim();
    if (!title) return;
    add.mutate(title, { onSuccess: () => setDraft('') });
  };

  return (
    <section aria-labelledby="subtasks-h">
      <h3 className="sub-h" id="subtasks-h">Subtasks <span className="save-ind">{total > 0 ? `${done} of ${total} done` : ''}</span></h3>
      {total > 0 && <div className="progress" aria-hidden="true"><span style={{ width: `${(done / total) * 100}%` }} /></div>}
      <ul className="subtask-list">
        {task.subtaskList.map((s) => (
          <li key={s.id} className={s.done ? 'done' : undefined}>
            <input type="checkbox" checked={s.done} disabled={!editable} aria-label={`Mark "${s.title}" as ${s.done ? 'not done' : 'done'}`}
              onChange={(e) => toggle.mutate({ id: s.id, done: e.target.checked })} />
            <span>{s.title}</span>
            {editable && (
              <button className="icon-btn sm" aria-label={`Remove subtask "${s.title}"`} title="Remove" onClick={() => remove.mutate(s.id)}>×</button>
            )}
          </li>
        ))}
        {total === 0 && <li className="muted empty-line">No subtasks yet.</li>}
      </ul>
      {editable && (
        <div className="add-line">
          <label htmlFor={inputId} className="visually-hidden">New subtask</label>
          <input id={inputId} className="input" placeholder="Add a subtask and press Enter" value={draft} maxLength={200}
            onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') submit(); }} />
          <button className="btn sm" onClick={submit} disabled={!draft.trim() || add.isPending}>{add.isPending ? 'Adding…' : 'Add'}</button>
        </div>
      )}
    </section>
  );
}

/* ---------- comments ---------- */

/** Highlights "@Name" mentions of project members (full names before first names). */
function withMentions(body: string, members: Project['members']): ReactNode[] {
  const labels = [...new Set([...members.map((m) => m.name), ...members.map((m) => m.name.split(/\s+/)[0] ?? '')])]
    .filter((l) => l.length > 1)
    .toSorted((a, b) => b.length - a.length)
    .map((l) => l.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  if (labels.length === 0) return [body];
  const re = new RegExp(`(@(?:${labels.join('|')}))(?![\\p{L}\\p{N}_])`, 'giu');
  return body.split(re).map((part, i) => (i % 2 === 1 ? <mark key={i} className="mention">{part}</mark> : part));
}

export function Comments({ project, task }: Ctx) {
  const can = useCan();
  const session = useSession();
  const meId = session.status === 'authenticated' ? session.user.id : '';
  const isAdmin = session.status === 'authenticated' && session.user.role.id === 'admin';
  const boxId = useId();
  const [draft, setDraft] = useState('');
  const [error, setError] = useState<string | null>(null);
  const ctx = { project, task };

  const add = useTaskItemMutation(ctx, (body: string) => addComment(project.key, task.number, body));
  const remove = useTaskItemMutation(ctx, (id: string) => deleteComment(project.key, task.number, id),
    (t, id) => ({ ...t, comments: t.comments.filter((c) => c.id !== id), commentCount: t.commentCount - 1 }));

  const submit = () => {
    const parsed = createCommentInput.safeParse({ body: draft });
    if (!parsed.success) return setError(parsed.error.issues[0]?.message ?? 'Write something first');
    add.mutate(parsed.data.body, { onSuccess: () => setDraft('') });
  };

  return (
    <section aria-labelledby="comments-h">
      <h3 className="sub-h" id="comments-h">Comments ({task.comments.length})</h3>
      <ul className="comment-list">
        {task.comments.map((c) => (
          <li key={c.id} className="comment">
            {c.author ? <Avatar id={c.author.id} name={c.author.name} size="sm" /> : <span className="avatar sm more" aria-hidden="true">?</span>}
            <div className="bubble">
              <div className="who">
                <b>{c.author?.name ?? 'Former member'}</b>
                <span className="muted small"><time dateTime={c.createdAt} title={new Date(c.createdAt).toLocaleString()}>{timeAgo(c.createdAt)}</time></span>
                {(c.author?.id === meId || isAdmin) && (
                  <button className="link-btn" onClick={() => remove.mutate(c.id)} aria-label={`Delete comment by ${c.author?.name ?? 'former member'}`}>Delete</button>
                )}
              </div>
              <p className="comment-body">{withMentions(c.body, project.members)}</p>
            </div>
          </li>
        ))}
        {task.comments.length === 0 && <li className="muted empty-line">No comments yet.</li>}
      </ul>
      {can('comment:create') && (
        <div className="comment new">
          {session.status === 'authenticated' && <Avatar id={session.user.id} name={session.user.name} size="sm" />}
          <div className="grow">
            <label htmlFor={boxId} className="visually-hidden">Write a comment</label>
            <textarea id={boxId} className="input" rows={2} value={draft} maxLength={5000}
              placeholder="Write a comment… use @name to mention someone in this project"
              onChange={(e) => { setDraft(e.target.value); setError(null); }}
              onKeyDown={(e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) submit(); }}
              aria-invalid={error ? true : undefined} aria-describedby={error ? `${boxId}-e` : `${boxId}-h`} />
            {error ? <div className="err" id={`${boxId}-e`}>{error}</div> : <div className="field-hint" id={`${boxId}-h`}>Ctrl + Enter to send</div>}
            <button className="btn sm primary" style={{ marginTop: 8 }} onClick={submit} disabled={add.isPending}>
              <Icon name="check" size={14} /> {add.isPending ? 'Sending…' : 'Comment'}
            </button>
          </div>
        </div>
      )}
    </section>
  );
}

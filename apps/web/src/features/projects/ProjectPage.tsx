import { useActionState, useId, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { fieldErrors, projectColorSchema, roleSummaryOf, updateProjectInput, type Project, type PublicUser } from '@taskflow/core';
import { initials } from '../../app/AppShell';
import { LoadError, SkeletonRows, errorMessage } from '../../app/feedback';
import { formText } from '../../app/forms';
import { toast } from '../../app/toast';
import { ApiError } from '../../lib/http';
import { reloadSessionUser, useCan, useSession } from '../auth/session';
import { fetchMembers, teamKeys } from '../team/team-api';
import { ColorPicker, ControlledField, TextAreaField } from './NewProjectDialog';
import { addProjectMember, deleteProject, fetchProject, projectKeys, removeProjectMember, updateProject } from './projects-api';

const onMutationError = (err: unknown) => {
  toast(errorMessage(err), 'error');
  if (err instanceof ApiError && err.status === 403) void reloadSessionUser();
};

export function ProjectPage() {
  const key = (useParams().key ?? '').toUpperCase();
  const can = useCan();
  const project = useQuery({ queryKey: projectKeys.detail(key), queryFn: ({ signal }) => fetchProject(key, signal), retry: false });

  if (project.status === 'pending') return <div className="card"><SkeletonRows rows={6} label="Loading project" /></div>;
  if (project.status === 'error') {
    if (project.error instanceof ApiError && project.error.status === 404) {
      return (
        <div className="card empty-state">
          <h2>Project not found</h2>
          <p className="muted">It may have been deleted, or you are not a member. Ask a Project Manager to add you.</p>
          <Link className="btn primary" to="/projects">All projects</Link>
        </div>
      );
    }
    return <LoadError error={project.error} onRetry={() => void project.refetch()} />;
  }

  const p = project.data.project;
  return (
    <>
      <nav className="crumbs" aria-label="Breadcrumb"><Link to="/projects">Projects</Link> <span aria-hidden="true">/</span> <span>{p.key}</span></nav>
      <div className="page-head">
        <div className="proj-top">
          <span className="proj-key lg" style={{ background: p.color }} aria-hidden="true">{p.key}</span>
          <div>
            <h1>{p.name}</h1>
            <p className="sub">{p.description || 'No description yet.'}</p>
          </div>
        </div>
      </div>
      <div className="grid-2 top">
        <MembersCard key={`members-${p.key}`} project={p} canManage={can('project:update')} />
        <div className="col-stack">
          {can('project:update') && <SettingsCard key={`settings-${p.key}`} project={p} />}
          {can('project:delete') && <DangerZone key={`danger-${p.key}`} project={p} />}
          {!can('project:update') && !can('project:delete') && (
            <section className="card"><h2 className="card-title">Project settings</h2><p className="muted">Only Project Managers and Admins can change project settings.</p></section>
          )}
        </div>
      </div>
    </>
  );
}

/* ---------- members ---------- */

function MembersCard({ project: p, canManage }: { project: Project; canManage: boolean }) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const session = useSession();
  const meId = session.status === 'authenticated' ? session.user.id : '';
  const iAmAdmin = session.status === 'authenticated' && session.user.role.id === 'admin';
  const workspace = useQuery({ queryKey: teamKeys.members, queryFn: ({ signal }) => fetchMembers(signal), enabled: canManage });
  const detailKey = projectKeys.detail(p.key);
  const selectId = useId();
  const [pick, setPick] = useState('');

  /** Optimistic edit of the cached project; returns the previous value for rollback. */
  async function patchCache(change: (proj: Project) => Project) {
    await qc.cancelQueries({ queryKey: detailKey });
    const previous = qc.getQueryData<{ project: Project }>(detailKey);
    qc.setQueryData<{ project: Project }>(detailKey, (old) => old && { project: change(old.project) });
    return { previous };
  }
  const rollback = (ctx: { previous: { project: Project } | undefined } | undefined) => {
    if (ctx?.previous) qc.setQueryData(detailKey, ctx.previous);
  };
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: detailKey });
    void qc.invalidateQueries({ queryKey: projectKeys.all });
  };

  const add = useMutation({
    mutationFn: (user: PublicUser) => addProjectMember(p.key, user.id),
    onMutate: (user) =>
      patchCache((proj) => ({ ...proj, members: [...proj.members, { id: user.id, name: user.name, email: user.email, role: roleSummaryOf(user.role.id), addedAt: new Date().toISOString() }] })),
    onError: (err, _u, ctx) => {
      rollback(ctx);
      onMutationError(err);
    },
    onSuccess: (_d, user) => toast(`${user.name} added to ${p.key}`),
    onSettled: refresh,
  });

  const remove = useMutation({
    mutationFn: (memberId: string) => removeProjectMember(p.key, memberId),
    onMutate: (memberId) => patchCache((proj) => ({ ...proj, members: proj.members.filter((m) => m.id !== memberId) })),
    onError: (err, _id, ctx) => {
      rollback(ctx);
      onMutationError(err);
    },
    onSuccess: (_d, memberId) => {
      if (memberId === meId && !iAmAdmin) {
        toast(`You left ${p.key}`);
        void navigate('/projects', { replace: true }); // no longer visible to you
      }
    },
    onSettled: refresh,
  });

  const candidates = workspace.data?.members.filter((u) => !p.members.some((m) => m.id === u.id)) ?? [];

  return (
    <section className="card table-card" aria-labelledby="pm-h">
      <div className="card-head"><h2 id="pm-h">Members</h2><span className="muted">{p.members.length}</span></div>
      {canManage && (
        <form
          className="add-member"
          onSubmit={(e) => {
            e.preventDefault();
            const user = candidates.find((u) => u.id === pick);
            if (user) add.mutate(user);
            setPick('');
          }}
        >
          <label htmlFor={selectId} className="visually-hidden">Add a member</label>
          <select id={selectId} className="input" value={pick} onChange={(e) => setPick(e.target.value)} disabled={workspace.status !== 'success' || candidates.length === 0}>
            <option value="">{workspace.status === 'pending' ? 'Loading people…' : candidates.length === 0 ? 'Everyone is already a member' : 'Add a member…'}</option>
            {candidates.map((u) => <option key={u.id} value={u.id}>{u.name} · {u.role.name}</option>)}
          </select>
          <button className="btn" disabled={!pick}>Add</button>
        </form>
      )}
      <ul className="member-list">
        {p.members.map((m) => (
          <li key={m.id}>
            <span className="avatar sm" aria-hidden="true">{initials(m.name)}</span>
            <span className="grow"><b>{m.name}</b>{m.id === meId && <span className="pill">You</span>}<span className="muted small block">{m.email} · {m.role.name}</span></span>
            {canManage && (
              <button className="btn sm danger" onClick={() => remove.mutate(m.id)} aria-label={`Remove ${m.name} from ${p.key}`}>
                {m.id === meId ? 'Leave' : 'Remove'}
              </button>
            )}
          </li>
        ))}
        {p.members.length === 0 && <li className="muted">No members. Admins can still see this project.</li>}
      </ul>
    </section>
  );
}

/* ---------- settings ---------- */

type SettingsState = { status: 'idle' } | { status: 'error'; message: string; fields: Record<string, string> };

function SettingsCard({ project: p }: { project: Project }) {
  const qc = useQueryClient();
  const [name, setName] = useState(p.name);
  const [state, formAction, isPending] = useActionState<SettingsState, FormData>(async (_prev, form) => {
    const parsed = updateProjectInput.safeParse({ name, description: formText(form.get('description')), color: formText(form.get('color')) });
    if (!parsed.success) return { status: 'error', message: 'Please fix the highlighted fields', fields: fieldErrors(parsed.error) };
    const detailKey = projectKeys.detail(p.key);
    const previous = qc.getQueryData<{ project: Project }>(detailKey);
    const color = projectColorSchema.safeParse(parsed.data.color);
    // Optimistic: the header updates immediately; restored if the save fails.
    qc.setQueryData<{ project: Project }>(detailKey, (old) => old && {
      project: { ...old.project, ...(parsed.data.name ? { name: parsed.data.name } : {}), description: parsed.data.description ?? old.project.description, ...(color.success ? { color: color.data } : {}) },
    });
    try {
      await updateProject(p.key, parsed.data);
      toast('Project settings saved');
      void qc.invalidateQueries({ queryKey: projectKeys.all });
      void qc.invalidateQueries({ queryKey: detailKey });
      return { status: 'idle' };
    } catch (err) {
      if (previous) qc.setQueryData(detailKey, previous);
      if (err instanceof ApiError && err.status === 403) void reloadSessionUser();
      return { status: 'error', message: errorMessage(err), fields: err instanceof ApiError ? err.fields : {} };
    }
  }, { status: 'idle' });

  const errors = state.status === 'error' ? state.fields : {};
  return (
    <section className="card" aria-labelledby="ps-h">
      <h2 id="ps-h" className="card-title">Settings</h2>
      {state.status === 'error' && Object.keys(errors).length === 0 && <div className="form-alert" role="alert">{state.message}</div>}
      <form action={formAction} noValidate>
        <ControlledField label="Project name" value={name} onChange={setName} error={errors.name} />
        <div className="field"><span className="label-like">Key</span><div className="key-fixed"><code>{p.key}</code> <span className="muted small">· can't be changed</span></div></div>
        <TextAreaField name="description" label="Description" defaultValue={p.description} error={errors.description} />
        <ColorPicker name="color" defaultValue={p.color} error={errors.color} />
        <button className="btn primary" disabled={isPending}>{isPending ? 'Saving…' : 'Save changes'}</button>
      </form>
    </section>
  );
}

/* ---------- delete ---------- */

function DangerZone({ project: p }: { project: Project }) {
  const [confirming, setConfirming] = useState(false);
  return (
    <section className="card danger-zone" aria-labelledby="dz-h">
      <h2 id="dz-h" className="card-title">Delete project</h2>
      <p className="muted small">Deletes {p.key} for everyone. Its sprints and tasks will be deleted too. This can't be undone.</p>
      <button className="btn danger" onClick={() => setConfirming(true)}>Delete {p.key}…</button>
      {confirming && <DeleteDialog project={p} onClose={() => setConfirming(false)} />}
    </section>
  );
}

function DeleteDialog({ project: p, onClose }: { project: Project; onClose: () => void }) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const inputId = useId();
  const [typed, setTyped] = useState('');
  const del = useMutation({
    mutationFn: () => deleteProject(p.key),
    onError: onMutationError,
    onSuccess: () => {
      qc.removeQueries({ queryKey: projectKeys.detail(p.key) });
      void qc.invalidateQueries({ queryKey: projectKeys.all });
      toast(`Project ${p.key} deleted`);
      onClose();
      void navigate('/projects', { replace: true });
    },
  });
  return (
    <dialog className="modal" aria-labelledby="del-h" onClose={onClose} ref={(el) => { if (el && !el.open) el.showModal(); }}>
      <div className="modal-head"><h2 id="del-h">Delete {p.name}?</h2><button type="button" className="icon-btn" aria-label="Close" onClick={onClose}>×</button></div>
      <div className="modal-body">
        <p style={{ marginBottom: 14 }}>This permanently deletes <b>{p.key}</b>, its members list, and later its sprints and tasks.</p>
        <div className="field">
          <label htmlFor={inputId}>Type <b>{p.key}</b> to confirm</label>
          <input id={inputId} className="input" value={typed} onChange={(e) => setTyped(e.target.value.toUpperCase())} autoComplete="off" autoFocus />
        </div>
      </div>
      <div className="modal-foot">
        <button className="btn" onClick={onClose}>Cancel</button>
        <button className="btn danger-solid" disabled={typed !== p.key || del.isPending} onClick={() => del.mutate()}>
          {del.isPending ? 'Deleting…' : 'Delete project'}
        </button>
      </div>
    </dialog>
  );
}

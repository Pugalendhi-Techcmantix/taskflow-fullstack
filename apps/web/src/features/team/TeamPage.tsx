import { useActionState, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ADMIN_ROLE,
  ROLE_IDS,
  ROLE_NAMES,
  createInviteInput,
  fieldErrors,
  roleIdSchema,
  roleSummaryOf,
  type Invite,
  type MembersResponse,
  type PermissionKey,
  type PublicUser,
  type RoleId,
  type RolesResponse,
} from '@taskflow/core';
import { LoadError, SkeletonRows, errorMessage } from '../../app/feedback';
import { Field, SelectField, formText } from '../../app/forms';
import { initials } from '../../app/AppShell';
import { toast } from '../../app/toast';
import { ApiError } from '../../lib/http';
import { reloadSessionUser, useCan, useSession } from '../auth/session';
import {
  cancelInvite,
  changeMemberRole,
  createInvite,
  fetchInvites,
  fetchMembers,
  fetchRoles,
  resendInvite,
  setPermission,
  teamKeys,
} from './team-api';

const shortDate = (iso: string) => new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

/** A 403 means our permissions changed under us: re-read them so the UI matches what the server allows. */
function onMutationError(err: unknown) {
  toast(errorMessage(err), 'error');
  if (err instanceof ApiError && err.status === 403) void reloadSessionUser();
}

export function TeamPage() {
  const can = useCan();
  const session = useSession();
  const [inviting, setInviting] = useState(false);
  const meId = session.status === 'authenticated' ? session.user.id : '';
  const canManageUsers = can('user:manage');
  const canManageRoles = can('role:manage');

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Team & roles</h1>
          <p className="sub">Manage members, roles and permissions</p>
        </div>
        {canManageUsers && (
          <button className="btn primary" onClick={() => setInviting(true)}>+ Invite member</button>
        )}
      </div>
      {!canManageUsers && !canManageRoles && (
        <div className="note" role="note">You have view-only access to this page. An Admin can change your role.</div>
      )}

      <MembersCard meId={meId} canManage={canManageUsers} />
      {canManageUsers && <InvitesCard />}
      <PermissionMatrix canManage={canManageRoles} myRole={session.status === 'authenticated' ? session.user.role.id : null} />

      {inviting && <InviteDialog onClose={() => setInviting(false)} />}
    </>
  );
}

/* ---------- members ---------- */

function MembersCard({ meId, canManage }: { meId: string; canManage: boolean }) {
  const qc = useQueryClient();
  const members = useQuery({ queryKey: teamKeys.members, queryFn: ({ signal }) => fetchMembers(signal) });

  const changeRole = useMutation({
    mutationFn: ({ member, roleId }: { member: PublicUser; roleId: RoleId }) => changeMemberRole(member.id, roleId),
    // Optimistic: the dropdown shows the new role at once; it snaps back if the server refuses.
    onMutate: async ({ member, roleId }) => {
      await qc.cancelQueries({ queryKey: teamKeys.members });
      const previous = qc.getQueryData<MembersResponse>(teamKeys.members);
      qc.setQueryData<MembersResponse>(teamKeys.members, (old) =>
        old && { members: old.members.map((m) => (m.id === member.id ? { ...m, role: roleSummaryOf(roleId) } : m)) },
      );
      return { previous };
    },
    onError: (err, _vars, ctx) => {
      if (ctx?.previous) qc.setQueryData(teamKeys.members, ctx.previous);
      onMutationError(err);
    },
    onSuccess: ({ member }) => toast(`${member.name} is now ${member.role.name}`),
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: teamKeys.members });
      void qc.invalidateQueries({ queryKey: teamKeys.roles }); // member counts
    },
  });

  return (
    <section className="card table-card" aria-labelledby="members-h">
      <div className="card-head">
        <h2 id="members-h">Members</h2>
        {members.status === 'success' && <span className="muted">{members.data.members.length} people</span>}
      </div>
      {members.status === 'pending' && <div className="pad"><SkeletonRows label="Loading members" /></div>}
      {members.status === 'error' && <div className="pad"><LoadError error={members.error} onRetry={() => void members.refetch()} /></div>}
      {members.status === 'success' && (
        <div className="table-scroll">
          <table>
            <thead>
              <tr><th scope="col">Name</th><th scope="col">Email</th><th scope="col">Role</th><th scope="col" className="hide-md">Joined</th></tr>
            </thead>
            <tbody>
              {members.data.members.map((m) => {
                const isMe = m.id === meId;
                return (
                  <tr key={m.id}>
                    <td>
                      <span className="who">
                        <span className="avatar sm" aria-hidden="true">{initials(m.name)}</span>
                        <b>{m.name}</b>
                        {isMe && <span className="pill">You</span>}
                      </span>
                    </td>
                    <td className="muted">{m.email}</td>
                    <td>
                      <select
                        className="input compact"
                        aria-label={`Role for ${m.name}`}
                        value={m.role.id}
                        disabled={!canManage || isMe}
                        title={isMe ? "You can't change your own role" : undefined}
                        onChange={(e) => {
                          const roleId = roleIdSchema.safeParse(e.target.value);
                          if (roleId.success) changeRole.mutate({ member: m, roleId: roleId.data });
                        }}
                      >
                        {ROLE_IDS.map((r) => <option key={r} value={r}>{ROLE_NAMES[r]}</option>)}
                      </select>
                    </td>
                    <td className="muted nowrap hide-md">{shortDate(m.createdAt)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

/* ---------- pending invites ---------- */

function InvitesCard() {
  const qc = useQueryClient();
  const invites = useQuery({ queryKey: teamKeys.invites, queryFn: ({ signal }) => fetchInvites(signal) });

  const cancel = useMutation({
    mutationFn: (invite: Invite) => cancelInvite(invite.id),
    onMutate: async (invite) => {
      await qc.cancelQueries({ queryKey: teamKeys.invites });
      const previous = qc.getQueryData<{ invites: Invite[] }>(teamKeys.invites);
      qc.setQueryData<{ invites: Invite[] }>(teamKeys.invites, (old) => old && { invites: old.invites.filter((i) => i.id !== invite.id) });
      return { previous };
    },
    onError: (err, _invite, ctx) => {
      if (ctx?.previous) qc.setQueryData(teamKeys.invites, ctx.previous);
      onMutationError(err);
    },
    onSuccess: (_data, invite) => toast(`Invite for ${invite.email} cancelled`),
    onSettled: () => void qc.invalidateQueries({ queryKey: teamKeys.invites }),
  });

  const resend = useMutation({
    mutationFn: (invite: Invite) => resendInvite(invite.id),
    onError: onMutationError,
    onSuccess: ({ invite }) => toast(`New invite link sent to ${invite.email}`),
    onSettled: () => void qc.invalidateQueries({ queryKey: teamKeys.invites }),
  });

  return (
    <section className="card table-card" aria-labelledby="invites-h">
      <div className="card-head">
        <h2 id="invites-h">Pending invites</h2>
        {invites.status === 'success' && <span className="muted">{invites.data.invites.length}</span>}
      </div>
      {invites.status === 'pending' && <div className="pad"><SkeletonRows rows={2} label="Loading invites" /></div>}
      {invites.status === 'error' && <div className="pad"><LoadError error={invites.error} onRetry={() => void invites.refetch()} /></div>}
      {invites.status === 'success' && invites.data.invites.length === 0 && (
        <p className="pad muted">No pending invites. Use “Invite member” to add someone to the team.</p>
      )}
      {invites.status === 'success' && invites.data.invites.length > 0 && (
        <div className="table-scroll">
          <table>
            <thead>
              <tr><th scope="col">Email</th><th scope="col">Role</th><th scope="col">Invited by</th><th scope="col">Expires</th><th scope="col"><span className="visually-hidden">Actions</span></th></tr>
            </thead>
            <tbody>
              {invites.data.invites.map((i) => (
                <tr key={i.id}>
                  <td><b>{i.email}</b></td>
                  <td>{i.role.name}</td>
                  <td className="muted">{i.invitedBy.name}</td>
                  <td className="muted nowrap">{shortDate(i.expiresAt)}</td>
                  <td className="actions">
                    <button className="btn sm" disabled={resend.isPending && resend.variables.id === i.id} onClick={() => resend.mutate(i)}>
                      {resend.isPending && resend.variables.id === i.id ? 'Sending…' : 'Resend'}
                    </button>
                    <button className="btn sm danger" onClick={() => cancel.mutate(i)}>Cancel</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

/* ---------- permission matrix ---------- */

function PermissionMatrix({ canManage, myRole }: { canManage: boolean; myRole: RoleId | null }) {
  const qc = useQueryClient();
  const roles = useQuery({ queryKey: teamKeys.roles, queryFn: ({ signal }) => fetchRoles(signal) });

  const toggle = useMutation({
    mutationFn: ({ roleId, key, granted }: { roleId: RoleId; key: PermissionKey; granted: boolean }) => setPermission(roleId, key, granted),
    onMutate: async ({ roleId, key, granted }) => {
      await qc.cancelQueries({ queryKey: teamKeys.roles });
      const previous = qc.getQueryData<RolesResponse>(teamKeys.roles);
      qc.setQueryData<RolesResponse>(teamKeys.roles, (old) =>
        old && {
          ...old,
          roles: old.roles.map((r) =>
            r.id !== roleId ? r : { ...r, permissions: granted ? [...r.permissions, key] : r.permissions.filter((p) => p !== key) },
          ),
        },
      );
      return { previous };
    },
    onError: (err, _vars, ctx) => {
      if (ctx?.previous) qc.setQueryData(teamKeys.roles, ctx.previous);
      onMutationError(err);
    },
    onSuccess: (_data, { roleId }) => {
      if (roleId === myRole) void reloadSessionUser(); // my own abilities changed
    },
    onSettled: () => void qc.invalidateQueries({ queryKey: teamKeys.roles }),
  });

  return (
    <section className="card table-card" aria-labelledby="matrix-h">
      <div className="card-head">
        <h2 id="matrix-h">Permission matrix</h2>
        <span className="muted small">{canManage ? 'Changes save instantly · Admin always has every permission' : 'Read-only for your role'}</span>
      </div>
      {roles.status === 'pending' && <div className="pad"><SkeletonRows rows={6} label="Loading permissions" /></div>}
      {roles.status === 'error' && <div className="pad"><LoadError error={roles.error} onRetry={() => void roles.refetch()} /></div>}
      {roles.status === 'success' && (
        <div className="table-scroll">
          <table className="matrix">
            <thead>
              <tr>
                <th scope="col">Permission</th>
                {roles.data.roles.map((r) => (
                  <th scope="col" key={r.id}>{r.name}<div className="perm-code">{r.memberCount} {r.memberCount === 1 ? 'member' : 'members'}</div></th>
                ))}
              </tr>
            </thead>
            <tbody>
              {roles.data.permissions.map((p) => (
                <tr key={p.key}>
                  <th scope="row"><div className="perm-label">{p.label}</div><div className="perm-code">{p.key}</div></th>
                  {roles.data.roles.map((r) => (
                    <td key={r.id}>
                      <input
                        type="checkbox"
                        aria-label={`${p.label} — ${r.name}`}
                        checked={r.permissions.includes(p.key)}
                        disabled={!canManage || r.id === ADMIN_ROLE}
                        onChange={(e) => toggle.mutate({ roleId: r.id, key: p.key, granted: e.target.checked })}
                      />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

/* ---------- invite dialog ---------- */

type InviteFormState =
  | { status: 'idle' }
  | { status: 'error'; message: string; fields: Record<string, string>; values: { email: string; roleId: string } };

function InviteDialog({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const [state, formAction, isPending] = useActionState<InviteFormState, FormData>(async (_prev, form) => {
    const values = { email: formText(form.get('email')), roleId: formText(form.get('roleId')) };
    const parsed = createInviteInput.safeParse(values);
    if (!parsed.success) return { status: 'error', message: 'Please fix the highlighted fields', fields: fieldErrors(parsed.error), values };
    try {
      const { invite } = await createInvite(parsed.data);
      void qc.invalidateQueries({ queryKey: teamKeys.invites });
      toast(`Invite sent to ${invite.email}`);
      onClose();
      return { status: 'idle' };
    } catch (err) {
      if (err instanceof ApiError && err.status === 403) void reloadSessionUser();
      return { status: 'error', message: errorMessage(err), fields: err instanceof ApiError ? err.fields : {}, values };
    }
  }, { status: 'idle' });

  const errors = state.status === 'error' ? state.fields : {};
  const values = state.status === 'error' ? state.values : { email: '', roleId: 'developer' };
  const formMessage = state.status === 'error' && Object.keys(state.fields).length === 0 ? state.message : null;

  return (
    // Native modal dialog: focus is trapped inside, Escape closes it, the page behind is inert.
    <dialog className="modal" aria-labelledby="invite-h" onClose={onClose} ref={(el) => { if (el && !el.open) el.showModal(); }}>
      <form action={formAction} noValidate>
        <div className="modal-head">
          <h2 id="invite-h">Invite member</h2>
          <button type="button" className="icon-btn" aria-label="Close" onClick={onClose}>×</button>
        </div>
        <div className="modal-body">
          <p className="muted small" style={{ marginBottom: 14 }}>They'll get an email with a link to join TaskFlow and set a password.</p>
          {formMessage && <div className="form-alert" role="alert">{formMessage}</div>}
          <Field name="email" label="Email" type="email" autoComplete="off" defaultValue={values.email} error={errors.email} autoFocus />
          <SelectField name="roleId" label="Role" defaultValue={values.roleId} error={errors.roleId}>
            {ROLE_IDS.map((r) => <option key={r} value={r}>{ROLE_NAMES[r]}</option>)}
          </SelectField>
        </div>
        <div className="modal-foot">
          <button type="button" className="btn" onClick={onClose}>Cancel</button>
          <button className="btn primary" disabled={isPending}>{isPending ? 'Sending…' : 'Send invite'}</button>
        </div>
      </form>
    </dialog>
  );
}

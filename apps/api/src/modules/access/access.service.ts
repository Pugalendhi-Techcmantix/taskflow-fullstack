import { createHash, randomBytes } from 'node:crypto';
import {
  ADMIN_ROLE,
  ERROR_CODES,
  PERMISSION_KEYS,
  PERMISSION_LABELS,
  ROLE_NAMES,
  roleSummaryOf,
  type AcceptInviteInput,
  type CreateInviteInput,
  type Invite,
  type InvitePreview,
  type PermissionKey,
  type RoleId,
  type RolesResponse,
} from '@taskflow/core';
import type { EmailSender } from '../../email/email-sender';
import { AppError, conflict, notFoundError, unauthorized } from '../../http/errors';
import type { Repositories } from '../../repositories';
import type { ActivityRecorder } from '../activity/activity.service';
import type { UserRecord } from '../auth/auth.repository';
import { isOpen, type InviteRecord } from './access.repository';
import { inviteEmail } from './invite-email';

export type AccessConfig = {
  /** Public URL of the web app, used to build invite links. */
  appUrl: string;
  inviteTtlDays: number;
};

export type AccessDeps = {
  repos: Pick<Repositories, 'users' | 'roles' | 'invites' | 'tasks'>;
  email: EmailSender;
  hashPassword: (password: string) => Promise<string>;
  config: AccessConfig;
  activity: ActivityRecorder;
  now?: () => Date;
};

const DAY_MS = 86_400_000;
const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');
const invalidInvite = () => notFoundError('This invite link is invalid, already used or expired.');

export const toInvite = (i: InviteRecord): Invite => ({
  id: i.id,
  email: i.email,
  role: roleSummaryOf(i.roleId),
  invitedBy: i.invitedBy,
  createdAt: i.createdAt.toISOString(),
  expiresAt: i.expiresAt.toISOString(),
});

export type AccessService = ReturnType<typeof createAccessService>;

export function createAccessService({ repos, email, hashPassword, config, activity, now = () => new Date() }: AccessDeps) {
  const { users, roles, invites } = repos;

  /* ---------- permissions ---------- */

  /** The Admin role always has everything, whatever the table says. */
  async function permissionsOf(roleId: RoleId): Promise<PermissionKey[]> {
    return roleId === ADMIN_ROLE ? [...PERMISSION_KEYS] : roles.permissionsOf(roleId);
  }

  /** Looked up on every request, so a permission change applies immediately. */
  async function userWithPermissions(userId: string): Promise<{ user: UserRecord; permissions: PermissionKey[] }> {
    const user = await users.findById(userId);
    if (!user) throw unauthorized(); // account no longer exists
    return { user, permissions: await permissionsOf(user.roleId) };
  }

  async function listRoles(): Promise<RolesResponse> {
    const list = await roles.list();
    return {
      roles: list.map((r) => ({
        id: r.id,
        name: ROLE_NAMES[r.id],
        permissions: r.id === ADMIN_ROLE ? [...PERMISSION_KEYS] : r.permissions,
        memberCount: r.memberCount,
      })),
      permissions: PERMISSION_KEYS.map((key) => ({ key, label: PERMISSION_LABELS[key] })),
    };
  }

  async function setPermission(actorId: string, roleId: RoleId, key: PermissionKey, granted: boolean) {
    if (roleId === ADMIN_ROLE) throw conflict('The Admin role always has every permission.');
    const had = (await roles.permissionsOf(roleId)).includes(key);
    await roles.setPermission(roleId, key, granted);
    if (had !== granted) await activity.record({ actorId, event: { action: 'user.permission_changed', role: roleId, permission: key, granted } });
    const updated = (await listRoles()).roles.find((r) => r.id === roleId);
    if (!updated) throw notFoundError('Role not found');
    return updated;
  }

  /* ---------- members ---------- */

  /** Every member with their number of unfinished assigned tasks (Team page "Open tasks"). */
  async function listMembers(): Promise<{ user: UserRecord; openTasks: number }[]> {
    const [list, open] = await Promise.all([users.list(), repos.tasks.countOpenByAssignee()]);
    return list.map((user) => ({ user, openTasks: open.get(user.id) ?? 0 }));
  }

  async function changeRole(actorId: string, targetId: string, roleId: RoleId): Promise<UserRecord> {
    if (actorId === targetId) throw conflict("You can't change your own role. Ask another Admin.");
    const before = await users.findById(targetId);
    const result = await users.changeRole(targetId, roleId);
    if (result === 'not_found') throw notFoundError('Member not found');
    if (result === 'last_admin') throw conflict('TaskFlow needs at least one Admin. Make someone else Admin first.');
    const user = await users.findById(targetId);
    if (!user) throw notFoundError('Member not found');
    if (before && before.roleId !== user.roleId) {
      await activity.record({ actorId, event: { action: 'user.role_changed', member: user.name, from: before.roleId, to: user.roleId } });
    }
    return user;
  }

  /* ---------- invites ---------- */

  const newToken = () => {
    const token = randomBytes(32).toString('base64url');
    return { token, tokenHash: hashToken(token), expiresAt: new Date(now().getTime() + config.inviteTtlDays * DAY_MS) };
  };
  const linkFor = (token: string) => `${config.appUrl.replace(/\/+$/, '')}/invite/${token}`;

  async function sendInviteEmail(invite: InviteRecord, token: string) {
    try {
      await email.send(
        inviteEmail({
          to: invite.email,
          inviterName: invite.invitedBy.name,
          roleName: ROLE_NAMES[invite.roleId],
          link: linkFor(token),
          expiresAt: invite.expiresAt,
        }),
      );
    } catch {
      // Don't leave a pending invite that nobody received.
      await invites.revoke(invite.id, now());
      throw new AppError(502, ERROR_CODES.emailFailed, "Couldn't send the invite email. Check the email settings and try again.");
    }
  }

  async function createInvite(actorId: string, input: CreateInviteInput): Promise<Invite> {
    if (await users.findByEmail(input.email)) {
      throw conflict('This person is already a member', { email: 'This person is already a member' });
    }
    const { token, tokenHash, expiresAt } = newToken();
    const invite = await invites.replaceOpen({ email: input.email, roleId: input.roleId, tokenHash, invitedById: actorId, expiresAt }, now());
    await sendInviteEmail(invite, token);
    await activity.record({ actorId, event: { action: 'user.invited', email: invite.email, role: invite.roleId } });
    return toInvite(invite);
  }

  async function listInvites(): Promise<Invite[]> {
    return (await invites.listOpen(now())).map(toInvite);
  }

  async function revokeInvite(actorId: string, id: string): Promise<void> {
    const invite = await invites.findById(id);
    if (!invite || !(await invites.revoke(id, now()))) throw notFoundError('Invite not found or already used');
    await activity.record({ actorId, event: { action: 'user.invite_revoked', email: invite.email } });
  }

  /** Sends a fresh link; the previous link stops working. */
  async function resendInvite(actorId: string, id: string): Promise<Invite> {
    const { token, tokenHash, expiresAt } = newToken();
    const invite = await invites.renew(id, now(), tokenHash, expiresAt);
    if (!invite) throw notFoundError('Invite not found, already used or expired');
    await sendInviteEmail(invite, token);
    await activity.record({ actorId, event: { action: 'user.invite_resent', email: invite.email } });
    return toInvite(invite);
  }

  async function openInviteByToken(token: string): Promise<InviteRecord> {
    const invite = await invites.findByTokenHash(hashToken(token));
    if (!invite || !isOpen(invite, now())) throw invalidInvite();
    return invite;
  }

  async function previewInvite(token: string): Promise<InvitePreview> {
    const invite = await openInviteByToken(token);
    return {
      email: invite.email,
      role: roleSummaryOf(invite.roleId),
      invitedByName: invite.invitedBy.name,
      expiresAt: invite.expiresAt.toISOString(),
    };
  }

  /** Creates the account (with the invite's email and role). The caller signs the person in. */
  async function acceptInvite(token: string, input: AcceptInviteInput): Promise<UserRecord> {
    const invite = await openInviteByToken(token);
    const result = await invites.accept(invite.id, now(), {
      name: input.name,
      email: invite.email,
      passwordHash: await hashPassword(input.password),
    });
    if (result === 'unavailable') throw invalidInvite();
    if (result === 'email_taken') throw conflict('An account with this email already exists. Sign in instead.');
    await activity.record({ actorId: result.id, event: { action: 'user.joined', via: 'invite', role: result.roleId } });
    return result;
  }

  return {
    permissionsOf,
    userWithPermissions,
    listRoles,
    setPermission,
    listMembers,
    changeRole,
    createInvite,
    listInvites,
    revokeInvite,
    resendInvite,
    previewInvite,
    acceptInvite,
  };
}

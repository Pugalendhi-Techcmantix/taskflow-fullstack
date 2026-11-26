import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { authResponse, invitePreview, inviteResponse, invitesResponse, membersResponse, rolesResponse, sessionUser } from '@taskflow/core';
import { createTestApp } from './support/test-app';

let t: ReturnType<typeof createTestApp>;
beforeEach(() => {
  t = createTestApp();
});
const api = () => request(t.app);

describe('sign-up roles', () => {
  it('makes the first account Admin and later sign-ups Viewer', async () => {
    const first = await api().post('/api/auth/register').send({ name: 'First Person', email: 'first@example.com', password: 'password-123' });
    const second = await api().post('/api/auth/register').send({ name: 'Second Person', email: 'second@example.com', password: 'password-123' });
    expect(authResponse.parse(first.body).user.role.id).toBe('admin');
    expect(authResponse.parse(first.body).permissions).toHaveLength(11);
    expect(authResponse.parse(second.body).user.role.id).toBe('viewer');
    expect(authResponse.parse(second.body).permissions).toEqual([]);
  });

  it('returns the role and permissions from /me', async () => {
    const admin = await t.signUp('Ada Admin');
    const res = await api().get('/api/auth/me').set(admin.auth);
    const me = sessionUser.parse(res.body);
    expect(me.user.role).toEqual({ id: 'admin', name: 'Admin' });
    expect(me.permissions).toContain('role:manage');
  });
});

describe('GET /api/roles', () => {
  it('needs a signed-in user', async () => {
    expect((await api().get('/api/roles')).status).toBe(401);
  });

  it('lists the 4 roles with the default permission matrix and member counts', async () => {
    const admin = await t.signUp('Ada Admin');
    await t.signUp('Vic Viewer');
    const body = rolesResponse.parse((await api().get('/api/roles').set(admin.auth)).body);
    expect(body.roles.map((r) => [r.id, r.permissions.length, r.memberCount])).toEqual([
      ['admin', 11, 1],
      ['project_manager', 8, 0],
      ['developer', 4, 0],
      ['viewer', 0, 1],
    ]);
    expect(body.permissions).toHaveLength(11);
  });
});

describe('PUT /api/roles/:roleId/permissions/:key', () => {
  it('lets a role:manage holder grant and revoke, and the change applies on the next request', async () => {
    const admin = await t.signUp('Ada Admin');
    const viewer = await t.signUp('Vic Viewer');

    // Viewer can't list invites yet
    expect((await api().get('/api/invites').set(viewer.auth)).status).toBe(403);

    const grant = await api().put('/api/roles/viewer/permissions/user:manage').set(admin.auth).send({ granted: true });
    expect(grant.status).toBe(200);
    expect(grant.body.role.permissions).toEqual(['user:manage']);
    // Same access token, no re-login: the permission is checked live
    expect((await api().get('/api/invites').set(viewer.auth)).status).toBe(200);

    const revoke = await api().put('/api/roles/viewer/permissions/user:manage').set(admin.auth).send({ granted: false });
    expect(revoke.body.role.permissions).toEqual([]);
    expect((await api().get('/api/invites').set(viewer.auth)).status).toBe(403);
  });

  it('refuses to change the Admin role', async () => {
    const admin = await t.signUp('Ada Admin');
    const res = await api().put('/api/roles/admin/permissions/task:move').set(admin.auth).send({ granted: false });
    expect(res.status).toBe(409);
  });

  it('is forbidden without role:manage', async () => {
    await t.signUp('Ada Admin');
    const pm = await t.signUp('Pat Manager', 'project_manager');
    const res = await api().put('/api/roles/developer/permissions/task:delete').set(pm.auth).send({ granted: true });
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
  });

  it('rejects unknown roles, unknown permissions and bad bodies', async () => {
    const admin = await t.signUp('Ada Admin');
    expect((await api().put('/api/roles/boss/permissions/task:move').set(admin.auth).send({ granted: true })).status).toBe(400);
    expect((await api().put('/api/roles/viewer/permissions/fly:away').set(admin.auth).send({ granted: true })).status).toBe(400);
    expect((await api().put('/api/roles/viewer/permissions/task:move').set(admin.auth).send({ granted: 'yes' })).status).toBe(400);
  });
});

describe('members', () => {
  it('lists members (any signed-in user) without exposing password hashes', async () => {
    await t.signUp('Ada Admin');
    const viewer = await t.signUp('Vic Viewer');
    const res = await api().get('/api/members').set(viewer.auth);
    const body = membersResponse.parse(res.body);
    expect(body.members.map((m) => m.role.id)).toEqual(['admin', 'viewer']);
    expect(JSON.stringify(res.body)).not.toMatch(/password/i);
  });

  it('lets an Admin change a member role', async () => {
    const admin = await t.signUp('Ada Admin');
    const viewer = await t.signUp('Vic Viewer');
    const res = await api().patch(`/api/members/${viewer.id}/role`).set(admin.auth).send({ roleId: 'developer' });
    expect(res.status).toBe(200);
    expect(res.body.member.role).toEqual({ id: 'developer', name: 'Developer' });
  });

  it('does not let anyone change their own role', async () => {
    const admin = await t.signUp('Ada Admin');
    const res = await api().patch(`/api/members/${admin.id}/role`).set(admin.auth).send({ roleId: 'viewer' });
    expect(res.status).toBe(409);
  });

  it('never removes the last Admin', async () => {
    const admin = await t.signUp('Ada Admin');
    const helper = await t.signUp('Hal Helper');
    // Give a non-admin the user:manage permission so they can try to demote the only Admin
    await api().put('/api/roles/viewer/permissions/user:manage').set(admin.auth).send({ granted: true });
    const res = await api().patch(`/api/members/${admin.id}/role`).set(helper.auth).send({ roleId: 'viewer' });
    expect(res.status).toBe(409);
    expect(res.body.error.message).toMatch(/at least one Admin/);
  });

  it('is forbidden for a Viewer, 404 for an unknown member, 400 for a bad id or role', async () => {
    const admin = await t.signUp('Ada Admin');
    const viewer = await t.signUp('Vic Viewer');
    expect((await api().patch(`/api/members/${admin.id}/role`).set(viewer.auth).send({ roleId: 'viewer' })).status).toBe(403);
    expect((await api().patch('/api/members/0190c6a4-0000-7000-8000-000000000000/role').set(admin.auth).send({ roleId: 'viewer' })).status).toBe(404);
    expect((await api().patch('/api/members/not-a-uuid/role').set(admin.auth).send({ roleId: 'viewer' })).status).toBe(400);
    expect((await api().patch(`/api/members/${viewer.id}/role`).set(admin.auth).send({ roleId: 'king' })).status).toBe(400);
  });
});

describe('invites', () => {
  it('emails an invite link; the person signs up from it with the invited role', async () => {
    const admin = await t.signUp('Ada Admin');
    const created = await api().post('/api/invites').set(admin.auth).send({ email: 'New.Dev@Example.com', roleId: 'developer' });
    expect(created.status).toBe(201);
    const { invite } = inviteResponse.parse(created.body);
    expect(invite).toMatchObject({ email: 'new.dev@example.com', role: { id: 'developer' }, invitedBy: { name: 'Ada Admin' } });

    expect(t.outbox).toHaveLength(1);
    expect(t.outbox[0]?.to).toBe('new.dev@example.com');
    expect(t.outbox[0]?.subject).toBe('Ada Admin invited you to TaskFlow');
    const token = t.lastInviteToken();
    expect(t.store.invites[0]?.tokenHash).not.toBe(token); // only a hash is stored

    const preview = invitePreview.parse((await api().get(`/api/auth/invites/${token}`)).body);
    expect(preview).toMatchObject({ email: 'new.dev@example.com', role: { id: 'developer' }, invitedByName: 'Ada Admin' });

    const accepted = await api().post(`/api/auth/invites/${token}/accept`).send({ name: 'Dana Dev', password: 'password-123' });
    expect(accepted.status).toBe(201);
    const session = authResponse.parse(accepted.body);
    expect(session.user).toMatchObject({ name: 'Dana Dev', email: 'new.dev@example.com', role: { id: 'developer' } });
    expect(session.permissions).toContain('task:move');
    expect(String(accepted.headers['set-cookie'])).toContain('tf_refresh=');

    // single use
    expect((await api().post(`/api/auth/invites/${token}/accept`).send({ name: 'Dana Again', password: 'password-123' })).status).toBe(404);
    expect(invitesResponse.parse((await api().get('/api/invites').set(admin.auth)).body).invites).toEqual([]);
  });

  it('refuses to invite an existing member', async () => {
    const admin = await t.signUp('Ada Admin');
    const viewer = await t.signUp('Vic Viewer');
    const res = await api().post('/api/invites').set(admin.auth).send({ email: viewer.email, roleId: 'developer' });
    expect(res.status).toBe(409);
    expect(res.body.error.fields.email).toBe('This person is already a member');
    expect(t.outbox).toHaveLength(0);
  });

  it('inviting the same email again replaces the old link', async () => {
    const admin = await t.signUp('Ada Admin');
    await api().post('/api/invites').set(admin.auth).send({ email: 'x@example.com', roleId: 'viewer' });
    const oldToken = t.lastInviteToken();
    await api().post('/api/invites').set(admin.auth).send({ email: 'x@example.com', roleId: 'developer' });
    expect((await api().get(`/api/auth/invites/${oldToken}`)).status).toBe(404);
    const list = invitesResponse.parse((await api().get('/api/invites').set(admin.auth)).body).invites;
    expect(list.map((i) => i.role.id)).toEqual(['developer']);
  });

  it('resend sends a new link and kills the old one', async () => {
    const admin = await t.signUp('Ada Admin');
    const { invite } = inviteResponse.parse((await api().post('/api/invites').set(admin.auth).send({ email: 'x@example.com', roleId: 'viewer' })).body);
    const oldToken = t.lastInviteToken();
    expect((await api().post(`/api/invites/${invite.id}/resend`).set(admin.auth)).status).toBe(200);
    expect(t.outbox).toHaveLength(2);
    expect((await api().get(`/api/auth/invites/${oldToken}`)).status).toBe(404);
    expect((await api().get(`/api/auth/invites/${t.lastInviteToken()}`)).status).toBe(200);
  });

  it('cancelled and expired invites stop working', async () => {
    const admin = await t.signUp('Ada Admin');
    const { invite } = inviteResponse.parse((await api().post('/api/invites').set(admin.auth).send({ email: 'a@example.com', roleId: 'viewer' })).body);
    const cancelledToken = t.lastInviteToken();
    expect((await api().delete(`/api/invites/${invite.id}`).set(admin.auth)).status).toBe(204);
    expect((await api().get(`/api/auth/invites/${cancelledToken}`)).status).toBe(404);
    expect((await api().delete(`/api/invites/${invite.id}`).set(admin.auth)).status).toBe(404);

    await api().post('/api/invites').set(admin.auth).send({ email: 'b@example.com', roleId: 'viewer' });
    const expiringToken = t.lastInviteToken();
    t.clock.advance(8 * 86_400_000); // past the 7-day lifetime
    expect((await api().post(`/api/auth/invites/${expiringToken}/accept`).send({ name: 'Bo Late', password: 'password-123' })).status).toBe(404);
    expect(invitesResponse.parse((await api().get('/api/invites').set(admin.auth)).body).invites).toEqual([]);
  });

  it('does not keep an invite when the email could not be sent', async () => {
    const admin = await t.signUp('Ada Admin');
    t.mail.failNext = true;
    const res = await api().post('/api/invites').set(admin.auth).send({ email: 'x@example.com', roleId: 'viewer' });
    expect(res.status).toBe(502);
    expect(res.body.error.code).toBe('EMAIL_FAILED');
    expect(invitesResponse.parse((await api().get('/api/invites').set(admin.auth)).body).invites).toEqual([]);
  });

  it('is forbidden without user:manage and validates input', async () => {
    const admin = await t.signUp('Ada Admin');
    const dev = await t.signUp('Dev Person', 'developer');
    expect((await api().post('/api/invites').set(dev.auth).send({ email: 'x@example.com', roleId: 'viewer' })).status).toBe(403);
    expect((await api().get('/api/invites').set(dev.auth)).status).toBe(403);
    expect((await api().post('/api/invites').send({ email: 'x@example.com', roleId: 'viewer' })).status).toBe(401);
    const bad = await api().post('/api/invites').set(admin.auth).send({ email: 'nope', roleId: 'boss' });
    expect(bad.status).toBe(400);
    expect(Object.keys(bad.body.error.fields).sort()).toEqual(['email', 'roleId']);
  });

  it('rejects garbage invite tokens and invalid sign-up details', async () => {
    const admin = await t.signUp('Ada Admin');
    expect((await api().get('/api/auth/invites/this-token-does-not-exist-at-all')).status).toBe(404);
    expect((await api().get('/api/auth/invites/short')).status).toBe(400);
    await api().post('/api/invites').set(admin.auth).send({ email: 'x@example.com', roleId: 'viewer' });
    const res = await api().post(`/api/auth/invites/${t.lastInviteToken()}/accept`).send({ name: 'X', password: '123' });
    expect(res.status).toBe(400);
    expect(Object.keys(res.body.error.fields).sort()).toEqual(['name', 'password']);
  });
});

import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { activityPageResponse, inviteResponse, sprintResponse, taskHistoryResponse, taskResponse, type ActivityEntry } from '@taskflow/core';
import { createTestApp } from './support/test-app';

let t: ReturnType<typeof createTestApp>;
beforeEach(() => {
  t = createTestApp();
});
afterEach(() => {
  vi.restoreAllMocks();
});
const api = () => request(t.app);
type Auth = Record<string, string>;

/** Admin; a PM who owns TF; a Developer member; a Developer outsider. Each step is 1 s apart (stable order). */
async function setup() {
  const admin = await t.signUp('Ada Admin');
  const pm = await t.signUp('Pat Manager', 'project_manager');
  const dev = await t.signUp('Dev Member', 'developer');
  const outsider = await t.signUp('Out Sider', 'developer');
  await api().post('/api/projects').set(pm.auth).send({ name: 'TaskFlow Web', key: 'TF', color: '#4f46e5' });
  await api().post('/api/projects/TF/members').set(pm.auth).send({ userId: dev.id });
  return { admin, pm, dev, outsider };
}
const tick = () => t.clock.advance(1000);
const newTask = async (auth: Auth, body: object = { title: 'Login page' }) => {
  tick();
  return taskResponse.parse((await api().post('/api/projects/TF/tasks').set(auth).send(body)).body).task;
};
const timeline = async (auth: Auth, query = '') => {
  const res = await api().get(`/api/activity${query}`).set(auth);
  expect(res.status).toBe(200);
  return activityPageResponse.parse(res.body);
};
const history = async (auth: Auth, number: number) => {
  const res = await api().get(`/api/projects/TF/tasks/${number}/activity`).set(auth);
  expect(res.status).toBe(200);
  return taskHistoryResponse.parse(res.body).entries;
};
const actions = (entries: ActivityEntry[]) => entries.map((e) => e.event.action);
/** Everything recorded, oldest first. */
const allEvents = async (auth: Auth) => (await timeline(auth)).entries.toReversed().map((e) => e.event);

describe('recording: every change from Modules 2–6 writes one entry', () => {
  it('records sign-ups and project changes with who, what and when', async () => {
    const { admin, pm, dev } = await setup();
    tick();
    await api().patch('/api/projects/TF').set(pm.auth).send({ name: 'TaskFlow App', color: '#4f46e5' }); // colour unchanged
    tick();
    await api().delete(`/api/projects/TF/members/${dev.id}`).set(pm.auth);
    const page = await timeline(admin.auth);
    const newest = page.entries[0];
    expect(newest).toMatchObject({ type: 'project', actor: { name: 'Pat Manager' }, project: { key: 'TF', name: 'TaskFlow App' } });
    expect(newest?.createdAt).toBe(t.clock.now().toISOString());
    expect(await allEvents(admin.auth)).toEqual([
      { action: 'user.joined', via: 'signup', role: 'admin' },
      { action: 'user.joined', via: 'signup', role: 'viewer' },
      { action: 'user.joined', via: 'signup', role: 'viewer' },
      { action: 'user.joined', via: 'signup', role: 'viewer' },
      { action: 'project.created', project: { key: 'TF', name: 'TaskFlow Web' } },
      { action: 'project.member_added', project: { key: 'TF', name: 'TaskFlow Web' }, member: 'Dev Member' },
      { action: 'project.updated', project: { key: 'TF', name: 'TaskFlow App' }, fields: ['name'] },
      { action: 'project.member_removed', project: { key: 'TF', name: 'TaskFlow App' }, member: 'Dev Member' },
    ]);
  });

  it('records each changed task field with before and after values, and nothing for unchanged fields', async () => {
    const { admin, pm, dev } = await setup();
    const sprint = sprintResponse.parse((await api().post('/api/projects/TF/sprints').set(pm.auth).send({ name: 'Sprint 1', startDate: '2026-12-01', endDate: '2026-12-14' })).body).sprint;
    const task = await newTask(pm.auth);
    tick();
    await api().patch('/api/projects/TF/tasks/101').set(pm.auth).send({
      title: 'Login screen', status: 'in_progress', priority: 'high', type: 'story', points: 5,
      assigneeId: dev.id, sprintId: sprint.id, dueDate: '2026-12-10',
    });
    tick();
    await api().patch('/api/projects/TF/tasks/101').set(pm.auth).send({ priority: 'high' }); // no change → no entry
    const entries = await history(admin.auth, task.number);
    const ref = { key: 'TF-101', title: 'Login screen' };
    expect(entries.map((e) => e.event).toReversed()).toEqual([
      { action: 'task.created', task: { key: 'TF-101', title: 'Login page' } },
      { action: 'task.renamed', task: ref, from: 'Login page' },
      { action: 'task.changed', task: ref, field: 'status', from: 'todo', to: 'in_progress' },
      { action: 'task.changed', task: ref, field: 'priority', from: 'medium', to: 'high' },
      { action: 'task.changed', task: ref, field: 'type', from: 'task', to: 'story' },
      { action: 'task.changed', task: ref, field: 'points', from: null, to: '5' },
      { action: 'task.changed', task: ref, field: 'assignee', from: null, to: 'Dev Member' },
      { action: 'task.changed', task: ref, field: 'sprint', from: null, to: 'Sprint 1' },
      { action: 'task.changed', task: ref, field: 'dueDate', from: null, to: '2026-12-10' },
    ]);
    expect(entries[0]).toMatchObject({ type: 'task', actor: { name: 'Pat Manager' }, task: { key: 'TF-101', number: 101 } });
  });

  it('merges autosaved description edits by the same person within 10 minutes', async () => {
    const { admin, pm, dev } = await setup();
    await newTask(pm.auth);
    for (const text of ['D', 'Dr', 'Draft']) {
      t.clock.advance(60_000);
      await api().patch('/api/projects/TF/tasks/101').set(pm.auth).send({ description: text });
    }
    t.clock.advance(60_000);
    await api().patch('/api/projects/TF/tasks/101').set(dev.auth).send({ description: 'Draft by dev' }); // another person
    t.clock.advance(11 * 60_000);
    await api().patch('/api/projects/TF/tasks/101').set(dev.auth).send({ description: 'Later edit' }); // after the window
    const entries = await history(admin.auth, 101);
    expect(actions(entries)).toEqual(['task.description_updated', 'task.description_updated', 'task.description_updated', 'task.created']);
    expect(entries.map((e) => e.actor?.name)).toEqual(['Dev Member', 'Dev Member', 'Pat Manager', 'Pat Manager']);
  });

  it('records board moves between columns but not reordering inside a column', async () => {
    const { admin, pm } = await setup();
    const a = await newTask(pm.auth, { title: 'First' });
    const b = await newTask(pm.auth, { title: 'Second' });
    tick();
    await api().post('/api/projects/TF/tasks/102/move').set(pm.auth).send({ status: 'todo', afterId: null, beforeId: a.id }); // reorder
    tick();
    await api().post('/api/projects/TF/tasks/102/move').set(pm.auth).send({ status: 'in_review' });
    expect((await history(admin.auth, b.number)).map((e) => e.event)).toEqual([
      { action: 'task.moved', task: { key: 'TF-102', title: 'Second' }, from: 'todo', to: 'in_review' },
      { action: 'task.created', task: { key: 'TF-102', title: 'Second' } },
    ]);
  });

  it('records subtasks, comments with mentions, and task deletion', async () => {
    const { admin, pm, dev } = await setup();
    const task = await newTask(pm.auth);
    tick();
    const added = taskResponse.parse((await api().post('/api/projects/TF/tasks/101/subtasks').set(pm.auth).send({ title: 'Design' })).body).task;
    const sub = added.subtaskList[0]?.id ?? '';
    tick();
    await api().patch(`/api/projects/TF/tasks/101/subtasks/${sub}`).set(pm.auth).send({ done: true });
    tick();
    await api().patch(`/api/projects/TF/tasks/101/subtasks/${sub}`).set(pm.auth).send({ done: false, title: 'Design v2' });
    tick();
    await api().delete(`/api/projects/TF/tasks/101/subtasks/${sub}`).set(pm.auth);
    tick();
    const commented = taskResponse.parse((await api().post('/api/projects/TF/tasks/101/comments').set(pm.auth).send({ body: 'Ping @Dev Member' })).body).task;
    tick();
    await api().delete(`/api/projects/TF/tasks/101/comments/${commented.comments[0]?.id}`).set(pm.auth);
    const ref = { key: 'TF-101', title: 'Login page' };
    expect((await history(admin.auth, task.number)).map((e) => e.event).toReversed()).toEqual([
      { action: 'task.created', task: ref },
      { action: 'subtask.added', task: ref, subtask: 'Design' },
      { action: 'subtask.completed', task: ref, subtask: 'Design' },
      { action: 'subtask.renamed', task: ref, subtask: 'Design v2', from: 'Design' },
      { action: 'subtask.reopened', task: ref, subtask: 'Design v2' },
      { action: 'subtask.removed', task: ref, subtask: 'Design v2' },
      { action: 'comment.added', task: ref, mentions: ['Dev Member'] },
      { action: 'comment.deleted', task: ref },
    ]);

    tick();
    await api().delete('/api/projects/TF/tasks/101').set(pm.auth);
    const page = await timeline(dev.auth);
    expect(page.entries[0]).toMatchObject({ event: { action: 'task.deleted', task: ref }, task: null, project: { key: 'TF' } });
    // the task is gone, so no entry links to it any more (no "Open" link), but they all stay in the timeline
    expect(page.entries.filter((e) => e.task !== null)).toEqual([]);
    expect(page.entries.filter((e) => e.event.action.startsWith('subtask.'))).toHaveLength(5);
  });

  it('records the sprint lifecycle, with the done count and where unfinished tasks went', async () => {
    const { admin, pm } = await setup();
    const s1 = sprintResponse.parse((await api().post('/api/projects/TF/sprints').set(pm.auth).send({ name: 'Sprint 1', startDate: '2026-12-01', endDate: '2026-12-14' })).body).sprint;
    const s2 = sprintResponse.parse((await api().post('/api/projects/TF/sprints').set(pm.auth).send({ name: 'Sprint 2', startDate: '2026-12-15', endDate: '2026-12-28' })).body).sprint;
    await newTask(pm.auth, { title: 'Done one', sprintId: s1.id, status: 'done' });
    await newTask(pm.auth, { title: 'Open one', sprintId: s1.id });
    tick();
    await api().patch(`/api/projects/TF/sprints/${s1.id}`).set(pm.auth).send({ goal: 'Ship login' });
    tick();
    await api().post(`/api/projects/TF/sprints/${s1.id}/start`).set(pm.auth);
    tick();
    await api().post(`/api/projects/TF/sprints/${s1.id}/complete`).set(pm.auth).send({ moveUnfinishedTo: s2.id });
    tick();
    const s3 = sprintResponse.parse((await api().post('/api/projects/TF/sprints').set(pm.auth).send({ name: 'Sprint 3', startDate: '2027-01-01', endDate: '2027-01-07' })).body).sprint;
    tick();
    await api().delete(`/api/projects/TF/sprints/${s3.id}`).set(pm.auth);
    const sprintEvents = (await timeline(admin.auth, '?type=sprint')).entries.toReversed().map((e) => e.event);
    expect(sprintEvents).toEqual([
      { action: 'sprint.created', sprint: { name: 'Sprint 1' } },
      { action: 'sprint.created', sprint: { name: 'Sprint 2' } },
      { action: 'sprint.updated', sprint: { name: 'Sprint 1' }, fields: ['goal'] },
      { action: 'sprint.started', sprint: { name: 'Sprint 1' } },
      { action: 'sprint.completed', sprint: { name: 'Sprint 1' }, done: 1, total: 2, movedTo: 'Sprint 2' },
      { action: 'sprint.created', sprint: { name: 'Sprint 3' } },
      { action: 'sprint.deleted', sprint: { name: 'Sprint 3' } },
    ]);
  });

  it('records roles, permissions and invites (and nothing when a permission did not change)', async () => {
    const { admin, dev } = await setup();
    tick();
    await api().patch(`/api/members/${dev.id}/role`).set(admin.auth).send({ roleId: 'project_manager' });
    tick();
    await api().put('/api/roles/viewer/permissions/task:create').set(admin.auth).send({ granted: true });
    tick();
    await api().put('/api/roles/viewer/permissions/task:create').set(admin.auth).send({ granted: true }); // already granted
    tick();
    const first = inviteResponse.parse((await api().post('/api/invites').set(admin.auth).send({ email: 'new@example.com', roleId: 'developer' })).body).invite;
    tick();
    await api().post(`/api/invites/${first.id}/resend`).set(admin.auth);
    tick();
    const second = inviteResponse.parse((await api().post('/api/invites').set(admin.auth).send({ email: 'gone@example.com', roleId: 'viewer' })).body).invite;
    tick();
    await api().delete(`/api/invites/${second.id}`).set(admin.auth);
    tick();
    await api().post('/api/invites').set(admin.auth).send({ email: 'joiner@example.com', roleId: 'developer' });
    tick();
    await api().post(`/api/auth/invites/${t.lastInviteToken()}/accept`).send({ name: 'Joy Joiner', password: 'password-123' });

    const page = await timeline(admin.auth, '?type=user');
    expect(page.entries[0]).toMatchObject({ actor: { name: 'Joy Joiner' }, event: { action: 'user.joined', via: 'invite', role: 'developer' } });
    expect(page.entries.slice(1, 8).toReversed().map((e) => e.event)).toEqual([
      { action: 'user.role_changed', member: 'Dev Member', from: 'developer', to: 'project_manager' },
      { action: 'user.permission_changed', role: 'viewer', permission: 'task:create', granted: true },
      { action: 'user.invited', email: 'new@example.com', role: 'developer' },
      { action: 'user.invite_resent', email: 'new@example.com' },
      { action: 'user.invited', email: 'gone@example.com', role: 'viewer' },
      { action: 'user.invite_revoked', email: 'gone@example.com' },
      { action: 'user.invited', email: 'joiner@example.com', role: 'developer' },
    ]);
  });

  it('records a project deletion for Admins only (the project is gone for everyone else)', async () => {
    const { admin, pm } = await setup();
    tick();
    expect((await api().delete('/api/projects/TF').set(admin.auth)).status).toBe(204);
    expect((await timeline(admin.auth)).entries[0]).toMatchObject({
      actor: { name: 'Ada Admin' },
      event: { action: 'project.deleted', project: { key: 'TF' } },
      project: null,
    });
    expect(actions((await timeline(pm.auth)).entries)).toEqual([]);
  });

  it('never fails the request when the history cannot be written', async () => {
    const { pm } = await setup();
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    t.store.repos.activity.add = async () => {
      throw new Error('disk full');
    };
    const res = await api().post('/api/projects/TF/tasks').set(pm.auth).send({ title: 'Still saved' });
    expect(res.status).toBe(201);
    expect(error).toHaveBeenCalledOnce();
  });
});

describe('GET /api/activity — who sees what', () => {
  it('shows project events only to members of that project, and everything to Admins', async () => {
    const { admin, pm, dev, outsider } = await setup();
    await newTask(pm.auth);
    expect(actions((await timeline(dev.auth)).entries)).toEqual(['task.created', 'project.member_added', 'project.created']);
    expect((await timeline(outsider.auth)).entries).toEqual([]);
    expect((await timeline(admin.auth)).total).toBe(7); // 4 sign-ups + 3 project/task events
  });

  it('shows user events only to people who manage users or roles', async () => {
    const { admin, pm } = await setup();
    expect((await timeline(pm.auth, '?type=user')).total).toBe(0);
    await api().put('/api/roles/project_manager/permissions/user:manage').set(admin.auth).send({ granted: true });
    const page = await timeline(pm.auth, '?type=user');
    expect(page.total).toBe(5); // 4 sign-ups + the permission change itself
    expect(page.entries[0]?.event).toEqual({ action: 'user.permission_changed', role: 'project_manager', permission: 'user:manage', granted: true });
  });

  it('filters by person and by event type, and combines them', async () => {
    const { admin, pm, dev } = await setup();
    await newTask(pm.auth);
    await newTask(dev.auth, { title: 'Dev task' });
    tick();
    await api().post('/api/projects/TF/tasks/101/comments').set(dev.auth).send({ body: 'Looks good' });
    expect(actions((await timeline(admin.auth, `?user=${dev.id}`)).entries)).toEqual(['comment.added', 'task.created', 'user.joined']);
    expect(actions((await timeline(admin.auth, '?type=comment')).entries)).toEqual(['comment.added']);
    const both = await timeline(admin.auth, `?user=${dev.id}&type=task`);
    expect(both.total).toBe(1);
    expect(both.entries[0]?.event).toMatchObject({ action: 'task.created', task: { title: 'Dev task' } });
  });

  it('pages newest first with a cursor: 30 per page, no repeats, no gaps', async () => {
    const { pm } = await setup();
    // entries sharing a timestamp must still page correctly (the id breaks ties)
    for (let i = 1; i <= 40; i++) await api().post('/api/projects/TF/tasks').set(pm.auth).send({ title: `Task number ${i}` });
    const first = await timeline(pm.auth);
    expect(first.entries).toHaveLength(30);
    expect(first.total).toBe(42); // 40 tasks + project created + member added
    expect(first.nextCursor).not.toBeNull();
    const second = await timeline(pm.auth, `?cursor=${encodeURIComponent(first.nextCursor ?? '')}`);
    expect(second.entries).toHaveLength(12);
    expect(second.nextCursor).toBeNull();
    const ids = [...first.entries, ...second.entries].map((e) => e.id);
    expect(new Set(ids).size).toBe(42);
    const times = [...first.entries, ...second.entries].map((e) => e.createdAt);
    expect(times).toEqual(times.toSorted().toReversed());
  });

  it('refuses invalid filters with 400 and needs sign-in', async () => {
    const { admin } = await setup();
    for (const [query, field] of [['?type=everything', 'type'], ['?user=bob', 'user'], ['?cursor=yesterday', 'cursor'], ['?type=task&type=sprint', 'type']]) {
      const res = await api().get(`/api/activity${query}`).set(admin.auth);
      expect(res.status, query).toBe(400);
      expect(Object.keys(res.body.error.fields), query).toContain(field);
    }
    expect((await api().get('/api/activity')).status).toBe(401);
  });
});

describe('GET /api/projects/:key/tasks/:number/activity — task history', () => {
  it('lists only that task, newest first', async () => {
    const { pm, dev } = await setup();
    await newTask(pm.auth, { title: 'One' });
    await newTask(pm.auth, { title: 'Two' });
    tick();
    await api().patch('/api/projects/TF/tasks/101').set(pm.auth).send({ priority: 'low' });
    expect(actions(await history(dev.auth, 101))).toEqual(['task.changed', 'task.created']);
    expect(actions(await history(dev.auth, 102))).toEqual(['task.created']);
  });

  it('follows project visibility: 404 for non-members and unknown tasks, 401 when signed out, 400 for a bad number', async () => {
    const { pm, outsider } = await setup();
    await newTask(pm.auth);
    expect((await api().get('/api/projects/TF/tasks/101/activity').set(outsider.auth)).status).toBe(404);
    expect((await api().get('/api/projects/TF/tasks/999/activity').set(pm.auth)).status).toBe(404);
    expect((await api().get('/api/projects/TF/tasks/abc/activity').set(pm.auth)).status).toBe(400);
    expect((await api().get('/api/projects/TF/tasks/101/activity')).status).toBe(401);
  });
});

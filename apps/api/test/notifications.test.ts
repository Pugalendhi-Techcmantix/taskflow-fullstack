import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { notificationsResponse, sprintResponse, taskResponse, unreadResponse } from '@taskflow/core';
import { createTestApp } from './support/test-app';

let t: ReturnType<typeof createTestApp>;
beforeEach(() => {
  t = createTestApp();
});
const api = () => request(t.app);
type Auth = Record<string, string>;

/** A PM who owns TF; two Developer members; a Developer outsider. */
async function setup() {
  await t.signUp('Ada Admin');
  const pm = await t.signUp('Pat Manager', 'project_manager');
  const dev = await t.signUp('Dev Member', 'developer');
  const dana = await t.signUp('Dana Second', 'developer');
  const outsider = await t.signUp('Out Sider', 'developer');
  await api().post('/api/projects').set(pm.auth).send({ name: 'TaskFlow Web', key: 'TF', color: '#4f46e5' });
  for (const u of [dev, dana]) await api().post('/api/projects/TF/members').set(pm.auth).send({ userId: u.id });
  return { pm, dev, dana, outsider };
}
const newTask = async (auth: Auth, body: object = { title: 'Login page' }) =>
  taskResponse.parse((await api().post('/api/projects/TF/tasks').set(auth).send(body)).body).task;
const inbox = async (auth: Auth, query = '') => {
  const res = await api().get(`/api/notifications${query}`).set(auth);
  expect(res.status).toBe(200);
  return notificationsResponse.parse(res.body);
};
const kinds = async (auth: Auth) => (await inbox(auth)).notifications.map((n) => n.data.kind);

describe('who gets notified', () => {
  it('assignment: the new assignee, when created assigned or assigned later, never yourself', async () => {
    const { pm, dev, dana } = await setup();
    await newTask(pm.auth, { title: 'Created assigned', assigneeId: dev.id });
    await newTask(pm.auth, { title: 'Assigned later' });
    await api().patch('/api/projects/TF/tasks/102').set(pm.auth).send({ assigneeId: dana.id });
    await api().patch('/api/projects/TF/tasks/102').set(dana.auth).send({ assigneeId: dana.id }); // no change
    await newTask(dev.auth, { title: 'Self assigned', assigneeId: dev.id });

    const forDev = await inbox(dev.auth);
    expect(forDev.notifications).toHaveLength(1);
    expect(forDev.notifications[0]).toMatchObject({
      read: false,
      actor: { name: 'Pat Manager' },
      project: { key: 'TF' },
      task: { key: 'TF-101', number: 101 },
      data: { kind: 'assigned', task: { key: 'TF-101', title: 'Created assigned' } },
    });
    expect(forDev.unread).toBe(1);
    expect((await inbox(dana.auth)).notifications.map((n) => n.data)).toEqual([{ kind: 'assigned', task: { key: 'TF-102', title: 'Assigned later' } }]);
    expect(await kinds(pm.auth)).toEqual([]);
  });

  it('mention: each mentioned member, not the author', async () => {
    const { pm, dev, dana } = await setup();
    await newTask(pm.auth);
    await api().post('/api/projects/TF/tasks/101/comments').set(dev.auth).send({ body: '@Dana Second and @Pat Manager please check (cc @Dev Member)' });
    expect((await inbox(dana.auth)).notifications[0]).toMatchObject({ actor: { name: 'Dev Member' }, data: { kind: 'mentioned', task: { key: 'TF-101' } } });
    expect(await kinds(pm.auth)).toEqual(['mentioned']);
    expect(await kinds(dev.auth)).toEqual([]);
  });

  it('status change (dialog or board): the assignee and the reporter, but not the one who moved it', async () => {
    const { pm, dev, dana } = await setup();
    await newTask(pm.auth, { title: 'Reported by PM', assigneeId: dev.id }); // dev: 1 "assigned"
    await api().patch('/api/projects/TF/tasks/101').set(dana.auth).send({ status: 'in_progress' });
    await api().post('/api/projects/TF/tasks/101/move').set(dev.auth).send({ status: 'in_review' });
    const forPm = await inbox(pm.auth);
    expect(forPm.notifications.map((n) => [n.actor?.name, n.data])).toEqual([
      ['Dev Member', { kind: 'status_changed', task: { key: 'TF-101', title: 'Reported by PM' }, to: 'in_review' }],
      ['Dana Second', { kind: 'status_changed', task: { key: 'TF-101', title: 'Reported by PM' }, to: 'in_progress' }],
    ]);
    expect(await kinds(dev.auth)).toEqual(['status_changed', 'assigned']); // only Dana's change, not their own move
    expect(await kinds(dana.auth)).toEqual([]);
    // reordering inside a column is not a status change
    await api().post('/api/projects/TF/tasks/101/move').set(dana.auth).send({ status: 'in_review' });
    expect((await inbox(pm.auth)).notifications).toHaveLength(2);
  });

  it('sprint started / completed: every other project member', async () => {
    const { pm, dev, dana } = await setup();
    const s = sprintResponse.parse((await api().post('/api/projects/TF/sprints').set(pm.auth).send({ name: 'Sprint 1', startDate: '2026-01-12', endDate: '2026-01-25' })).body).sprint;
    await newTask(pm.auth, { title: 'Task A', sprintId: s.id, points: 5 });
    await newTask(pm.auth, { title: 'Task B', sprintId: s.id, points: 3, status: 'done' });
    await api().post(`/api/projects/TF/sprints/${s.id}/start`).set(pm.auth);
    await api().post(`/api/projects/TF/sprints/${s.id}/complete`).set(pm.auth).send({ moveUnfinishedTo: 'backlog' });
    for (const u of [dev, dana]) {
      expect((await inbox(u.auth)).notifications.map((n) => n.data)).toEqual([
        { kind: 'sprint_completed', sprint: { name: 'Sprint 1' }, done: 1, total: 2 },
        { kind: 'sprint_started', sprint: { name: 'Sprint 1' }, tasks: 2, points: 8 },
      ]);
    }
    expect(await kinds(pm.auth)).toEqual([]);
  });

  it('only current project members are notified', async () => {
    const { pm, dev, outsider } = await setup();
    await newTask(pm.auth, { title: 'Reported by dev', assigneeId: dev.id });
    await api().delete(`/api/projects/TF/members/${dev.id}`).set(pm.auth);
    await api().patch('/api/projects/TF/tasks/101').set(pm.auth).send({ status: 'done' });
    await api().post('/api/projects/TF/tasks/101/comments').set(pm.auth).send({ body: 'Thanks @Out Sider' }); // not a member
    expect(await kinds(dev.auth)).toEqual(['assigned']); // the status change came after removal
    expect(await kinds(outsider.auth)).toEqual([]);
  });
});

describe('reading and marking', () => {
  it('pages newest first with the unread total', async () => {
    const { pm, dev } = await setup();
    for (let i = 1; i <= 23; i++) await newTask(pm.auth, { title: `Task ${i}`, assigneeId: dev.id });
    const first = await inbox(dev.auth);
    expect(first.notifications).toHaveLength(20);
    expect(first.unread).toBe(23);
    expect(first.notifications[0]?.data).toMatchObject({ task: { title: 'Task 23' } });
    const second = await inbox(dev.auth, `?cursor=${encodeURIComponent(first.nextCursor ?? '')}`);
    expect(second.notifications.map((n) => n.data.kind === 'assigned' && n.data.task.title)).toEqual(['Task 3', 'Task 2', 'Task 1']);
    expect(second.nextCursor).toBeNull();
  });

  it('marks one or all as read; someone else\'s notification is a 404', async () => {
    const { pm, dev, dana } = await setup();
    await newTask(pm.auth, { title: 'One', assigneeId: dev.id });
    await newTask(pm.auth, { title: 'Two', assigneeId: dev.id });
    const [latest] = (await inbox(dev.auth)).notifications;
    const one = await api().post(`/api/notifications/${latest?.id}/read`).set(dev.auth);
    expect(unreadResponse.parse(one.body)).toEqual({ unread: 1 });
    expect((await inbox(dev.auth)).notifications.map((n) => n.read)).toEqual([true, false]);
    expect((await api().post(`/api/notifications/${latest?.id}/read`).set(dana.auth)).status).toBe(404);
    expect((await api().post(`/api/notifications/${latest?.id}/read`).set(dev.auth)).status).toBe(200); // twice is fine
    expect(unreadResponse.parse((await api().post('/api/notifications/read-all').set(dev.auth)).body)).toEqual({ unread: 0 });
    expect((await inbox(dev.auth)).unread).toBe(0);
  });

  it('validates ids and cursors and needs sign-in', async () => {
    const { dev } = await setup();
    expect((await api().post('/api/notifications/not-a-uuid/read').set(dev.auth)).status).toBe(400);
    expect((await api().post('/api/notifications/0193a0f0-0000-7000-8000-000000000000/read').set(dev.auth)).status).toBe(404);
    expect((await api().get('/api/notifications?cursor=yesterday').set(dev.auth)).status).toBe(400);
    expect((await api().get('/api/notifications')).status).toBe(401);
    expect((await api().post('/api/notifications/read-all')).status).toBe(401);
  });
});

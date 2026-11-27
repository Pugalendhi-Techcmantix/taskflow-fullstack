import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { sprintResponse, taskPageResponse, taskResponse, tasksResponse } from '@taskflow/core';
import { createTestApp } from './support/test-app';

let t: ReturnType<typeof createTestApp>;
beforeEach(() => {
  t = createTestApp();
});
const api = () => request(t.app);

/** A PM who owns TF, a Developer member, a Viewer member and a Developer outsider. */
async function setup() {
  await t.signUp('Ada Admin');
  const pm = await t.signUp('Pat Manager', 'project_manager');
  const dev = await t.signUp('Dev Member', 'developer');
  const viewer = await t.signUp('Vic Viewer');
  const outsider = await t.signUp('Out Sider', 'developer');
  await api().post('/api/projects').set(pm.auth).send({ name: 'TaskFlow Web', key: 'TF', color: '#4f46e5' });
  await api().post('/api/projects/TF/members').set(pm.auth).send({ userId: dev.id });
  await api().post('/api/projects/TF/members').set(pm.auth).send({ userId: viewer.id });
  return { pm, dev, viewer, outsider };
}
const newTask = async (auth: Record<string, string>, body: object) =>
  taskResponse.parse((await api().post('/api/projects/TF/tasks').set(auth).send(body)).body).task;
const list = async (auth: Record<string, string>, query = '') => {
  const res = await api().get(`/api/projects/TF/tasks${query}`).set(auth);
  expect(res.status).toBe(200);
  return taskPageResponse.parse(res.body);
};
const keys = (page: { tasks: { key: string }[] }) => page.tasks.map((x) => x.key);

/** Five varied tasks, TF-101…105. */
async function seed(pm: { auth: Record<string, string> }, devId: string) {
  const sprint = sprintResponse.parse(
    (await api().post('/api/projects/TF/sprints').set(pm.auth).send({ name: 'Sprint 1', startDate: '2026-12-01', endDate: '2026-12-14' })).body,
  ).sprint;
  await newTask(pm.auth, { title: 'Login page', type: 'story', priority: 'high', points: 5, assigneeId: devId, sprintId: sprint.id, dueDate: '2026-12-10' });
  await newTask(pm.auth, { title: 'Fix crash on logout', type: 'bug', priority: 'critical', status: 'in_progress', points: 2, sprintId: sprint.id });
  await newTask(pm.auth, { title: 'Write docs', type: 'task', priority: 'low', status: 'done', assigneeId: devId, dueDate: '2026-12-01' });
  await newTask(pm.auth, { title: 'Settings page', type: 'story', priority: 'medium', status: 'in_review', points: 8 });
  await newTask(pm.auth, { title: '100% coverage', type: 'task', priority: 'medium' });
  return sprint;
}

describe('GET /api/projects/:key/tasks — the Tasks table', () => {
  it('returns page 1 of 25, sorted by key, with the total', async () => {
    const { pm, dev } = await setup();
    await seed(pm, dev.id);
    const page = await list(pm.auth);
    expect(page).toMatchObject({ total: 5, page: 1, size: 25 });
    expect(keys(page)).toEqual(['TF-101', 'TF-102', 'TF-103', 'TF-104', 'TF-105']);
  });

  it('filters by status, priority, type, assignee and sprint, and combines filters', async () => {
    const { pm, dev } = await setup();
    const sprint = await seed(pm, dev.id);
    expect(keys(await list(pm.auth, '?status=in_progress'))).toEqual(['TF-102']);
    expect(keys(await list(pm.auth, '?priority=medium'))).toEqual(['TF-104', 'TF-105']);
    expect(keys(await list(pm.auth, '?type=story'))).toEqual(['TF-101', 'TF-104']);
    expect(keys(await list(pm.auth, `?assignee=${dev.id}`))).toEqual(['TF-101', 'TF-103']);
    expect(keys(await list(pm.auth, '?assignee=none'))).toEqual(['TF-102', 'TF-104', 'TF-105']);
    expect(keys(await list(pm.auth, `?sprint=${sprint.id}`))).toEqual(['TF-101', 'TF-102']);
    expect(keys(await list(pm.auth, '?sprint=backlog'))).toEqual(['TF-103', 'TF-104', 'TF-105']);
    const combined = await list(pm.auth, `?type=story&assignee=none&sprint=backlog`);
    expect(keys(combined)).toEqual(['TF-104']);
    expect(combined.total).toBe(1);
  });

  it('searches the title and the key, ignoring case, and treats % and _ literally', async () => {
    const { pm, dev } = await setup();
    await seed(pm, dev.id);
    expect(keys(await list(pm.auth, '?q=PAGE'))).toEqual(['TF-101', 'TF-104']);
    expect(keys(await list(pm.auth, '?q=tf-103'))).toEqual(['TF-103']);
    expect(keys(await list(pm.auth, '?q=TF-10'))).toHaveLength(5);
    expect(keys(await list(pm.auth, `?q=${encodeURIComponent('100%')}`))).toEqual(['TF-105']);
    expect(keys(await list(pm.auth, `?q=${encodeURIComponent('%')}`))).toEqual(['TF-105']);
    expect(keys(await list(pm.auth, '?q=_'))).toEqual([]);
    expect((await list(pm.auth, '?q=nothing-like-this')).total).toBe(0);
  });

  it('sorts status and priority in workflow order, not alphabetically', async () => {
    const { pm, dev } = await setup();
    await seed(pm, dev.id);
    expect(keys(await list(pm.auth, '?sort=priority'))).toEqual(['TF-102', 'TF-101', 'TF-104', 'TF-105', 'TF-103']);
    expect(keys(await list(pm.auth, '?sort=status'))).toEqual(['TF-101', 'TF-105', 'TF-102', 'TF-104', 'TF-103']);
    expect(keys(await list(pm.auth, '?sort=status&dir=desc'))).toEqual(['TF-103', 'TF-104', 'TF-102', 'TF-101', 'TF-105']);
    expect(keys(await list(pm.auth, '?sort=key&dir=desc'))).toEqual(['TF-105', 'TF-104', 'TF-103', 'TF-102', 'TF-101']);
    expect(keys(await list(pm.auth, '?sort=title'))).toEqual(['TF-105', 'TF-102', 'TF-101', 'TF-104', 'TF-103']);
  });

  it('puts empty values last in both directions', async () => {
    const { pm, dev } = await setup();
    await seed(pm, dev.id);
    expect(keys(await list(pm.auth, '?sort=points'))).toEqual(['TF-102', 'TF-101', 'TF-104', 'TF-103', 'TF-105']);
    expect(keys(await list(pm.auth, '?sort=points&dir=desc'))).toEqual(['TF-104', 'TF-101', 'TF-102', 'TF-103', 'TF-105']);
    expect(keys(await list(pm.auth, '?sort=due&dir=desc'))).toEqual(['TF-101', 'TF-103', 'TF-102', 'TF-104', 'TF-105']);
    expect(keys(await list(pm.auth, '?sort=assignee&dir=desc'))).toEqual(['TF-101', 'TF-103', 'TF-102', 'TF-104', 'TF-105']);
    expect(keys(await list(pm.auth, '?sort=sprint'))).toEqual(['TF-101', 'TF-102', 'TF-103', 'TF-104', 'TF-105']);
  });

  it('pages through the rows and only sends one page', async () => {
    const { pm } = await setup();
    for (let i = 1; i <= 23; i++) await newTask(pm.auth, { title: `Task number ${i}` });
    const first = await list(pm.auth, '?size=10');
    expect(first).toMatchObject({ total: 23, page: 1, size: 10 });
    expect(first.tasks).toHaveLength(10);
    const third = await list(pm.auth, '?size=10&page=3');
    expect(third.tasks).toHaveLength(3);
    expect(keys(third)[0]).toBe('TF-121');
  });

  it('returns the last page for a page past the end, and page 1 when nothing matches', async () => {
    const { pm } = await setup();
    for (let i = 1; i <= 12; i++) await newTask(pm.auth, { title: `Task number ${i}` });
    const past = await list(pm.auth, '?size=10&page=9');
    expect(past).toMatchObject({ page: 2, total: 12 });
    expect(past.tasks).toHaveLength(2);
    expect(await list(pm.auth, '?q=zzz&page=4')).toMatchObject({ page: 1, total: 0, tasks: [] });
  });

  it('refuses invalid query values with 400 and the field name', async () => {
    const { pm } = await setup();
    const cases: [string, string][] = [
      ['?size=7', 'size'],
      ['?size=ten', 'size'],
      ['?page=0', 'page'],
      ['?page=1.5', 'page'],
      ['?page=abc', 'page'],
      ['?sort=password', 'sort'],
      ['?dir=up', 'dir'],
      ['?status=urgent', 'status'],
      ['?priority=urgent', 'priority'],
      ['?type=epic', 'type'],
      ['?assignee=bob', 'assignee'],
      ['?sprint=current', 'sprint'],
      [`?q=${'x'.repeat(101)}`, 'q'],
      ['?status=todo&status=done', 'status'],
    ];
    for (const [query, field] of cases) {
      const res = await api().get(`/api/projects/TF/tasks${query}`).set(pm.auth);
      expect(res.status, query).toBe(400);
      expect(Object.keys(res.body.error.fields), query).toContain(field);
    }
  });

  it('needs sign-in, lets Viewers read, and hides the project from non-members', async () => {
    const { pm, viewer, outsider } = await setup();
    await newTask(pm.auth, { title: 'Login page' });
    expect((await api().get('/api/projects/TF/tasks')).status).toBe(401);
    expect((await list(viewer.auth)).total).toBe(1);
    expect((await api().get('/api/projects/TF/tasks').set(outsider.auth)).status).toBe(404);
    expect((await api().get('/api/projects/NOPE/tasks').set(pm.auth)).status).toBe(404);
  });

  it('only lists the requested project', async () => {
    const { pm } = await setup();
    await newTask(pm.auth, { title: 'Web task' });
    await api().post('/api/projects').set(pm.auth).send({ name: 'Mobile App', key: 'MOB', color: '#ea580c' });
    await api().post('/api/projects/MOB/tasks').set(pm.auth).send({ title: 'Mobile task' });
    expect(keys(await list(pm.auth))).toEqual(['TF-101']);
    expect(keys(await list(pm.auth, '?q=task'))).toEqual(['TF-101']);
  });
});

describe('GET /api/projects/:key/planning — every task, for the Sprints page', () => {
  it('returns all tasks of the project (not paged), oldest first', async () => {
    const { pm } = await setup();
    for (let i = 1; i <= 30; i++) await newTask(pm.auth, { title: `Task number ${i}` });
    const res = await api().get('/api/projects/TF/planning').set(pm.auth);
    expect(res.status).toBe(200);
    const { tasks } = tasksResponse.parse(res.body);
    expect(tasks).toHaveLength(30);
    expect(tasks[0]?.key).toBe('TF-101');
  });

  it('needs sign-in and hides the project from non-members', async () => {
    const { outsider, viewer } = await setup();
    expect((await api().get('/api/projects/TF/planning')).status).toBe(401);
    expect((await api().get('/api/projects/TF/planning').set(outsider.auth)).status).toBe(404);
    expect((await api().get('/api/projects/TF/planning').set(viewer.auth)).status).toBe(200);
  });
});

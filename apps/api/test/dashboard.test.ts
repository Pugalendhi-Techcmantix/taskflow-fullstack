import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { activityPageResponse, dashboardResponse, sprintResponse, taskPageResponse, taskResponse } from '@taskflow/core';
import { createTestApp } from './support/test-app';

// The test clock starts on 2026-01-15, so a due date of 2026-01-10 is overdue and 2026-01-20 is not.
let t: ReturnType<typeof createTestApp>;
beforeEach(() => {
  t = createTestApp();
});
const api = () => request(t.app);
type Auth = Record<string, string>;

/** Admin; a PM who owns TF; a Developer and a Viewer member; a Developer outsider. */
async function setup() {
  const admin = await t.signUp('Ada Admin');
  const pm = await t.signUp('Pat Manager', 'project_manager');
  const dev = await t.signUp('Dev Member', 'developer');
  const viewer = await t.signUp('Vic Viewer');
  const outsider = await t.signUp('Out Sider', 'developer');
  await api().post('/api/projects').set(pm.auth).send({ name: 'TaskFlow Web', key: 'TF', color: '#4f46e5' });
  for (const u of [dev, viewer]) await api().post('/api/projects/TF/members').set(pm.auth).send({ userId: u.id });
  return { admin, pm, dev, viewer, outsider };
}
const newTask = async (auth: Auth, body: object) => taskResponse.parse((await api().post('/api/projects/TF/tasks').set(auth).send(body)).body).task;
const dashboard = async (auth: Auth) => {
  const res = await api().get('/api/projects/TF/dashboard').set(auth);
  expect(res.status).toBe(200);
  return dashboardResponse.parse(res.body);
};
const tasksTotal = async (auth: Auth, query = '') => taskPageResponse.parse((await api().get(`/api/projects/TF/tasks${query}`).set(auth)).body).total;

/** 7 tasks: 2 To Do (1 overdue), 2 In Progress (1 overdue), 1 In Review, 2 Done (1 with a past due date: not overdue). */
async function seed(pm: { auth: Auth; id: string }, devId: string) {
  await newTask(pm.auth, { title: 'Todo overdue', dueDate: '2026-01-10', assigneeId: devId });
  await newTask(pm.auth, { title: 'Todo later', dueDate: '2026-01-20', assigneeId: pm.id, priority: 'low' });
  await newTask(pm.auth, { title: 'Doing overdue', status: 'in_progress', dueDate: '2026-01-14', assigneeId: devId });
  await newTask(pm.auth, { title: 'Doing', status: 'in_progress', assigneeId: pm.id, priority: 'critical' });
  await newTask(pm.auth, { title: 'Reviewing', status: 'in_review' });
  await newTask(pm.auth, { title: 'Done late', status: 'done', dueDate: '2026-01-01', assigneeId: devId });
  await newTask(pm.auth, { title: 'Done', status: 'done', assigneeId: pm.id });
}

describe('GET /api/projects/:key/dashboard', () => {
  it('counts open, in progress, done and overdue tasks', async () => {
    const { pm, dev } = await setup();
    await seed(pm, dev.id);
    const d = await dashboard(pm.auth);
    expect(d.counts).toEqual({ total: 7, open: 5, inProgress: 2, done: 2, overdue: 2 });
  });

  it('every number matches the Tasks table filter its card links to', async () => {
    const { pm, dev } = await setup();
    await seed(pm, dev.id);
    const { counts } = await dashboard(pm.auth);
    expect(counts.total).toBe(await tasksTotal(pm.auth));
    expect(counts.open).toBe(await tasksTotal(pm.auth, '?status=open'));
    expect(counts.inProgress).toBe(await tasksTotal(pm.auth, '?status=in_progress'));
    expect(counts.done).toBe(await tasksTotal(pm.auth, '?status=done'));
    expect(counts.overdue).toBe(await tasksTotal(pm.auth, '?status=overdue'));
  });

  it('shows tasks by status for the whole project, or for the active sprint once one runs', async () => {
    const { pm, dev } = await setup();
    await seed(pm, dev.id);
    expect((await dashboard(pm.auth)).byStatus).toEqual({ scope: 'project', counts: { todo: 2, in_progress: 2, in_review: 1, done: 2 } });
    const sprint = sprintResponse.parse((await api().post('/api/projects/TF/sprints').set(pm.auth).send({ name: 'Sprint 1', startDate: '2026-01-12', endDate: '2026-01-25' })).body).sprint;
    await newTask(pm.auth, { title: 'Sprint work', sprintId: sprint.id, points: 5 });
    await newTask(pm.auth, { title: 'Sprint done', sprintId: sprint.id, points: 3, status: 'done' });
    expect((await dashboard(pm.auth)).activeSprint).toBeNull(); // planned, not started
    await api().post(`/api/projects/TF/sprints/${sprint.id}/start`).set(pm.auth);
    const d = await dashboard(pm.auth);
    expect(d.activeSprint?.name).toBe('Sprint 1');
    expect(d.byStatus).toEqual({ scope: 'sprint', counts: { todo: 1, in_progress: 0, in_review: 0, done: 1 } });
    // burndown input: points, and when each finished task became Done (null when not done)
    expect(d.sprintTasks).toEqual([{ points: 5, doneAt: null }, { points: 3, doneAt: '2026-01-15T10:00:00.000Z' }]);
  });

  it('lists open tasks per member (not Viewers), most first, plus unassigned', async () => {
    const { pm, dev } = await setup();
    await seed(pm, dev.id);
    const d = await dashboard(pm.auth);
    expect(d.workload).toEqual([
      { id: dev.id, name: 'Dev Member', open: 2 },
      { id: pm.id, name: 'Pat Manager', open: 2 },
    ]);
    expect(d.unassignedOpen).toBe(1);
  });

  it("lists the signed-in user's open tasks, highest priority first, with the total", async () => {
    const { pm, dev } = await setup();
    await seed(pm, dev.id);
    const forPm = await dashboard(pm.auth);
    expect(forPm.myOpenTasks.map((x) => x.title)).toEqual(['Doing', 'Todo later']);
    expect(forPm.myOpenTotal).toBe(2);
    for (let i = 0; i < 10; i++) await newTask(pm.auth, { title: `Extra ${i}`, assigneeId: dev.id });
    const forDev = await dashboard(dev.auth);
    expect(forDev.myOpenTasks).toHaveLength(8);
    expect(forDev.myOpenTotal).toBe(12);
    expect(forDev.myOpenTasks.every((x) => x.assignee?.id === dev.id && x.status !== 'done')).toBe(true);
  });

  it('works for an empty project', async () => {
    const { pm } = await setup();
    const d = await dashboard(pm.auth);
    expect(d).toMatchObject({ counts: { total: 0, open: 0, inProgress: 0, done: 0, overdue: 0 }, activeSprint: null, myOpenTasks: [], sprintTasks: [] });
  });

  it('follows project visibility: Viewers may read, non-members get 404, signed-out users 401', async () => {
    const { admin, viewer, outsider } = await setup();
    expect((await api().get('/api/projects/TF/dashboard').set(viewer.auth)).status).toBe(200);
    expect((await api().get('/api/projects/TF/dashboard').set(admin.auth)).status).toBe(200);
    expect((await api().get('/api/projects/TF/dashboard').set(outsider.auth)).status).toBe(404);
    expect((await api().get('/api/projects/NOPE/dashboard').set(admin.auth)).status).toBe(404);
    expect((await api().get('/api/projects/tf!/dashboard').set(admin.auth)).status).toBe(400);
    expect((await api().get('/api/projects/TF/dashboard')).status).toBe(401);
  });
});

describe('Tasks table status groups (the dashboard card links)', () => {
  it('status=open is everything not done; status=overdue is not done and due before today', async () => {
    const { pm, dev } = await setup();
    await seed(pm, dev.id);
    const titles = async (q: string) =>
      taskPageResponse.parse((await api().get(`/api/projects/TF/tasks${q}`).set(pm.auth)).body).tasks.map((x) => x.title);
    expect(await titles('?status=open')).toEqual(['Todo overdue', 'Todo later', 'Doing overdue', 'Doing', 'Reviewing']);
    expect(await titles('?status=overdue')).toEqual(['Todo overdue', 'Doing overdue']);
    expect((await api().get('/api/projects/TF/tasks?status=late').set(pm.auth)).status).toBe(400);
  });
});

describe('GET /api/activity?project=&limit= (dashboard "Recent activity")', () => {
  it('limits to one project and a few entries', async () => {
    const { pm, dev } = await setup();
    await api().post('/api/projects').set(pm.auth).send({ name: 'Mobile App', key: 'MOB', color: '#ea580c' });
    await seed(pm, dev.id);
    const page = activityPageResponse.parse((await api().get('/api/activity?project=TF&limit=6').set(pm.auth)).body);
    expect(page.entries).toHaveLength(6);
    expect(page.entries.every((e) => e.project?.key === 'TF')).toBe(true);
    expect(page.total).toBe(10); // project created + 2 members added + 7 tasks
    expect(page.nextCursor).not.toBeNull();
  });

  it('404s for a project you cannot see and 400s for a bad limit', async () => {
    const { outsider, pm } = await setup();
    expect((await api().get('/api/activity?project=TF').set(outsider.auth)).status).toBe(404);
    for (const q of ['limit=0', 'limit=31', 'limit=two', 'project=t!']) {
      expect((await api().get(`/api/activity?${q}`).set(pm.auth)).status, q).toBe(400);
    }
  });
});

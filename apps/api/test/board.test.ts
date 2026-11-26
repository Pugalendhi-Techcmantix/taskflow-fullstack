import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { POSITION_STEP, boardResponse, sprintResponse, taskResponse, taskSummaryResponse, type TaskStatus } from '@taskflow/core';
import { createTestApp } from './support/test-app';

let t: ReturnType<typeof createTestApp>;
beforeEach(() => {
  t = createTestApp();
});
const api = () => request(t.app);

/** A PM who owns TF with an active sprint, a Developer member, a Viewer member and a Developer outsider. */
async function setup() {
  const admin = await t.signUp('Ada Admin');
  const pm = await t.signUp('Pat Manager', 'project_manager');
  const dev = await t.signUp('Dev Member', 'developer');
  const viewer = await t.signUp('Vic Viewer');
  const outsider = await t.signUp('Out Sider', 'developer');
  await api().post('/api/projects').set(pm.auth).send({ name: 'TaskFlow Web', key: 'TF', color: '#4f46e5' });
  await api().post('/api/projects/TF/members').set(pm.auth).send({ userId: dev.id });
  await api().post('/api/projects/TF/members').set(pm.auth).send({ userId: viewer.id });
  const sprint = sprintResponse.parse(
    (await api().post('/api/projects/TF/sprints').set(pm.auth).send({ name: 'Sprint 1', startDate: '2026-12-01', endDate: '2026-12-14' })).body,
  ).sprint;
  await api().post(`/api/projects/TF/sprints/${sprint.id}/start`).set(pm.auth);
  return { admin, pm, dev, viewer, outsider, sprint };
}

const newTask = async (auth: Record<string, string>, body: object) =>
  taskResponse.parse((await api().post('/api/projects/TF/tasks').set(auth).send(body)).body).task;

const board = async (auth: Record<string, string>) => boardResponse.parse((await api().get('/api/projects/TF/board').set(auth)).body);

/** Keys of one column, top to bottom. */
const column = async (auth: Record<string, string>, status: TaskStatus) =>
  (await board(auth)).tasks.filter((x) => x.status === status).map((x) => x.key);

const move = (auth: Record<string, string>, number: number, body: object) => api().post(`/api/projects/TF/tasks/${number}/move`).set(auth).send(body);

/** Three To Do cards in the active sprint: TF-101, TF-102, TF-103. */
async function threeCards(auth: Record<string, string>, sprintId: string) {
  const a = await newTask(auth, { title: 'First card', sprintId });
  const b = await newTask(auth, { title: 'Second card', sprintId });
  const c = await newTask(auth, { title: 'Third card', sprintId });
  return [a, b, c] as const;
}

describe('GET /board', () => {
  it('returns the active sprint and only its tasks, in board order', async () => {
    const { pm, dev, sprint } = await setup();
    await threeCards(pm.auth, sprint.id);
    await newTask(pm.auth, { title: 'In the backlog' });
    const res = await board(dev.auth);
    expect(res.sprint).toMatchObject({ id: sprint.id, name: 'Sprint 1', status: 'active' });
    expect(res.tasks.map((x) => x.key)).toEqual(['TF-101', 'TF-102', 'TF-103']);
    expect(res.tasks.map((x) => x.position)).toEqual([POSITION_STEP, 2 * POSITION_STEP, 3 * POSITION_STEP]);
  });

  it('returns sprint: null when no sprint is active', async () => {
    const { pm } = await setup();
    await api().post('/api/projects').set(pm.auth).send({ name: 'Mobile App', key: 'MOB', color: '#ea580c' });
    const res = await api().get('/api/projects/MOB/board').set(pm.auth);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ sprint: null, tasks: [] });
  });

  it('lets Viewers read it, but not signed-out users or non-members', async () => {
    const { viewer, outsider } = await setup();
    expect((await api().get('/api/projects/TF/board').set(viewer.auth)).status).toBe(200);
    expect((await api().get('/api/projects/TF/board')).status).toBe(401);
    expect((await api().get('/api/projects/TF/board').set(outsider.auth)).status).toBe(404);
  });
});

describe('POST /tasks/:number/move', () => {
  it('moves a card to another column between two cards, changing only that row', async () => {
    const { pm, dev, sprint } = await setup();
    const [a, b, c] = await threeCards(pm.auth, sprint.id);
    await move(dev.auth, a.number, { status: 'in_progress' });
    await move(dev.auth, b.number, { status: 'in_progress', afterId: a.id });
    const before = new Map(t.store.tasks.map((x) => [x.id, x.position]));

    const res = await move(dev.auth, c.number, { status: 'in_progress', afterId: a.id, beforeId: b.id });
    expect(res.status).toBe(200);
    const moved = taskSummaryResponse.parse(res.body).task;
    expect(moved).toMatchObject({ key: 'TF-103', status: 'in_progress' });
    expect(await column(pm.auth, 'in_progress')).toEqual(['TF-101', 'TF-103', 'TF-102']);
    const changed = t.store.tasks.filter((x) => before.get(x.id) !== x.position).map((x) => x.id);
    expect(changed).toEqual([c.id]);
  });

  it('reorders inside a column (top, middle and bottom)', async () => {
    const { pm, sprint } = await setup();
    const [a, b, c] = await threeCards(pm.auth, sprint.id);
    await move(pm.auth, c.number, { status: 'todo', beforeId: a.id });
    expect(await column(pm.auth, 'todo')).toEqual(['TF-103', 'TF-101', 'TF-102']);
    await move(pm.auth, c.number, { status: 'todo', afterId: b.id });
    expect(await column(pm.auth, 'todo')).toEqual(['TF-101', 'TF-102', 'TF-103']);
    await move(pm.auth, a.number, { status: 'todo', afterId: b.id, beforeId: c.id });
    expect(await column(pm.auth, 'todo')).toEqual(['TF-102', 'TF-101', 'TF-103']);
  });

  it('sets doneAt when a card reaches Done and clears it when it leaves', async () => {
    const { pm, sprint } = await setup();
    const [a] = await threeCards(pm.auth, sprint.id);
    const done = taskSummaryResponse.parse((await move(pm.auth, a.number, { status: 'done' })).body).task;
    expect(done.doneAt).not.toBeNull();
    const back = taskSummaryResponse.parse((await move(pm.auth, a.number, { status: 'in_review' })).body).task;
    expect(back.doneAt).toBeNull();
  });

  it('renumbers the column when two neighbours are too close, keeping the order', async () => {
    const { pm, sprint } = await setup();
    const [a, b, c] = await threeCards(pm.auth, sprint.id);
    for (const x of t.store.tasks) if (x.id === b.id) x.position = POSITION_STEP + 1e-9;
    const res = await move(pm.auth, c.number, { status: 'todo', afterId: a.id, beforeId: b.id });
    expect(res.status).toBe(200);
    expect(await column(pm.auth, 'todo')).toEqual(['TF-101', 'TF-103', 'TF-102']);
    const positions = (await board(pm.auth)).tasks.map((x) => x.position);
    expect(positions[1]! - positions[0]!).toBeGreaterThan(1);
  });

  it('rejects invalid input with 400', async () => {
    const { pm, sprint } = await setup();
    const [a] = await threeCards(pm.auth, sprint.id);
    const bad = await move(pm.auth, a.number, { status: 'blocked', afterId: 'not-a-uuid' });
    expect(bad.status).toBe(400);
    expect(Object.keys(bad.body.error.fields).sort()).toEqual(['afterId', 'status']);
    const self = await move(pm.auth, a.number, { status: 'todo', afterId: a.id });
    expect(self.status).toBe(400);
    expect(self.body.error.fields.afterId).toMatch(/next to itself/);
  });

  it('refuses a neighbour from another project', async () => {
    const { pm, sprint } = await setup();
    const [a] = await threeCards(pm.auth, sprint.id);
    await api().post('/api/projects').set(pm.auth).send({ name: 'Mobile App', key: 'MOB', color: '#ea580c' });
    const mob = taskResponse.parse((await api().post('/api/projects/MOB/tasks').set(pm.auth).send({ title: 'Splash screen' })).body).task;
    const res = await move(pm.auth, a.number, { status: 'todo', beforeId: mob.id });
    expect(res.status).toBe(400);
    expect(res.body.error.fields.beforeId).toMatch(/not in this project/);
  });

  it('answers 409 when a neighbour is no longer in that column (stale board)', async () => {
    const { pm, sprint } = await setup();
    const [a, b, c] = await threeCards(pm.auth, sprint.id);
    const wrongColumn = await move(pm.auth, c.number, { status: 'in_progress', afterId: a.id });
    expect(wrongColumn.status).toBe(409);
    const wrongOrder = await move(pm.auth, a.number, { status: 'todo', afterId: c.id, beforeId: b.id });
    expect(wrongOrder.status).toBe(409);
    expect(await column(pm.auth, 'todo')).toEqual(['TF-101', 'TF-102', 'TF-103']);
  });

  it('needs sign-in (401) and task:move (403 for Viewers), and hides other projects (404)', async () => {
    const { pm, viewer, outsider, sprint } = await setup();
    const [a] = await threeCards(pm.auth, sprint.id);
    expect((await api().post(`/api/projects/TF/tasks/${a.number}/move`).send({ status: 'done' })).status).toBe(401);
    expect((await move(viewer.auth, a.number, { status: 'done' })).status).toBe(403);
    expect((await move(outsider.auth, a.number, { status: 'done' })).status).toBe(404);
    expect((await move(pm.auth, 999, { status: 'done' })).status).toBe(404);
    expect(await column(pm.auth, 'todo')).toEqual(['TF-101', 'TF-102', 'TF-103']);
  });

  it('follows the permission matrix: removing task:move from Developers blocks them on the next request', async () => {
    const { admin, dev, sprint, pm } = await setup();
    const [a] = await threeCards(pm.auth, sprint.id);
    expect((await move(dev.auth, a.number, { status: 'in_progress' })).status).toBe(200);
    const matrix = await api().put('/api/roles/developer/permissions/task:move').set(admin.auth).send({ granted: false });
    expect(matrix.status).toBe(200);
    expect((await move(dev.auth, a.number, { status: 'todo' })).status).toBe(403);
  });
});

describe('positions outside the board', () => {
  it('puts a task at the bottom of its new column when the dialog changes its status or sprint', async () => {
    const { pm, sprint } = await setup();
    const [a] = await threeCards(pm.auth, sprint.id);
    const x = await newTask(pm.auth, { title: 'Already in progress', sprintId: sprint.id, status: 'in_progress' });
    await api().patch(`/api/projects/TF/tasks/${a.number}`).set(pm.auth).send({ status: 'in_progress' });
    expect(await column(pm.auth, 'in_progress')).toEqual([x.key, 'TF-101']);
    await api().patch(`/api/projects/TF/tasks/${x.number}`).set(pm.auth).send({ sprintId: null });
    await api().patch(`/api/projects/TF/tasks/${x.number}`).set(pm.auth).send({ sprintId: sprint.id });
    expect(await column(pm.auth, 'in_progress')).toEqual(['TF-101', x.key]);
  });
});

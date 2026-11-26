import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { sprintResponse, taskResponse, tasksResponse } from '@taskflow/core';
import { createTestApp } from './support/test-app';

let t: ReturnType<typeof createTestApp>;
beforeEach(() => {
  t = createTestApp();
});
const api = () => request(t.app);

/** Admin, a PM who owns TF, a Developer member, a Viewer member and a Developer outsider. */
async function setup() {
  const admin = await t.signUp('Ada Admin');
  const pm = await t.signUp('Pat Manager', 'project_manager');
  const dev = await t.signUp('Dev Member', 'developer');
  const viewer = await t.signUp('Vic Viewer');
  const outsider = await t.signUp('Out Sider', 'developer');
  await api().post('/api/projects').set(pm.auth).send({ name: 'TaskFlow Web', key: 'TF', color: '#4f46e5' });
  await api().post('/api/projects/TF/members').set(pm.auth).send({ userId: dev.id });
  await api().post('/api/projects/TF/members').set(pm.auth).send({ userId: viewer.id });
  return { admin, pm, dev, viewer, outsider };
}
const newTask = async (auth: Record<string, string>, body: object = { title: 'Login page' }) =>
  taskResponse.parse((await api().post('/api/projects/TF/tasks').set(auth).send(body)).body).task;
const newSprint = async (auth: Record<string, string>, body: object = { name: 'Sprint 1', startDate: '2026-12-01', endDate: '2026-12-14' }) =>
  sprintResponse.parse((await api().post('/api/projects/TF/sprints').set(auth).send(body)).body).sprint;

describe('creating tasks', () => {
  it('numbers tasks TF-101, TF-102… with defaults and the creator as reporter', async () => {
    const { dev } = await setup();
    const a = await newTask(dev.auth);
    const b = await newTask(dev.auth, { title: 'Register page', type: 'story', priority: 'high', points: 5, assigneeId: dev.id, dueDate: '2026-12-10' });
    expect(a).toMatchObject({ key: 'TF-101', status: 'todo', type: 'task', priority: 'medium', points: null, sprint: null, reporter: { name: 'Dev Member' } });
    expect(b).toMatchObject({ key: 'TF-102', type: 'story', priority: 'high', points: 5, assignee: { id: dev.id }, dueDate: '2026-12-10' });
  });

  it('never reuses a number after a delete', async () => {
    const { pm } = await setup();
    await newTask(pm.auth);
    const second = await newTask(pm.auth);
    await api().delete(`/api/projects/TF/tasks/${second.number}`).set(pm.auth);
    expect((await newTask(pm.auth)).key).toBe('TF-103');
  });

  it('numbers each project separately', async () => {
    const { pm } = await setup();
    await api().post('/api/projects').set(pm.auth).send({ name: 'Mobile App', key: 'MOB', color: '#ea580c' });
    await newTask(pm.auth);
    const mob = taskResponse.parse((await api().post('/api/projects/MOB/tasks').set(pm.auth).send({ title: 'Splash screen' })).body).task;
    expect(mob.key).toBe('MOB-101');
  });

  it('validates fields and only allows project members as assignee', async () => {
    const { pm, outsider } = await setup();
    const bad = await api().post('/api/projects/TF/tasks').set(pm.auth).send({ title: 'ab', priority: 'urgent', points: 4 });
    expect(bad.status).toBe(400);
    expect(Object.keys(bad.body.error.fields).sort()).toEqual(['points', 'priority', 'title']);
    const notMember = await api().post('/api/projects/TF/tasks').set(pm.auth).send({ title: 'Valid title', assigneeId: outsider.id });
    expect(notMember.status).toBe(400);
    expect(notMember.body.error.fields.assigneeId).toMatch(/members of this project/);
  });

  it('only accepts a planned or active sprint of the same project', async () => {
    const { pm } = await setup();
    const s = await newSprint(pm.auth);
    expect((await newTask(pm.auth, { title: 'In a sprint', sprintId: s.id })).sprint).toEqual({ id: s.id, name: 'Sprint 1' });
    await api().post(`/api/projects/TF/sprints/${s.id}/start`).set(pm.auth);
    await api().post(`/api/projects/TF/sprints/${s.id}/complete`).set(pm.auth);
    const res = await api().post('/api/projects/TF/tasks').set(pm.auth).send({ title: 'Too late', sprintId: s.id });
    expect(res.status).toBe(400);
    expect(res.body.error.fields.sprintId).toMatch(/completed/);
  });
});

describe('permissions and visibility', () => {
  it('Viewers can read but not create, edit or delete', async () => {
    const { pm, viewer } = await setup();
    const task = await newTask(pm.auth);
    expect((await api().get('/api/projects/TF/tasks').set(viewer.auth)).status).toBe(200);
    expect((await api().get(`/api/projects/TF/tasks/${task.number}`).set(viewer.auth)).status).toBe(200);
    expect((await api().post('/api/projects/TF/tasks').set(viewer.auth).send({ title: 'Nope nope' })).status).toBe(403);
    expect((await api().patch(`/api/projects/TF/tasks/${task.number}`).set(viewer.auth).send({ title: 'Nope nope' })).status).toBe(403);
    expect((await api().delete(`/api/projects/TF/tasks/${task.number}`).set(viewer.auth)).status).toBe(403);
  });

  it('Developers cannot delete tasks by default', async () => {
    const { dev } = await setup();
    const task = await newTask(dev.auth);
    expect((await api().delete(`/api/projects/TF/tasks/${task.number}`).set(dev.auth)).status).toBe(403);
  });

  it('people outside the project get 404', async () => {
    const { pm, outsider } = await setup();
    const task = await newTask(pm.auth);
    expect((await api().get('/api/projects/TF/tasks').set(outsider.auth)).status).toBe(404);
    expect((await api().get(`/api/projects/TF/tasks/${task.number}`).set(outsider.auth)).status).toBe(404);
    expect((await api().get('/api/projects/TF/tasks')).status).toBe(401);
  });

  it('an unknown or invalid number is handled', async () => {
    const { pm } = await setup();
    expect((await api().get('/api/projects/TF/tasks/999').set(pm.auth)).status).toBe(404);
    expect((await api().get('/api/projects/TF/tasks/abc').set(pm.auth)).status).toBe(400);
  });
});

describe('editing tasks', () => {
  it('updates fields and clears optional ones', async () => {
    const { pm, dev } = await setup();
    const task = await newTask(pm.auth, { title: 'Login page', assigneeId: dev.id, points: 3, dueDate: '2026-12-10' });
    const res = await api().patch(`/api/projects/TF/tasks/${task.number}`).set(pm.auth).send({ title: 'Login page v2', priority: 'critical', assigneeId: null, points: null, dueDate: null });
    expect(res.status).toBe(200);
    expect(taskResponse.parse(res.body).task).toMatchObject({ title: 'Login page v2', priority: 'critical', assignee: null, points: null, dueDate: null });
  });

  it('records when a task becomes Done and clears it when reopened', async () => {
    const { pm } = await setup();
    const task = await newTask(pm.auth);
    const done = taskResponse.parse((await api().patch(`/api/projects/TF/tasks/${task.number}`).set(pm.auth).send({ status: 'done' })).body).task;
    expect(done.doneAt).toBe('2026-01-15T10:00:00.000Z');
    const reopened = taskResponse.parse((await api().patch(`/api/projects/TF/tasks/${task.number}`).set(pm.auth).send({ status: 'in_progress' })).body).task;
    expect(reopened.doneAt).toBeNull();
  });

  it('moves a task between sprint and backlog', async () => {
    const { pm } = await setup();
    const s = await newSprint(pm.auth);
    const task = await newTask(pm.auth);
    const moved = await api().patch(`/api/projects/TF/tasks/${task.number}`).set(pm.auth).send({ sprintId: s.id });
    expect(moved.body.task.sprint).toEqual({ id: s.id, name: 'Sprint 1' });
    const back = await api().patch(`/api/projects/TF/tasks/${task.number}`).set(pm.auth).send({ sprintId: null });
    expect(back.body.task.sprint).toBeNull();
  });

  it('deleting a planned sprint moves its tasks to the backlog', async () => {
    const { pm } = await setup();
    const s = await newSprint(pm.auth);
    const task = await newTask(pm.auth, { title: 'Survives', sprintId: s.id });
    await api().delete(`/api/projects/TF/sprints/${s.id}`).set(pm.auth);
    const after = taskResponse.parse((await api().get(`/api/projects/TF/tasks/${task.number}`).set(pm.auth)).body).task;
    expect(after.sprint).toBeNull();
  });

  it('lists tasks in number order', async () => {
    const { pm } = await setup();
    await newTask(pm.auth, { title: 'First task' });
    await newTask(pm.auth, { title: 'Second task' });
    const list = tasksResponse.parse((await api().get('/api/projects/TF/tasks').set(pm.auth)).body).tasks;
    expect(list.map((x) => x.key)).toEqual(['TF-101', 'TF-102']);
    expect(list[0]?.subtasks).toEqual({ total: 0, done: 0 });
  });
});

describe('sprints and tasks together', () => {
  it('completing a sprint moves unfinished tasks to the backlog by default; done tasks stay', async () => {
    const { pm } = await setup();
    const s = await newSprint(pm.auth);
    const open = await newTask(pm.auth, { title: 'Unfinished', sprintId: s.id });
    const done = await newTask(pm.auth, { title: 'Finished', sprintId: s.id, status: 'done' });
    await api().post(`/api/projects/TF/sprints/${s.id}/start`).set(pm.auth);
    const res = await api().post(`/api/projects/TF/sprints/${s.id}/complete`).set(pm.auth);
    expect(res.status).toBe(200);
    expect(res.body.movedTasks).toBe(1);
    const get = async (n: number) => taskResponse.parse((await api().get(`/api/projects/TF/tasks/${n}`).set(pm.auth)).body).task;
    expect((await get(open.number)).sprint).toBeNull();
    expect((await get(done.number)).sprint?.id).toBe(s.id);
  });

  it('can move unfinished tasks into the next planned sprint instead', async () => {
    const { pm } = await setup();
    const s1 = await newSprint(pm.auth);
    const s2 = await newSprint(pm.auth, { name: 'Sprint 2', startDate: '2026-12-15', endDate: '2026-12-28' });
    const open = await newTask(pm.auth, { title: 'Carry over', sprintId: s1.id });
    await api().post(`/api/projects/TF/sprints/${s1.id}/start`).set(pm.auth);
    const res = await api().post(`/api/projects/TF/sprints/${s1.id}/complete`).set(pm.auth).send({ moveUnfinishedTo: s2.id });
    expect(res.body).toMatchObject({ movedTasks: 1, sprint: { status: 'completed' } });
    const after = taskResponse.parse((await api().get(`/api/projects/TF/tasks/${open.number}`).set(pm.auth)).body).task;
    expect(after.sprint?.id).toBe(s2.id);
  });

  it('refuses to move tasks into a sprint of another project, the same sprint, or a non-planned one', async () => {
    const { pm } = await setup();
    const s1 = await newSprint(pm.auth);
    await api().post('/api/projects').set(pm.auth).send({ name: 'Mobile App', key: 'MOB', color: '#ea580c' });
    const other = sprintResponse.parse((await api().post('/api/projects/MOB/sprints').set(pm.auth).send({ name: 'M1', startDate: '2026-12-01', endDate: '2026-12-07' })).body).sprint;
    await api().post(`/api/projects/TF/sprints/${s1.id}/start`).set(pm.auth);
    for (const target of [other.id, s1.id]) {
      const res = await api().post(`/api/projects/TF/sprints/${s1.id}/complete`).set(pm.auth).send({ moveUnfinishedTo: target });
      expect(res.status).toBe(400);
      expect(res.body.error.fields.moveUnfinishedTo).toBeDefined();
    }
  });

  it('projects report task progress and members report open tasks', async () => {
    const { pm, dev } = await setup();
    await newTask(pm.auth, { title: 'Open one', assigneeId: dev.id });
    await newTask(pm.auth, { title: 'Open two', assigneeId: dev.id });
    await newTask(pm.auth, { title: 'Done one', assigneeId: dev.id, status: 'done' });
    const project = (await api().get('/api/projects/TF').set(pm.auth)).body.project;
    expect(project.taskCounts).toEqual({ total: 3, done: 1 });
    const members = (await api().get('/api/members').set(pm.auth)).body.members as { id: string; openTasks: number }[];
    expect(members.find((m) => m.id === dev.id)?.openTasks).toBe(2);
    expect(members.find((m) => m.id === pm.id)?.openTasks).toBe(0);
  });
});

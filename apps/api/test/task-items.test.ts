import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { taskResponse, tasksResponse } from '@taskflow/core';
import { createTestApp } from './support/test-app';

let t: ReturnType<typeof createTestApp>;
beforeEach(() => {
  t = createTestApp();
});
const api = () => request(t.app);

/** TF with a PM, a Developer and a Viewer as members, plus task TF-101. */
async function setup() {
  const admin = await t.signUp('Ada Admin');
  const pm = await t.signUp('Pat Manager', 'project_manager');
  const dev = await t.signUp('Dana Dev', 'developer');
  const viewer = await t.signUp('Vic Viewer');
  await api().post('/api/projects').set(pm.auth).send({ name: 'TaskFlow Web', key: 'TF', color: '#4f46e5' });
  for (const u of [dev, viewer]) await api().post('/api/projects/TF/members').set(pm.auth).send({ userId: u.id });
  await api().post('/api/projects/TF/tasks').set(pm.auth).send({ title: 'Kanban board' });
  return { admin, pm, dev, viewer };
}
const task = (res: request.Response) => taskResponse.parse(res.body).task;

describe('subtasks', () => {
  it('adds, ticks, renames and removes subtasks in order', async () => {
    const { dev } = await setup();
    await api().post('/api/projects/TF/tasks/101/subtasks').set(dev.auth).send({ title: 'Install dnd-kit' });
    const two = task(await api().post('/api/projects/TF/tasks/101/subtasks').set(dev.auth).send({ title: 'Sortable columns' }));
    expect(two.subtaskList.map((s) => s.title)).toEqual(['Install dnd-kit', 'Sortable columns']);
    const first = two.subtaskList[0];
    if (!first) throw new Error('missing subtask');

    const ticked = task(await api().patch(`/api/projects/TF/tasks/101/subtasks/${first.id}`).set(dev.auth).send({ done: true }));
    expect(ticked.subtasks).toEqual({ total: 2, done: 1 });
    const renamed = task(await api().patch(`/api/projects/TF/tasks/101/subtasks/${first.id}`).set(dev.auth).send({ title: 'Install @dnd-kit/core' }));
    expect(renamed.subtaskList[0]?.title).toBe('Install @dnd-kit/core');

    const removed = task(await api().delete(`/api/projects/TF/tasks/101/subtasks/${first.id}`).set(dev.auth));
    expect(removed.subtaskList.map((s) => s.title)).toEqual(['Sortable columns']);
    // the list view shows the count too
    const list = tasksResponse.parse((await api().get('/api/projects/TF/tasks').set(dev.auth)).body).tasks;
    expect(list[0]?.subtasks).toEqual({ total: 1, done: 0 });
  });

  it('needs task:update and validates input', async () => {
    const { pm, viewer } = await setup();
    expect((await api().post('/api/projects/TF/tasks/101/subtasks').set(viewer.auth).send({ title: 'Nope' })).status).toBe(403);
    expect((await api().post('/api/projects/TF/tasks/101/subtasks').set(pm.auth).send({ title: '  ' })).status).toBe(400);
    expect((await api().patch('/api/projects/TF/tasks/101/subtasks/0190c6a4-0000-7000-8000-000000000000').set(pm.auth).send({ done: true })).status).toBe(404);
    expect((await api().patch('/api/projects/TF/tasks/101/subtasks/not-an-id').set(pm.auth).send({ done: true })).status).toBe(400);
  });

  it('a subtask id from another task is not found', async () => {
    const { pm } = await setup();
    await api().post('/api/projects/TF/tasks').set(pm.auth).send({ title: 'Other task' });
    const s = task(await api().post('/api/projects/TF/tasks/101/subtasks').set(pm.auth).send({ title: 'Mine' })).subtaskList[0];
    expect((await api().delete(`/api/projects/TF/tasks/102/subtasks/${s?.id}`).set(pm.auth)).status).toBe(404);
  });
});

describe('comments and @mentions', () => {
  it('adds comments with the author, oldest first, and counts them', async () => {
    const { pm, dev } = await setup();
    await api().post('/api/projects/TF/tasks/101/comments').set(pm.auth).send({ body: 'Use a float position column.' });
    const res = await api().post('/api/projects/TF/tasks/101/comments').set(dev.auth).send({ body: 'Agreed, on it.' });
    expect(res.status).toBe(201);
    const tk = task(res);
    expect(tk.comments.map((c) => [c.author?.name, c.body])).toEqual([['Pat Manager', 'Use a float position column.'], ['Dana Dev', 'Agreed, on it.']]);
    expect(tk.commentCount).toBe(2);
  });

  it('remembers who was @mentioned — project members only', async () => {
    const { admin, pm } = await setup();
    await api().post('/api/projects/TF/tasks/101/comments').set(pm.auth).send({ body: '@Dana can you take this? cc @Vic Viewer and @Ada' });
    const stored = t.store.tasks[0]?.comments[0];
    const ids = new Set(stored?.mentionedUserIds);
    const byName = (n: string) => t.store.users.find((u) => u.name === n)?.id ?? '';
    expect(ids.has(byName('Dana Dev'))).toBe(true);
    expect(ids.has(byName('Vic Viewer'))).toBe(true);
    expect(ids.has(admin.id)).toBe(false); // Ada is not a member of TF
  });

  it('Viewers cannot comment; empty comments are rejected', async () => {
    const { pm, viewer } = await setup();
    expect((await api().post('/api/projects/TF/tasks/101/comments').set(viewer.auth).send({ body: 'Hi' })).status).toBe(403);
    expect((await api().post('/api/projects/TF/tasks/101/comments').set(pm.auth).send({ body: '   ' })).status).toBe(400);
  });

  it('you can delete your own comment; others cannot; Admins can', async () => {
    const { admin, pm, dev } = await setup();
    const mine = task(await api().post('/api/projects/TF/tasks/101/comments').set(dev.auth).send({ body: 'Mine' })).comments[0];
    const pms = task(await api().post('/api/projects/TF/tasks/101/comments').set(pm.auth).send({ body: 'PM note' })).comments[1];
    expect((await api().delete(`/api/projects/TF/tasks/101/comments/${pms?.id}`).set(dev.auth)).status).toBe(403);
    expect(task(await api().delete(`/api/projects/TF/tasks/101/comments/${mine?.id}`).set(dev.auth)).comments.map((c) => c.body)).toEqual(['PM note']);
    expect(task(await api().delete(`/api/projects/TF/tasks/101/comments/${pms?.id}`).set(admin.auth)).comments).toEqual([]);
    expect((await api().delete(`/api/projects/TF/tasks/101/comments/${pms?.id}`).set(admin.auth)).status).toBe(404);
  });
});

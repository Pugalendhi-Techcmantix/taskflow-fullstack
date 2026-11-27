import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { searchResponse, taskResponse } from '@taskflow/core';
import { createTestApp } from './support/test-app';

let t: ReturnType<typeof createTestApp>;
beforeEach(() => {
  t = createTestApp();
});
const api = () => request(t.app);

/** Admin; a PM in TF and MOB; a Developer only in MOB; a Viewer in no project. */
async function setup() {
  const admin = await t.signUp('Ada Admin');
  const pm = await t.signUp('Pat Manager', 'project_manager');
  const dev = await t.signUp('Dev Member', 'developer');
  const loner = await t.signUp('Lee Loner');
  await api().post('/api/projects').set(pm.auth).send({ name: 'TaskFlow Web', key: 'TF', color: '#4f46e5' });
  await api().post('/api/projects').set(pm.auth).send({ name: 'Mobile App', key: 'MOB', color: '#ea580c' });
  await api().post('/api/projects/MOB/members').set(pm.auth).send({ userId: dev.id });
  return { admin, pm, dev, loner };
}
const newTask = async (auth: Record<string, string>, key: string, title: string) =>
  taskResponse.parse((await api().post(`/api/projects/${key}/tasks`).set(auth).send({ title })).body).task;
const search = async (auth: Record<string, string>, q: string) => {
  const res = await api().get(`/api/search?q=${encodeURIComponent(q)}`).set(auth);
  expect(res.status).toBe(200);
  return searchResponse.parse(res.body);
};

describe('GET /api/search — global search', () => {
  it('finds tasks by title or key across the projects you can see', async () => {
    const { pm } = await setup();
    await newTask(pm.auth, 'TF', 'Login page');
    await newTask(pm.auth, 'MOB', 'Login screen');
    await newTask(pm.auth, 'TF', 'Settings');
    const r = await search(pm.auth, 'login');
    expect(r.tasks.map((x) => x.key).sort()).toEqual(['MOB-101', 'TF-101']);
    expect((await search(pm.auth, 'tf-102')).tasks.map((x) => x.key)).toEqual(['TF-102']);
  });

  it('puts an exact key match first', async () => {
    const { pm } = await setup();
    await newTask(pm.auth, 'TF', 'Original task');
    t.clock.advance(1000);
    await newTask(pm.auth, 'TF', 'Follow-up to TF-101'); // newer, and mentions the key in its title
    const r = await search(pm.auth, 'tf-101');
    expect(r.tasks.map((x) => x.key)).toEqual(['TF-101', 'TF-102']);
  });

  it('finds projects by name or key', async () => {
    const { pm } = await setup();
    expect((await search(pm.auth, 'mobile')).projects).toEqual([expect.objectContaining({ key: 'MOB', name: 'Mobile App', color: '#ea580c' })]);
    expect((await search(pm.auth, 'tf')).projects.map((p) => p.key)).toEqual(['TF']);
  });

  it('never shows tasks or projects you are not a member of; Admins see everything', async () => {
    const { admin, pm, dev, loner } = await setup();
    await newTask(pm.auth, 'TF', 'Secret roadmap');
    await newTask(pm.auth, 'MOB', 'Public roadmap');
    expect((await search(dev.auth, 'roadmap')).tasks.map((x) => x.key)).toEqual(['MOB-101']);
    expect((await search(dev.auth, 'TaskFlow')).projects).toEqual([]);
    expect(await search(loner.auth, 'roadmap')).toEqual({ tasks: [], projects: [] });
    expect((await search(admin.auth, 'roadmap')).tasks).toHaveLength(2);
  });

  it('returns at most 7 tasks and 3 projects', async () => {
    const { pm } = await setup();
    for (let i = 0; i < 10; i++) await newTask(pm.auth, 'TF', `Alpha task ${i}`);
    for (const [name, key] of [['Alpha One', 'AONE'], ['Alpha Two', 'ATWO'], ['Alpha Three', 'ATHR'], ['Alpha Four', 'AFOU']]) {
      await api().post('/api/projects').set(pm.auth).send({ name, key, color: '#0891b2' });
    }
    const r = await search(pm.auth, 'alpha');
    expect(r.tasks).toHaveLength(7);
    expect(r.projects).toHaveLength(3);
  });

  it('treats LIKE wildcards literally', async () => {
    const { pm } = await setup();
    await newTask(pm.auth, 'TF', 'Plain title');
    expect((await search(pm.auth, '%')).tasks).toEqual([]);
    expect((await search(pm.auth, '_')).tasks).toEqual([]);
  });

  it('refuses an empty, blank or too-long query with 400', async () => {
    const { pm } = await setup();
    for (const q of ['', '   ', 'x'.repeat(101)]) {
      const res = await api().get(`/api/search?q=${encodeURIComponent(q)}`).set(pm.auth);
      expect(res.status, JSON.stringify(q)).toBe(400);
      expect(res.body.error.fields).toHaveProperty('q');
    }
    expect((await api().get('/api/search').set(pm.auth)).status).toBe(400);
  });

  it('needs sign-in', async () => {
    expect((await api().get('/api/search?q=login')).status).toBe(401);
  });
});

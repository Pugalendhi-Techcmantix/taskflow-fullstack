import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { sprintResponse, sprintsResponse } from '@taskflow/core';
import { createTestApp } from './support/test-app';

let t: ReturnType<typeof createTestApp>;
beforeEach(() => {
  t = createTestApp();
});
const api = () => request(t.app);

const sprint1 = { name: 'Sprint 1', goal: 'Auth foundation', startDate: '2026-12-01', endDate: '2026-12-14' };
const sprint2 = { name: 'Sprint 2', startDate: '2026-12-15', endDate: '2026-12-28' };

/** Admin, a Project Manager who owns project TF, a Developer member and a Developer outsider. */
async function setup() {
  const admin = await t.signUp('Ada Admin');
  const pm = await t.signUp('Pat Manager', 'project_manager');
  const dev = await t.signUp('Dev Member', 'developer');
  const outsider = await t.signUp('Out Sider', 'developer');
  await api().post('/api/projects').set(pm.auth).send({ name: 'TaskFlow Web', key: 'TF', color: '#4f46e5' });
  await api().post('/api/projects/TF/members').set(pm.auth).send({ userId: dev.id });
  return { admin, pm, dev, outsider };
}
const create = async (auth: Record<string, string>, body: object = sprint1) =>
  sprintResponse.parse((await api().post('/api/projects/TF/sprints').set(auth).send(body)).body).sprint;

describe('creating and listing sprints', () => {
  it('creates a planned sprint', async () => {
    const { pm } = await setup();
    const res = await api().post('/api/projects/TF/sprints').set(pm.auth).send(sprint1);
    expect(res.status).toBe(201);
    expect(sprintResponse.parse(res.body).sprint).toMatchObject({ ...sprint1, projectKey: 'TF', status: 'planned', startedAt: null });
  });

  it('lists active first, then planned by date, then completed', async () => {
    const { pm } = await setup();
    const a = await create(pm.auth, sprint1);
    await create(pm.auth, { ...sprint2, name: 'Later' });
    await create(pm.auth, { name: 'Next', startDate: '2026-12-08', endDate: '2026-12-10' });
    await api().post(`/api/projects/TF/sprints/${a.id}/start`).set(pm.auth);
    const list = sprintsResponse.parse((await api().get('/api/projects/TF/sprints').set(pm.auth)).body).sprints;
    expect(list.map((s) => [s.name, s.status])).toEqual([['Sprint 1', 'active'], ['Next', 'planned'], ['Later', 'planned']]);
  });

  it('validates input', async () => {
    const { pm } = await setup();
    const res = await api().post('/api/projects/TF/sprints').set(pm.auth).send({ name: '', startDate: '2026-02-30', endDate: 'soon' });
    expect(res.status).toBe(400);
    expect(Object.keys(res.body.error.fields).sort()).toEqual(['endDate', 'name', 'startDate']);
    const backwards = await api().post('/api/projects/TF/sprints').set(pm.auth).send({ ...sprint1, endDate: '2026-11-30' });
    expect(backwards.status).toBe(400);
    expect(backwards.body.error.fields.endDate).toMatch(/on or after/);
  });
});

describe('who can do what', () => {
  it('members can read; only sprint:manage can change', async () => {
    const { pm, dev } = await setup();
    const s = await create(pm.auth);
    expect((await api().get('/api/projects/TF/sprints').set(dev.auth)).status).toBe(200);
    expect((await api().post('/api/projects/TF/sprints').set(dev.auth).send(sprint2)).status).toBe(403);
    expect((await api().post(`/api/projects/TF/sprints/${s.id}/start`).set(dev.auth)).status).toBe(403);
    expect((await api().delete(`/api/projects/TF/sprints/${s.id}`).set(dev.auth)).status).toBe(403);
    expect((await api().get('/api/projects/TF/sprints')).status).toBe(401);
  });

  it('people who cannot see the project get 404, even with sprint:manage', async () => {
    const { pm, outsider } = await setup();
    const otherPm = await t.signUp('Other Manager', 'project_manager');
    const s = await create(pm.auth);
    expect((await api().get('/api/projects/TF/sprints').set(outsider.auth)).status).toBe(404);
    expect((await api().post(`/api/projects/TF/sprints/${s.id}/start`).set(otherPm.auth)).status).toBe(404);
  });

  it('a sprint id from another project is not found', async () => {
    const { pm } = await setup();
    await api().post('/api/projects').set(pm.auth).send({ name: 'Mobile App', key: 'MOB', color: '#ea580c' });
    const s = await create(pm.auth);
    expect((await api().post(`/api/projects/MOB/sprints/${s.id}/start`).set(pm.auth)).status).toBe(404);
  });
});

describe('lifecycle', () => {
  it('planned → active → completed', async () => {
    const { pm } = await setup();
    const s = await create(pm.auth);
    const started = sprintResponse.parse((await api().post(`/api/projects/TF/sprints/${s.id}/start`).set(pm.auth)).body).sprint;
    expect(started.status).toBe('active');
    expect(started.startedAt).toBe('2026-01-15T10:00:00.000Z');
    expect(started.startDate).toBe(sprint1.startDate); // planned dates are kept
    const done = sprintResponse.parse((await api().post(`/api/projects/TF/sprints/${s.id}/complete`).set(pm.auth)).body).sprint;
    expect(done.status).toBe('completed');
    expect(done.completedAt).not.toBeNull();
  });

  it('the project reports its active sprint (shown on project cards)', async () => {
    const { pm } = await setup();
    const s = await create(pm.auth);
    expect((await api().get('/api/projects/TF').set(pm.auth)).body.project.activeSprint).toBeNull();
    await api().post(`/api/projects/TF/sprints/${s.id}/start`).set(pm.auth);
    expect((await api().get('/api/projects').set(pm.auth)).body.projects[0].activeSprint).toEqual({ id: s.id, name: 'Sprint 1' });
    await api().post(`/api/projects/TF/sprints/${s.id}/complete`).set(pm.auth);
    expect((await api().get('/api/projects/TF').set(pm.auth)).body.project.activeSprint).toBeNull();
  });

  it('refuses a second active sprint in the same project', async () => {
    const { pm } = await setup();
    const a = await create(pm.auth, sprint1);
    const b = await create(pm.auth, sprint2);
    await api().post(`/api/projects/TF/sprints/${a.id}/start`).set(pm.auth);
    const res = await api().post(`/api/projects/TF/sprints/${b.id}/start`).set(pm.auth);
    expect(res.status).toBe(409);
    expect(res.body.error.message).toMatch(/already active/);
    // After completing the first, the second can start
    await api().post(`/api/projects/TF/sprints/${a.id}/complete`).set(pm.auth);
    expect((await api().post(`/api/projects/TF/sprints/${b.id}/start`).set(pm.auth)).status).toBe(200);
  });

  it('allows one active sprint per project, not per workspace', async () => {
    const { pm } = await setup();
    await api().post('/api/projects').set(pm.auth).send({ name: 'Mobile App', key: 'MOB', color: '#ea580c' });
    const a = await create(pm.auth);
    const m = sprintResponse.parse((await api().post('/api/projects/MOB/sprints').set(pm.auth).send(sprint1)).body).sprint;
    expect((await api().post(`/api/projects/TF/sprints/${a.id}/start`).set(pm.auth)).status).toBe(200);
    expect((await api().post(`/api/projects/MOB/sprints/${m.id}/start`).set(pm.auth)).status).toBe(200);
  });

  it('rejects wrong transitions', async () => {
    const { pm } = await setup();
    const s = await create(pm.auth);
    expect((await api().post(`/api/projects/TF/sprints/${s.id}/complete`).set(pm.auth)).status).toBe(409); // not started
    await api().post(`/api/projects/TF/sprints/${s.id}/start`).set(pm.auth);
    expect((await api().post(`/api/projects/TF/sprints/${s.id}/start`).set(pm.auth)).status).toBe(409); // already active
    await api().post(`/api/projects/TF/sprints/${s.id}/complete`).set(pm.auth);
    expect((await api().post(`/api/projects/TF/sprints/${s.id}/start`).set(pm.auth)).status).toBe(409); // completed
  });
});

describe('editing and deleting', () => {
  it('planned sprints can change anything', async () => {
    const { pm } = await setup();
    const s = await create(pm.auth);
    const res = await api().patch(`/api/projects/TF/sprints/${s.id}`).set(pm.auth).send({ name: 'Sprint One', goal: 'New goal', startDate: '2026-12-02', endDate: '2026-12-16' });
    expect(res.status).toBe(200);
    expect(res.body.sprint).toMatchObject({ name: 'Sprint One', goal: 'New goal', startDate: '2026-12-02', endDate: '2026-12-16' });
  });

  it('active sprints keep their start date; completed sprints are read-only', async () => {
    const { pm } = await setup();
    const s = await create(pm.auth);
    await api().post(`/api/projects/TF/sprints/${s.id}/start`).set(pm.auth);
    expect((await api().patch(`/api/projects/TF/sprints/${s.id}`).set(pm.auth).send({ endDate: '2026-12-20' })).status).toBe(200);
    expect((await api().patch(`/api/projects/TF/sprints/${s.id}`).set(pm.auth).send({ startDate: '2026-12-03' })).status).toBe(409);
    await api().post(`/api/projects/TF/sprints/${s.id}/complete`).set(pm.auth);
    expect((await api().patch(`/api/projects/TF/sprints/${s.id}`).set(pm.auth).send({ name: 'Renamed' })).status).toBe(409);
  });

  it('checks the merged dates when only one date changes', async () => {
    const { pm } = await setup();
    const s = await create(pm.auth);
    const res = await api().patch(`/api/projects/TF/sprints/${s.id}`).set(pm.auth).send({ endDate: '2026-11-20' });
    expect(res.status).toBe(409);
    expect(res.body.error.fields.endDate).toBeDefined();
  });

  it('only planned sprints can be deleted', async () => {
    const { pm } = await setup();
    const a = await create(pm.auth, sprint1);
    const b = await create(pm.auth, sprint2);
    await api().post(`/api/projects/TF/sprints/${a.id}/start`).set(pm.auth);
    expect((await api().delete(`/api/projects/TF/sprints/${a.id}`).set(pm.auth)).status).toBe(409);
    expect((await api().delete(`/api/projects/TF/sprints/${b.id}`).set(pm.auth)).status).toBe(204);
    expect((await api().delete(`/api/projects/TF/sprints/${b.id}`).set(pm.auth)).status).toBe(404);
  });

  it('a deleted project takes its sprints with it', async () => {
    const { admin, pm } = await setup();
    await create(pm.auth);
    await api().delete('/api/projects/TF').set(admin.auth);
    expect((await api().get('/api/projects/TF/sprints').set(admin.auth)).status).toBe(404);
  });
});

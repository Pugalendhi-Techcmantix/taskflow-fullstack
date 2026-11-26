import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { projectResponse, projectsResponse } from '@taskflow/core';
import { createTestApp } from './support/test-app';

let t: ReturnType<typeof createTestApp>;
beforeEach(() => {
  t = createTestApp();
});
const api = () => request(t.app);
const web = { name: 'TaskFlow Web', key: 'tf', description: 'Core web app', color: '#4f46e5' };

/** Admin + a Project Manager + a Developer, each with an auth header. */
async function team() {
  const admin = await t.signUp('Ada Admin'); // first account → Admin
  const pm = await t.signUp('Pat Manager', 'project_manager');
  const dev = await t.signUp('Dev Person', 'developer');
  return { admin, pm, dev };
}

describe('POST /api/projects', () => {
  it('creates a project with an uppercase key and the creator as first member', async () => {
    const { pm } = await team();
    const res = await api().post('/api/projects').set(pm.auth).send(web);
    expect(res.status).toBe(201);
    const { project } = projectResponse.parse(res.body);
    expect(project).toMatchObject({ key: 'TF', name: 'TaskFlow Web', description: 'Core web app', color: '#4f46e5', isMember: true });
    expect(project.members.map((m) => m.id)).toEqual([pm.id]);
  });

  it('rejects a duplicate key with a field error', async () => {
    const { pm } = await team();
    await api().post('/api/projects').set(pm.auth).send(web);
    const res = await api().post('/api/projects').set(pm.auth).send({ ...web, name: 'Another one', key: 'TF' });
    expect(res.status).toBe(409);
    expect(res.body.error.fields.key).toMatch(/already used/);
  });

  it('validates every field', async () => {
    const { pm } = await team();
    const res = await api().post('/api/projects').set(pm.auth).send({ name: 'ab', key: 'T1', color: 'red', description: 'x'.repeat(501) });
    expect(res.status).toBe(400);
    expect(Object.keys(res.body.error.fields).sort()).toEqual(['color', 'description', 'key', 'name']);
  });

  it('needs project:create (Developer) and a session', async () => {
    const { dev } = await team();
    expect((await api().post('/api/projects').set(dev.auth).send(web)).status).toBe(403);
    expect((await api().post('/api/projects').send(web)).status).toBe(401);
  });
});

describe('GET /api/projects/key-available', () => {
  it('says whether a key is free', async () => {
    const { pm } = await team();
    await api().post('/api/projects').set(pm.auth).send(web);
    expect((await api().get('/api/projects/key-available?key=tf').set(pm.auth)).body).toEqual({ key: 'TF', available: false });
    expect((await api().get('/api/projects/key-available?key=MOB').set(pm.auth)).body).toEqual({ key: 'MOB', available: true });
    expect((await api().get('/api/projects/key-available?key=x').set(pm.auth)).status).toBe(400);
  });
});

describe('visibility', () => {
  it('shows a project to its members and Admins only; others get 404', async () => {
    const { admin, pm, dev } = await team();
    await api().post('/api/projects').set(pm.auth).send(web);

    expect(projectsResponse.parse((await api().get('/api/projects').set(dev.auth)).body).projects).toEqual([]);
    expect((await api().get('/api/projects/TF').set(dev.auth)).status).toBe(404);

    const asAdmin = projectsResponse.parse((await api().get('/api/projects').set(admin.auth)).body).projects;
    expect(asAdmin.map((p) => [p.key, p.isMember])).toEqual([['TF', false]]);
    expect((await api().get('/api/projects/tf').set(admin.auth)).status).toBe(200); // key is case-insensitive in URLs

    await api().post('/api/projects/TF/members').set(pm.auth).send({ userId: dev.id });
    expect(projectsResponse.parse((await api().get('/api/projects').set(dev.auth)).body).projects.map((p) => p.key)).toEqual(['TF']);
  });

  it('does not let someone with permission edit a project they cannot see', async () => {
    const { pm } = await team();
    const otherPm = await t.signUp('Other Manager', 'project_manager');
    await api().post('/api/projects').set(pm.auth).send(web);
    expect((await api().patch('/api/projects/TF').set(otherPm.auth).send({ name: 'Hijacked' })).status).toBe(404);
  });
});

describe('PATCH /api/projects/:key', () => {
  it('updates name, description and colour but never the key', async () => {
    const { pm } = await team();
    await api().post('/api/projects').set(pm.auth).send(web);
    const res = await api().patch('/api/projects/TF').set(pm.auth).send({ name: 'TaskFlow App', color: '#16a34a', key: 'ZZ' });
    expect(res.status).toBe(200);
    expect(projectResponse.parse(res.body).project).toMatchObject({ key: 'TF', name: 'TaskFlow App', color: '#16a34a', description: 'Core web app' });
  });

  it('needs project:update and at least one valid field', async () => {
    const { pm, dev } = await team();
    await api().post('/api/projects').set(pm.auth).send(web);
    await api().post('/api/projects/TF/members').set(pm.auth).send({ userId: dev.id });
    expect((await api().patch('/api/projects/TF').set(dev.auth).send({ name: 'Nope' })).status).toBe(403);
    expect((await api().patch('/api/projects/TF').set(pm.auth).send({})).status).toBe(400);
    expect((await api().patch('/api/projects/NOPE').set(pm.auth).send({ name: 'Whatever' })).status).toBe(404);
  });
});

describe('DELETE /api/projects/:key', () => {
  it('needs project:delete (Project Managers lack it by default); Admins can delete', async () => {
    const { admin, pm } = await team();
    await api().post('/api/projects').set(pm.auth).send(web);
    expect((await api().delete('/api/projects/TF').set(pm.auth)).status).toBe(403);
    expect((await api().delete('/api/projects/TF').set(admin.auth)).status).toBe(204);
    expect((await api().get('/api/projects/TF').set(admin.auth)).status).toBe(404);
    // The key is free again
    expect((await api().get('/api/projects/key-available?key=TF').set(admin.auth)).body.available).toBe(true);
  });
});

describe('project members', () => {
  it('adds and removes members', async () => {
    const { pm, dev } = await team();
    await api().post('/api/projects').set(pm.auth).send(web);
    const added = await api().post('/api/projects/TF/members').set(pm.auth).send({ userId: dev.id });
    expect(added.status).toBe(201);
    expect(projectResponse.parse(added.body).project.members.map((m) => m.name)).toEqual(['Pat Manager', 'Dev Person']);

    expect((await api().post('/api/projects/TF/members').set(pm.auth).send({ userId: dev.id })).status).toBe(409);
    expect((await api().delete(`/api/projects/TF/members/${dev.id}`).set(pm.auth)).status).toBe(204);
    expect((await api().delete(`/api/projects/TF/members/${dev.id}`).set(pm.auth)).status).toBe(404);
    expect((await api().get('/api/projects/TF').set(dev.auth)).status).toBe(404);
  });

  it('rejects unknown people and bad ids', async () => {
    const { pm } = await team();
    await api().post('/api/projects').set(pm.auth).send(web);
    const unknown = await api().post('/api/projects/TF/members').set(pm.auth).send({ userId: '0190c6a4-0000-7000-8000-000000000000' });
    expect(unknown.status).toBe(400);
    expect(unknown.body.error.fields.userId).toBeDefined();
    expect((await api().post('/api/projects/TF/members').set(pm.auth).send({ userId: 'nope' })).status).toBe(400);
    expect((await api().delete('/api/projects/TF/members/nope').set(pm.auth)).status).toBe(400);
  });
});

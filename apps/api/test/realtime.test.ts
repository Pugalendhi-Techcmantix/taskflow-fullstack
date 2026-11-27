import request from 'supertest';
import { io as connect, type Socket } from 'socket.io-client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { REALTIME, notificationMessage, projectChangedMessage, taskResponse } from '@taskflow/core';
import { createTestApp } from './support/test-app';

let t: ReturnType<typeof createTestApp>;
let server: Awaited<ReturnType<typeof t.listen>>;
const sockets: Socket[] = [];

beforeEach(async () => {
  t = createTestApp();
  server = await t.listen();
});
afterEach(async () => {
  for (const s of sockets.splice(0)) s.disconnect();
  await server.close();
});
const api = () => request(t.app);

/** A connected socket for this token (rejects if the server refuses it). */
function socketFor(token: string | undefined): Promise<Socket> {
  const socket = connect(server.url, { transports: ['websocket'], auth: token === undefined ? {} : { token }, reconnection: false, forceNew: true });
  sockets.push(socket);
  return new Promise((resolve, reject) => {
    socket.once('connect', () => resolve(socket));
    socket.once('connect_error', (err) => reject(err));
  });
}

/** Everything a socket receives for `event`, kept in order. */
function collect(socket: Socket, event: string): unknown[] {
  const got: unknown[] = [];
  socket.on(event, (message: unknown) => got.push(message));
  return got;
}

/** Waits until `check` passes (messages arrive asynchronously). */
async function eventually(check: () => void, ms = 2000) {
  const end = Date.now() + ms;
  for (;;) {
    try {
      check();
      return;
    } catch (err) {
      if (Date.now() > end) throw err;
      await new Promise((r) => setTimeout(r, 20));
    }
  }
}
/** Gives the server a moment to deliver anything it (wrongly) might. */
const settle = () => new Promise((r) => setTimeout(r, 150));

async function setup() {
  await t.signUp('Ada Admin');
  const pm = await t.signUp('Pat Manager', 'project_manager');
  const dev = await t.signUp('Dev Member', 'developer');
  const outsider = await t.signUp('Out Sider', 'developer');
  await api().post('/api/projects').set(pm.auth).send({ name: 'TaskFlow Web', key: 'TF', color: '#4f46e5' });
  await api().post('/api/projects/TF/members').set(pm.auth).send({ userId: dev.id });
  return { pm, dev, outsider };
}

describe('Socket.IO connection', () => {
  it('refuses a handshake without a valid access token', async () => {
    await setup();
    await expect(socketFor(undefined)).rejects.toThrow('unauthorized');
    await expect(socketFor('not-a-jwt')).rejects.toThrow('unauthorized');
  });

  it('accepts a signed-in user', async () => {
    const { dev } = await setup();
    const socket = await socketFor(dev.token);
    expect(socket.connected).toBe(true);
  });
});

describe('live project updates', () => {
  it("another member sees a change live; a non-member doesn't", async () => {
    const { pm, dev, outsider } = await setup();
    const devSocket = await socketFor(dev.token);
    const outsiderSocket = await socketFor(outsider.token);
    const devGot = collect(devSocket, REALTIME.projectChanged);
    const outsiderGot = collect(outsiderSocket, REALTIME.projectChanged);

    taskResponse.parse((await api().post('/api/projects/TF/tasks').set(pm.auth).send({ title: 'Login page' })).body);
    await api().post('/api/projects/TF/tasks/101/move').set(pm.auth).send({ status: 'in_progress' });

    await eventually(() => expect(devGot).toHaveLength(2));
    expect(devGot.map((m) => projectChangedMessage.parse(m))).toEqual([
      { projectKey: 'TF', actor: { id: pm.id, name: 'Pat Manager' }, event: { action: 'task.created', task: { key: 'TF-101', title: 'Login page' } } },
      { projectKey: 'TF', actor: { id: pm.id, name: 'Pat Manager' }, event: { action: 'task.moved', task: { key: 'TF-101', title: 'Login page' }, from: 'todo', to: 'in_progress' } },
    ]);
    await settle();
    expect(outsiderGot).toEqual([]);
  });

  it('follows membership while connected: added → starts hearing, removed → stops', async () => {
    const { pm, outsider } = await setup();
    const socket = await socketFor(outsider.token);
    const got = collect(socket, REALTIME.projectChanged);
    await api().post('/api/projects/TF/members').set(pm.auth).send({ userId: outsider.id });
    await api().post('/api/projects/TF/tasks').set(pm.auth).send({ title: 'After joining' });
    await eventually(() => expect(got.map((m) => projectChangedMessage.parse(m).event.action)).toContain('task.created'));
    await api().delete(`/api/projects/TF/members/${outsider.id}`).set(pm.auth);
    const before = got.length;
    await api().post('/api/projects/TF/tasks').set(pm.auth).send({ title: 'After leaving' });
    await settle();
    // the removal itself is the last thing they hear
    expect(got.slice(before - 1).map((m) => projectChangedMessage.parse(m).event.action)).toEqual(['project.member_removed']);
  });
});

describe('live notifications', () => {
  it('a mention reaches the mentioned user (and only them) with the unread count', async () => {
    const { pm, dev, outsider } = await setup();
    const devSocket = await socketFor(dev.token);
    const pmSocket = await socketFor(pm.token);
    const devGot = collect(devSocket, REALTIME.notification);
    const pmGot = collect(pmSocket, REALTIME.notification);
    const outsiderGot = collect(await socketFor(outsider.token), REALTIME.notification);

    await api().post('/api/projects/TF/tasks').set(pm.auth).send({ title: 'Login page' });
    await api().post('/api/projects/TF/tasks/101/comments').set(pm.auth).send({ body: 'Can you look, @Dev Member?' });

    await eventually(() => expect(devGot).toHaveLength(1));
    const message = notificationMessage.parse(devGot[0]);
    expect(message.unread).toBe(1);
    expect(message.notification).toMatchObject({ read: false, actor: { name: 'Pat Manager' }, task: { key: 'TF-101' }, data: { kind: 'mentioned' } });
    await settle();
    expect(pmGot).toEqual([]);
    expect(outsiderGot).toEqual([]);
  });
});

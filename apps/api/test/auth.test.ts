import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { authResponse } from '@taskflow/core';
import { REUSE_GRACE_MS } from '../src/modules/auth/auth.service';
import { createTestApp } from './support/test-app';

const alice = { name: 'Alice Kumar', email: 'alice@example.com', password: 'correct-horse-1' };

/** Pulls the refresh cookie ("tf_refresh=...") out of a Set-Cookie header. */
function refreshCookie(res: request.Response): string {
  const raw: unknown = res.headers['set-cookie'];
  const list = Array.isArray(raw) ? raw.map(String) : [];
  const cookie = list.find((c) => c.startsWith('tf_refresh=') && !c.startsWith('tf_refresh=;'));
  if (!cookie) throw new Error('no tf_refresh cookie set');
  return cookie.split(';')[0] ?? '';
}

let t: ReturnType<typeof createTestApp>;
beforeEach(() => {
  t = createTestApp(); // fresh in-memory data for every test
});
const api = () => request(t.app);
const registerAlice = () => api().post('/api/auth/register').send(alice);

describe('GET /api/health', () => {
  it('reports ok', async () => {
    const res = await api().get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok', database: 'up' });
  });
});

describe('POST /api/auth/register', () => {
  it('creates the user, returns an access token and sets an httpOnly refresh cookie', async () => {
    const res = await registerAlice();
    expect(res.status).toBe(201);
    const body = authResponse.parse(res.body);
    expect(body.user).toMatchObject({ name: alice.name, email: alice.email });
    expect(JSON.stringify(res.body)).not.toMatch(/password/i);

    const setCookie = String(res.headers['set-cookie']);
    expect(setCookie).toContain('HttpOnly');
    expect(setCookie).toContain('SameSite=Strict');
    expect(setCookie).toContain('Path=/api/auth');
  });

  it('stores the password as a bcrypt hash, never in plain text', async () => {
    await registerAlice();
    const row = t.store.users[0];
    expect(row?.passwordHash).not.toBe(alice.password);
    expect(row?.passwordHash).toMatch(/^\$2[aby]\$/);
  });

  it('stores only a hash of the refresh token', async () => {
    const cookie = refreshCookie(await registerAlice());
    const raw = cookie.split('=')[1] ?? '';
    expect(t.store.tokens).toHaveLength(1);
    expect(t.store.tokens[0]?.tokenHash).not.toBe(raw);
  });

  it('rejects a duplicate email regardless of case, with a field error', async () => {
    await registerAlice();
    const res = await api().post('/api/auth/register').send({ ...alice, email: '  ALICE@Example.com ' });
    expect(res.status).toBe(409);
    expect(res.body.error.fields.email).toBe('An account with this email already exists');
  });

  it('returns 400 with per-field messages for invalid input', async () => {
    const res = await api().post('/api/auth/register').send({ name: 'A', email: 'x', password: '123' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_FAILED');
    expect(Object.keys(res.body.error.fields).sort()).toEqual(['email', 'name', 'password']);
  });

  it('returns 400 for a body that is not JSON', async () => {
    const res = await api().post('/api/auth/register').set('Content-Type', 'application/json').send('{bad');
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_FAILED');
  });
});

describe('POST /api/auth/login', () => {
  it('signs in with the right password (email is case-insensitive)', async () => {
    await registerAlice();
    const res = await api().post('/api/auth/login').send({ email: 'Alice@Example.com', password: alice.password });
    expect(res.status).toBe(200);
    expect(authResponse.parse(res.body).user.email).toBe(alice.email);
    expect(refreshCookie(res)).toMatch(/^tf_refresh=/);
  });

  it('gives the same answer for a wrong password and an unknown email', async () => {
    await registerAlice();
    const wrongPw = await api().post('/api/auth/login').send({ email: alice.email, password: 'wrong-password' });
    const noUser = await api().post('/api/auth/login').send({ email: 'nobody@example.com', password: 'whatever1' });
    expect(wrongPw.status).toBe(401);
    expect(noUser.status).toBe(401);
    expect(wrongPw.body).toEqual(noUser.body);
  });
});

describe('GET /api/auth/me', () => {
  it('requires a valid access token', async () => {
    expect((await api().get('/api/auth/me')).status).toBe(401);
    expect((await api().get('/api/auth/me').set('Authorization', 'Bearer not-a-jwt')).status).toBe(401);
    expect((await api().get('/api/auth/me').set('Authorization', 'Basic abc')).status).toBe(401);
  });

  it('returns the signed-in user', async () => {
    const { accessToken } = authResponse.parse((await registerAlice()).body);
    const res = await api().get('/api/auth/me').set('Authorization', `Bearer ${accessToken}`);
    expect(res.status).toBe(200);
    expect(res.body.user.email).toBe(alice.email);
  });
});

describe('POST /api/auth/refresh', () => {
  it('returns 401 without a cookie', async () => {
    expect((await api().post('/api/auth/refresh')).status).toBe(401);
  });

  it('rotates the refresh token on every use', async () => {
    const first = refreshCookie(await registerAlice());
    const res = await api().post('/api/auth/refresh').set('Cookie', first);
    expect(res.status).toBe(200);
    expect(authResponse.parse(res.body).user.email).toBe(alice.email);
    expect(refreshCookie(res)).not.toBe(first);
  });

  it('survives two tabs refreshing at the same moment', async () => {
    const cookie = refreshCookie(await registerAlice());
    const [a, b] = await Promise.all([
      api().post('/api/auth/refresh').set('Cookie', cookie),
      api().post('/api/auth/refresh').set('Cookie', cookie),
    ]);
    expect([a.status, b.status]).toEqual([200, 200]);
  });

  it('treats re-use of an old token as theft and ends the whole login', async () => {
    const stolen = refreshCookie(await registerAlice());
    const current = refreshCookie(await api().post('/api/auth/refresh').set('Cookie', stolen));
    t.clock.advance(REUSE_GRACE_MS + 1_000); // outside the two-tab grace window

    expect((await api().post('/api/auth/refresh').set('Cookie', stolen)).status).toBe(401);
    expect((await api().post('/api/auth/refresh').set('Cookie', current)).status).toBe(401);
  });

  it('rejects an expired token and clears the cookie', async () => {
    const cookie = refreshCookie(await registerAlice());
    t.clock.advance(15 * 86_400_000); // 15 days > 14-day lifetime
    const res = await api().post('/api/auth/refresh').set('Cookie', cookie);
    expect(res.status).toBe(401);
    expect(String(res.headers['set-cookie'])).toMatch(/tf_refresh=;/);
  });
});

describe('POST /api/auth/logout', () => {
  it('revokes the session so the cookie no longer works', async () => {
    const cookie = refreshCookie(await registerAlice());
    expect((await api().post('/api/auth/logout').set('Cookie', cookie)).status).toBe(204);
    expect((await api().post('/api/auth/refresh').set('Cookie', cookie)).status).toBe(401);
  });

  it('succeeds even without a session', async () => {
    expect((await api().post('/api/auth/logout')).status).toBe(204);
  });
});

describe('unknown routes', () => {
  it('return a JSON 404', async () => {
    const res = await api().get('/api/nope');
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });
});

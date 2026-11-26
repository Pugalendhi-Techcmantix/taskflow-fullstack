import { createHash, randomBytes, randomUUID } from 'node:crypto';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import type { LoginInput, PublicUser, RegisterInput } from '@taskflow/core';
import { conflict, unauthorized } from '../../http/errors';
import { EmailTakenError, type AuthRepositories, type UserRecord } from './auth.repository';

export type AuthConfig = {
  jwtSecret: string;
  accessTokenTtlSeconds: number;
  refreshTokenTtlDays: number;
  bcryptRounds: number;
};

const ISSUER = 'taskflow-api';
const AUDIENCE = 'taskflow-web';
const DAY_MS = 86_400_000;
/**
 * Two tabs can refresh at the same moment with the same cookie. A token revoked less than this
 * long ago is treated as that harmless race, not as theft, so the user is not logged out.
 */
export const REUSE_GRACE_MS = 15_000;

export const toPublicUser = (u: UserRecord): PublicUser => ({
  id: u.id,
  name: u.name,
  email: u.email,
  createdAt: u.createdAt.toISOString(),
});

const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');

export type AuthService = ReturnType<typeof createAuthService>;

export function createAuthService(repos: AuthRepositories, config: AuthConfig, now: () => Date = () => new Date()) {
  const { users, refreshTokens } = repos;
  /** Compared against when the email does not exist, so a wrong email takes as long as a wrong password. */
  const dummyHash = bcrypt.hashSync('timing-equaliser-not-a-real-password', config.bcryptRounds);

  /* ---------- users ---------- */

  async function register(input: RegisterInput): Promise<UserRecord> {
    const passwordHash = await bcrypt.hash(input.password, config.bcryptRounds);
    try {
      return await users.create({ name: input.name, email: input.email, passwordHash });
    } catch (err) {
      if (err instanceof EmailTakenError) {
        throw conflict('An account with this email already exists', { email: 'An account with this email already exists' });
      }
      throw err;
    }
  }

  async function login(input: LoginInput): Promise<UserRecord> {
    const user = await users.findByEmail(input.email);
    const ok = await bcrypt.compare(input.password, user?.passwordHash ?? dummyHash);
    if (!user || !ok) throw unauthorized('Email or password is incorrect');
    return user;
  }

  async function getUser(id: string): Promise<UserRecord> {
    const user = await users.findById(id);
    if (!user) throw unauthorized();
    return user;
  }

  /* ---------- access token: short-lived JWT, kept only in browser memory ---------- */

  function signAccessToken(userId: string): string {
    return jwt.sign({}, config.jwtSecret, {
      algorithm: 'HS256',
      subject: userId,
      issuer: ISSUER,
      audience: AUDIENCE,
      expiresIn: config.accessTokenTtlSeconds,
    });
  }

  /** Returns the user id, or throws 401. */
  function verifyAccessToken(token: string): string {
    let sub: string | undefined;
    try {
      const payload = jwt.verify(token, config.jwtSecret, { algorithms: ['HS256'], issuer: ISSUER, audience: AUDIENCE });
      sub = typeof payload === 'string' ? undefined : payload.sub;
    } catch {
      throw unauthorized('Your session has expired');
    }
    if (!sub) throw unauthorized();
    return sub;
  }

  /* ---------- refresh token: random, opaque, httpOnly cookie, rotated on every use ---------- */

  function newRefreshToken(userId: string, familyId: string) {
    const token = randomBytes(32).toString('base64url');
    const record = {
      userId,
      familyId,
      tokenHash: hashToken(token),
      expiresAt: new Date(now().getTime() + config.refreshTokenTtlDays * DAY_MS),
    };
    return { token, record };
  }

  /** Starts a new login (a new token family). */
  async function issueRefreshToken(userId: string): Promise<string> {
    const { token, record } = newRefreshToken(userId, randomUUID());
    await refreshTokens.create(record);
    return token;
  }

  /** Exchanges a refresh token for a new one. Re-use of an old token ends the whole login. */
  async function rotateRefreshToken(token: string): Promise<{ userId: string; refreshToken: string }> {
    const hash = hashToken(token);
    let found = await refreshTokens.findByHash(hash);
    if (!found || found.expiresAt.getTime() <= now().getTime()) throw unauthorized();

    if (!found.revokedAt) {
      const next = newRefreshToken(found.userId, found.familyId);
      if (await refreshTokens.rotate(found.id, now(), next.record)) {
        return { userId: found.userId, refreshToken: next.token };
      }
      // Another request (a second tab) rotated it a moment ago. Re-read; the grace rule below applies.
      found = await refreshTokens.findByHash(hash);
      if (!found?.revokedAt) throw unauthorized();
    }

    // The token was already rotated. Allowed only as a two-tab race: very recent, and the login
    // still has a live token. After logout or theft detection the family has none, so this fails.
    const withinGrace = now().getTime() - found.revokedAt.getTime() < REUSE_GRACE_MS;
    if (withinGrace && (await refreshTokens.hasActiveInFamily(found.familyId, now()))) {
      const next = newRefreshToken(found.userId, found.familyId);
      await refreshTokens.create(next.record);
      return { userId: found.userId, refreshToken: next.token };
    }
    await refreshTokens.revokeFamily(found.familyId, now()); // a stolen token was replayed
    throw unauthorized();
  }

  async function revokeRefreshToken(token: string): Promise<void> {
    const found = await refreshTokens.findByHash(hashToken(token));
    if (found) await refreshTokens.revokeFamily(found.familyId, now());
  }

  return {
    refreshTokenTtlDays: config.refreshTokenTtlDays,
    register,
    login,
    getUser,
    signAccessToken,
    verifyAccessToken,
    issueRefreshToken,
    rotateRefreshToken,
    revokeRefreshToken,
  };
}

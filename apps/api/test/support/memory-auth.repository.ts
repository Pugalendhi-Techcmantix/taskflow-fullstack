import { randomUUID } from 'node:crypto';
import {
  EmailTakenError,
  type AuthRepositories,
  type RefreshTokenRecord,
  type UserRecord,
} from '../../src/modules/auth/auth.repository';

/** In-memory stand-in for Postgres. Tests can read and change `users` / `tokens` directly. */
export function createMemoryAuthRepositories(now: () => Date) {
  const users: UserRecord[] = [];
  const tokens: RefreshTokenRecord[] = [];

  const repos: AuthRepositories = {
    users: {
      async create(data) {
        if (users.some((u) => u.email === data.email)) throw new EmailTakenError();
        const user: UserRecord = { id: randomUUID(), ...data, createdAt: now(), updatedAt: now() };
        users.push(user);
        return { ...user };
      },
      findByEmail: async (email) => {
        const u = users.find((x) => x.email === email);
        return u ? { ...u } : null;
      },
      findById: async (id) => {
        const u = users.find((x) => x.id === id);
        return u ? { ...u } : null;
      },
    },
    refreshTokens: {
      async create(data) {
        const token: RefreshTokenRecord = { id: randomUUID(), ...data, revokedAt: null, createdAt: now() };
        tokens.push(token);
        return { ...token };
      },
      findByHash: async (hash) => {
        const t = tokens.find((x) => x.tokenHash === hash);
        return t ? { ...t } : null;
      },
      async rotate(id, at, replacement) {
        // Synchronous body = atomic, like the database transaction.
        const t = tokens.find((x) => x.id === id && x.revokedAt === null);
        if (!t) return false;
        t.revokedAt = at;
        tokens.push({ id: randomUUID(), ...replacement, revokedAt: null, createdAt: now() });
        return true;
      },
      hasActiveInFamily: async (familyId, at) =>
        tokens.some((x) => x.familyId === familyId && x.revokedAt === null && x.expiresAt > at),
      async revokeFamily(familyId, at) {
        for (const t of tokens) if (t.familyId === familyId && t.revokedAt === null) t.revokedAt = at;
      },
    },
  };

  return { repos, users, tokens };
}

import { randomUUID } from 'node:crypto';
import { DEFAULT_ROLE_PERMISSIONS, PERMISSION_KEYS, ROLE_IDS, ROLE_NAMES, type PermissionKey, type RoleId } from '@taskflow/core';
import type { InviteRecord, InviteRepository, RoleRepository } from '../../src/modules/access/access.repository';
import {
  EmailTakenError,
  type RefreshTokenRecord,
  type RefreshTokenRepository,
  type UserRecord,
  type UserRepository,
} from '../../src/modules/auth/auth.repository';
import type { Repositories } from '../../src/repositories';

/**
 * In-memory stand-in for PostgreSQL, seeded with the same default roles as the migration.
 * Tests can read and change the arrays directly. Method bodies have no `await` between a check
 * and its write, so they are atomic — like the database transactions they replace.
 */
export function createMemoryRepositories(now: () => Date) {
  const users: UserRecord[] = [];
  const tokens: RefreshTokenRecord[] = [];
  const grants = new Map<RoleId, Set<PermissionKey>>(ROLE_IDS.map((r) => [r, new Set(DEFAULT_ROLE_PERMISSIONS[r])]));
  const invites: InviteRecord[] = [];
  const copy = <T extends object>(x: T | undefined): T | null => (x ? { ...x } : null);

  const userRepo: UserRepository = {
    async create(data, role) {
      if (users.some((u) => u.email === data.email)) throw new EmailTakenError();
      const roleId = role.kind === 'fixed' ? role.roleId : users.length === 0 ? 'admin' : role.others;
      const user: UserRecord = { id: randomUUID(), ...data, roleId, createdAt: now(), updatedAt: now() };
      users.push(user);
      return { ...user };
    },
    findByEmail: async (email) => copy(users.find((u) => u.email === email)),
    findById: async (id) => copy(users.find((u) => u.id === id)),
    list: async () => users.map((u) => ({ ...u })),
    async changeRole(userId, roleId) {
      const user = users.find((u) => u.id === userId);
      if (!user) return 'not_found';
      if (user.roleId === 'admin' && roleId !== 'admin' && users.filter((u) => u.roleId === 'admin').length <= 1) return 'last_admin';
      user.roleId = roleId;
      return 'changed';
    },
  };

  const tokenRepo: RefreshTokenRepository = {
    async create(data) {
      const token: RefreshTokenRecord = { id: randomUUID(), ...data, revokedAt: null, createdAt: now() };
      tokens.push(token);
      return { ...token };
    },
    findByHash: async (hash) => copy(tokens.find((t) => t.tokenHash === hash)),
    async rotate(id, at, replacement) {
      const t = tokens.find((x) => x.id === id && x.revokedAt === null);
      if (!t) return false;
      t.revokedAt = at;
      tokens.push({ id: randomUUID(), ...replacement, revokedAt: null, createdAt: now() });
      return true;
    },
    hasActiveInFamily: async (familyId, at) =>
      tokens.some((t) => t.familyId === familyId && t.revokedAt === null && t.expiresAt > at),
    async revokeFamily(familyId, at) {
      for (const t of tokens) if (t.familyId === familyId && t.revokedAt === null) t.revokedAt = at;
    },
  };

  const roleRepo: RoleRepository = {
    list: async () =>
      ROLE_IDS.map((id) => ({
        id,
        name: ROLE_NAMES[id],
        permissions: PERMISSION_KEYS.filter((k) => grants.get(id)?.has(k)),
        memberCount: users.filter((u) => u.roleId === id).length,
      })),
    permissionsOf: async (roleId) => PERMISSION_KEYS.filter((k) => grants.get(roleId)?.has(k)),
    async setPermission(roleId, key, granted) {
      const set = grants.get(roleId);
      if (!set) return;
      if (granted) set.add(key);
      else set.delete(key);
    },
  };

  const unused = (i: InviteRecord) => i.acceptedAt === null && i.revokedAt === null;
  const open = (i: InviteRecord, at: Date) => unused(i) && i.expiresAt > at;
  const inviter = (id: string) => {
    const u = users.find((x) => x.id === id);
    return { id, name: u?.name ?? 'Unknown' };
  };

  const inviteRepo: InviteRepository = {
    async replaceOpen(data, at) {
      for (const i of invites) if (i.email === data.email && unused(i)) i.revokedAt = at;
      const invite: InviteRecord = {
        id: randomUUID(),
        email: data.email,
        roleId: data.roleId,
        tokenHash: data.tokenHash,
        invitedBy: inviter(data.invitedById),
        expiresAt: data.expiresAt,
        acceptedAt: null,
        revokedAt: null,
        createdAt: now(),
      };
      invites.push(invite);
      return { ...invite };
    },
    listOpen: async (at) =>
      invites
        .filter((i) => open(i, at))
        .toSorted((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
        .map((i) => ({ ...i })),
    findById: async (id) => copy(invites.find((i) => i.id === id)),
    findByTokenHash: async (hash) => copy(invites.find((i) => i.tokenHash === hash)),
    async revoke(id, at) {
      const i = invites.find((x) => x.id === id && unused(x));
      if (!i) return false;
      i.revokedAt = at;
      return true;
    },
    async renew(id, at, tokenHash, expiresAt) {
      const i = invites.find((x) => x.id === id && open(x, at));
      if (!i) return null;
      i.tokenHash = tokenHash;
      i.expiresAt = expiresAt;
      return { ...i };
    },
    async accept(id, at, data) {
      const i = invites.find((x) => x.id === id && open(x, at));
      if (!i) return 'unavailable';
      if (users.some((u) => u.email === i.email)) return 'email_taken';
      i.acceptedAt = at;
      const user: UserRecord = { id: randomUUID(), ...data, email: i.email, roleId: i.roleId, createdAt: now(), updatedAt: now() };
      users.push(user);
      return { ...user };
    },
  };

  const repos: Repositories = { users: userRepo, refreshTokens: tokenRepo, roles: roleRepo, invites: inviteRepo };
  return { repos, users, tokens, grants, invites };
}

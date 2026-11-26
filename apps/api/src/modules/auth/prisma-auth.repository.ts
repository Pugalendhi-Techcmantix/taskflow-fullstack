import { roleIdSchema, type RoleId } from '@taskflow/core';
import { Prisma, type PrismaClient, type User } from '../../../generated/client';
import { EmailTakenError, type RefreshTokenRepository, type UserRecord, type UserRepository } from './auth.repository';

/** Lock id that serialises "first user becomes Admin" and "keep at least one Admin" decisions. */
const ROLE_LOCK = 42_001;

/** Database rows are validated too: an unknown role id in the DB is a bug, not something to pass on. */
export const toUserRecord = (u: User): UserRecord => ({
  id: u.id,
  email: u.email,
  name: u.name,
  passwordHash: u.passwordHash,
  roleId: roleIdSchema.parse(u.roleId),
  createdAt: u.createdAt,
  updatedAt: u.updatedAt,
});

const isUniqueViolation = (err: unknown) => err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002';

export function createPrismaUserRepository(prisma: PrismaClient): UserRepository {
  return {
    async create(data, role) {
      try {
        const row = await prisma.$transaction(async (tx) => {
          let roleId: RoleId;
          if (role.kind === 'fixed') {
            roleId = role.roleId;
          } else {
            await tx.$executeRaw`SELECT pg_advisory_xact_lock(${ROLE_LOCK})`;
            roleId = (await tx.user.count()) === 0 ? 'admin' : role.others;
          }
          return tx.user.create({ data: { ...data, roleId } });
        });
        return toUserRecord(row);
      } catch (err) {
        if (isUniqueViolation(err)) throw new EmailTakenError();
        throw err;
      }
    },
    async findByEmail(email) {
      const u = await prisma.user.findUnique({ where: { email } });
      return u ? toUserRecord(u) : null;
    },
    async findById(id) {
      const u = await prisma.user.findUnique({ where: { id } });
      return u ? toUserRecord(u) : null;
    },
    async list() {
      const rows = await prisma.user.findMany({ orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] });
      return rows.map(toUserRecord);
    },
    changeRole: (userId, roleId) =>
      prisma.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(${ROLE_LOCK})`;
        const user = await tx.user.findUnique({ where: { id: userId } });
        if (!user) return 'not_found';
        if (user.roleId === 'admin' && roleId !== 'admin' && (await tx.user.count({ where: { roleId: 'admin' } })) <= 1) {
          return 'last_admin';
        }
        await tx.user.update({ where: { id: userId }, data: { roleId } });
        return 'changed';
      }),
  };
}

export function createPrismaRefreshTokenRepository(prisma: PrismaClient): RefreshTokenRepository {
  return {
    create: (data) => prisma.refreshToken.create({ data }),
    findByHash: (tokenHash) => prisma.refreshToken.findUnique({ where: { tokenHash } }),
    rotate: (id, at, replacement) =>
      prisma.$transaction(async (tx) => {
        // Conditional update: only one of two simultaneous requests can revoke the same token.
        const res = await tx.refreshToken.updateMany({ where: { id, revokedAt: null }, data: { revokedAt: at } });
        if (res.count !== 1) return false;
        await tx.refreshToken.create({ data: replacement });
        return true;
      }),
    async hasActiveInFamily(familyId, at) {
      const n = await prisma.refreshToken.count({ where: { familyId, revokedAt: null, expiresAt: { gt: at } } });
      return n > 0;
    },
    async revokeFamily(familyId, at) {
      await prisma.refreshToken.updateMany({ where: { familyId, revokedAt: null }, data: { revokedAt: at } });
    },
  };
}

export { isUniqueViolation };

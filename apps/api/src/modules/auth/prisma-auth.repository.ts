import { Prisma, type PrismaClient } from '../../../generated/client';
import { EmailTakenError, type AuthRepositories } from './auth.repository';

export function createPrismaAuthRepositories(prisma: PrismaClient): AuthRepositories {
  return {
    users: {
      async create(data) {
        try {
          return await prisma.user.create({ data });
        } catch (err) {
          if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') throw new EmailTakenError();
          throw err;
        }
      },
      findByEmail: (email) => prisma.user.findUnique({ where: { email } }),
      findById: (id) => prisma.user.findUnique({ where: { id } }),
    },
    refreshTokens: {
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
    },
  };
}

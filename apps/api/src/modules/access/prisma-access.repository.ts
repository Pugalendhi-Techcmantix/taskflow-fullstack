import { permissionKeySchema, roleIdSchema } from '@taskflow/core';
import type { Invite, PrismaClient } from '../../../generated/client';
import { isUniqueViolation, toUserRecord } from '../auth/prisma-auth.repository';
import type { InviteRecord, InviteRepository, RoleRepository } from './access.repository';

export function createPrismaRoleRepository(prisma: PrismaClient): RoleRepository {
  return {
    async list() {
      const roles = await prisma.role.findMany({
        orderBy: { sortOrder: 'asc' },
        include: {
          permissions: { include: { permission: true } },
          _count: { select: { users: true } },
        },
      });
      return roles.map((r) => ({
        id: roleIdSchema.parse(r.id),
        name: r.name,
        permissions: r.permissions
          .toSorted((a, b) => a.permission.sortOrder - b.permission.sortOrder)
          .map((p) => permissionKeySchema.parse(p.permissionKey)),
        memberCount: r._count.users,
      }));
    },
    async permissionsOf(roleId) {
      const rows = await prisma.rolePermission.findMany({
        where: { roleId },
        include: { permission: true },
        orderBy: { permission: { sortOrder: 'asc' } },
      });
      return rows.map((r) => permissionKeySchema.parse(r.permissionKey));
    },
    async setPermission(roleId, key, granted) {
      if (granted) {
        await prisma.rolePermission.createMany({ data: [{ roleId, permissionKey: key }], skipDuplicates: true });
      } else {
        await prisma.rolePermission.deleteMany({ where: { roleId, permissionKey: key } });
      }
    },
  };
}

type InviteRow = Invite & { invitedBy: { id: string; name: string } };

const toInviteRecord = (i: InviteRow): InviteRecord => ({
  id: i.id,
  email: i.email,
  roleId: roleIdSchema.parse(i.roleId),
  tokenHash: i.tokenHash,
  invitedBy: { id: i.invitedBy.id, name: i.invitedBy.name },
  expiresAt: i.expiresAt,
  acceptedAt: i.acceptedAt,
  revokedAt: i.revokedAt,
  createdAt: i.createdAt,
});

const withInviter = { invitedBy: { select: { id: true, name: true } } } as const;
const unused = { acceptedAt: null, revokedAt: null } as const;

export function createPrismaInviteRepository(prisma: PrismaClient): InviteRepository {
  return {
    async replaceOpen(data, at) {
      const row = await prisma.$transaction(async (tx) => {
        await tx.invite.updateMany({ where: { email: data.email, ...unused }, data: { revokedAt: at } });
        return tx.invite.create({ data, include: withInviter });
      });
      return toInviteRecord(row);
    },
    async listOpen(at) {
      const rows = await prisma.invite.findMany({
        where: { ...unused, expiresAt: { gt: at } },
        include: withInviter,
        orderBy: { createdAt: 'desc' },
      });
      return rows.map(toInviteRecord);
    },
    async findById(id) {
      const row = await prisma.invite.findUnique({ where: { id }, include: withInviter });
      return row ? toInviteRecord(row) : null;
    },
    async findByTokenHash(tokenHash) {
      const row = await prisma.invite.findUnique({ where: { tokenHash }, include: withInviter });
      return row ? toInviteRecord(row) : null;
    },
    async revoke(id, at) {
      const res = await prisma.invite.updateMany({ where: { id, ...unused }, data: { revokedAt: at } });
      return res.count === 1;
    },
    async renew(id, at, tokenHash, expiresAt) {
      const res = await prisma.invite.updateMany({
        where: { id, ...unused, expiresAt: { gt: at } },
        data: { tokenHash, expiresAt },
      });
      if (res.count !== 1) return null;
      const row = await prisma.invite.findUnique({ where: { id }, include: withInviter });
      return row ? toInviteRecord(row) : null;
    },
    async accept(id, at, user) {
      try {
        const row = await prisma.$transaction(async (tx) => {
          const invite = await tx.invite.findUnique({ where: { id } });
          const claimed = await tx.invite.updateMany({
            where: { id, ...unused, expiresAt: { gt: at } },
            data: { acceptedAt: at },
          });
          if (!invite || claimed.count !== 1) return null;
          // A unique-email violation here throws, which rolls the claim back so the invite stays usable.
          return tx.user.create({ data: { ...user, email: invite.email, roleId: invite.roleId } });
        });
        return row ? toUserRecord(row) : 'unavailable';
      } catch (err) {
        if (isUniqueViolation(err)) return 'email_taken';
        throw err;
      }
    },
  };
}

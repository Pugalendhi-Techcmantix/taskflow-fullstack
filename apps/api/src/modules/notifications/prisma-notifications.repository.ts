import type { Prisma, PrismaClient } from '../../../generated/client';
import type { NotificationRecord, NotificationRepository } from './notifications.repository';

const include = {
  actor: { select: { id: true, name: true } },
  project: { select: { id: true, key: true, name: true } },
  task: { select: { id: true, number: true } },
} satisfies Prisma.NotificationInclude;

type Row = Prisma.NotificationGetPayload<{ include: typeof include }>;

const toRecord = (r: Row): NotificationRecord => ({
  id: r.id,
  userId: r.userId,
  actor: r.actor,
  project: r.project,
  task: r.task,
  data: r.data,
  readAt: r.readAt,
  createdAt: r.createdAt,
});

const newestFirst = [{ createdAt: 'desc' }, { id: 'desc' }] satisfies Prisma.NotificationOrderByWithRelationInput[];

export function createPrismaNotificationRepository(prisma: PrismaClient): NotificationRepository {
  return {
    async addMany(rows) {
      if (rows.length === 0) return [];
      const created = await prisma.$transaction(rows.map((r) => prisma.notification.create({ data: r, include })));
      return created.map(toRecord);
    },
    async list(userId, { before, limit }) {
      const older: Prisma.NotificationWhereInput = before
        ? { OR: [{ createdAt: { lt: before.createdAt } }, { createdAt: before.createdAt, id: { lt: before.id } }] }
        : {};
      const rows = await prisma.notification.findMany({ where: { AND: [{ userId }, older] }, include, orderBy: newestFirst, take: limit });
      return rows.map(toRecord);
    },
    countUnread: (userId) => prisma.notification.count({ where: { userId, readAt: null } }),
    async markRead(userId, id, at) {
      const mine = await prisma.notification.findFirst({ where: { id, userId }, select: { readAt: true } });
      if (!mine) return false;
      if (!mine.readAt) await prisma.notification.update({ where: { id }, data: { readAt: at } });
      return true;
    },
    async markAllRead(userId, at) {
      await prisma.notification.updateMany({ where: { userId, readAt: null }, data: { readAt: at } });
    },
  };
}

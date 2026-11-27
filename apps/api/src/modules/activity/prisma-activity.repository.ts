import { activityTypeSchema } from '@taskflow/core';
import type { Prisma, PrismaClient } from '../../../generated/client';
import type { ActivityFilter, ActivityRecord, ActivityRepository } from './activity.repository';

const include = {
  actor: { select: { id: true, name: true } },
  project: { select: { id: true, key: true, name: true } },
  task: { select: { id: true, number: true } },
} satisfies Prisma.ActivityLogInclude;

type Row = Prisma.ActivityLogGetPayload<{ include: typeof include }>;

const toRecord = (r: Row): ActivityRecord => ({
  id: r.id,
  type: activityTypeSchema.parse(r.type),
  actor: r.actor,
  project: r.project,
  task: r.task,
  data: r.data,
  createdAt: r.createdAt,
});

const newestFirst = [{ createdAt: 'desc' }, { id: 'desc' }] satisfies Prisma.ActivityLogOrderByWithRelationInput[];

/** Visibility and filters as a WHERE clause (see ActivityScope). */
function whereOf({ scope, actorId, type }: ActivityFilter): Prisma.ActivityLogWhereInput {
  const visible: Prisma.ActivityLogWhereInput = scope.all
    ? {}
    : {
        OR: [
          { project: { members: { some: { userId: scope.userId } } } },
          ...(scope.userEvents ? [{ type: 'user' }] : []),
        ],
      };
  return {
    AND: [visible, ...(actorId ? [{ actorId }] : []), ...(type ? [{ type }] : [])],
  };
}

export function createPrismaActivityRepository(prisma: PrismaClient): ActivityRepository {
  return {
    async add({ actorId, type, projectId, taskId, event, createdAt }) {
      await prisma.activityLog.create({ data: { actorId, type, action: event.action, projectId, taskId, data: event, createdAt } });
    },
    async findRecent({ actorId, taskId, action, since }) {
      const row = await prisma.activityLog.findFirst({
        where: { actorId, taskId, action, createdAt: { gte: since } },
        orderBy: newestFirst,
        select: { id: true },
      });
      return row?.id ?? null;
    },
    async touch(id, at) {
      await prisma.activityLog.update({ where: { id }, data: { createdAt: at } });
    },
    async list(filter, { before, limit }) {
      const older: Prisma.ActivityLogWhereInput = before
        ? { OR: [{ createdAt: { lt: before.createdAt } }, { createdAt: before.createdAt, id: { lt: before.id } }] }
        : {};
      const rows = await prisma.activityLog.findMany({ where: { AND: [whereOf(filter), older] }, include, orderBy: newestFirst, take: limit });
      return rows.map(toRecord);
    },
    count: (filter) => prisma.activityLog.count({ where: whereOf(filter) }),
    async listForTask(taskId, limit) {
      const rows = await prisma.activityLog.findMany({ where: { taskId }, include, orderBy: newestFirst, take: limit });
      return rows.map(toRecord);
    },
  };
}

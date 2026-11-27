import { likePattern, projectColorSchema } from '@taskflow/core';
import { Prisma, type PrismaClient } from '../../../generated/client';
import { TASK_KEY_SQL, parseIds, tasksInOrder } from '../tasks/prisma-tasks.repository';
import type { SearchRepository, SearchScope } from './search.repository';

/** Limits a query on `tasks t` to projects the user is a member of (no limit for Admins). */
const inScope = ({ userId, all }: SearchScope) =>
  all ? Prisma.empty : Prisma.sql`AND EXISTS (SELECT 1 FROM project_members m WHERE m.project_id = t.project_id AND m.user_id = ${userId}::uuid)`;

export function createPrismaSearchRepository(prisma: PrismaClient): SearchRepository {
  return {
    async tasks(text, scope, limit) {
      const pattern = likePattern(text);
      const rows: unknown = await prisma.$queryRaw`
        SELECT t.id
        FROM tasks t JOIN projects pr ON pr.id = t.project_id
        WHERE (t.title ILIKE ${pattern} OR ${TASK_KEY_SQL} ILIKE ${pattern}) ${inScope(scope)}
        ORDER BY (upper(${TASK_KEY_SQL}) = upper(${text})) DESC, t.updated_at DESC, t.number ASC
        LIMIT ${limit}`;
      return tasksInOrder(prisma, parseIds(rows));
    },
    async projects(text, { userId, all }, limit) {
      const rows = await prisma.project.findMany({
        where: {
          OR: [{ name: { contains: text, mode: 'insensitive' } }, { key: { contains: text, mode: 'insensitive' } }],
          ...(all ? {} : { members: { some: { userId } } }),
        },
        select: { id: true, key: true, name: true, color: true },
        orderBy: { name: 'asc' },
        take: limit,
      });
      return rows.map((p) => ({ ...p, color: projectColorSchema.parse(p.color) }));
    },
  };
}

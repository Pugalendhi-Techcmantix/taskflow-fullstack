import { sprintStatusSchema, toIsoDate } from '@taskflow/core';
import { Prisma, type PrismaClient } from '../../../generated/client';
import type { SprintRecord, SprintRepository } from './sprints.repository';

const withKey = { project: { select: { key: true } } } satisfies Prisma.SprintInclude;
type SprintRow = Prisma.SprintGetPayload<{ include: typeof withKey }>;

/** "2026-12-01" → the DATE column value (UTC midnight). */
const toDbDate = (iso: string) => new Date(`${iso}T00:00:00Z`);

const toSprintRecord = (s: SprintRow): SprintRecord => ({
  id: s.id,
  projectId: s.projectId,
  projectKey: s.project.key,
  name: s.name,
  goal: s.goal,
  startDate: toIsoDate(s.startDate),
  endDate: toIsoDate(s.endDate),
  status: sprintStatusSchema.parse(s.status),
  startedAt: s.startedAt,
  completedAt: s.completedAt,
  createdAt: s.createdAt,
});

const isUniqueViolation = (err: unknown) => err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002';

export function createPrismaSprintRepository(prisma: PrismaClient): SprintRepository {
  const byId = async (id: string) => {
    const row = await prisma.sprint.findUnique({ where: { id }, include: withKey });
    return row ? toSprintRecord(row) : null;
  };

  return {
    async listByProject(projectId) {
      const rows = await prisma.sprint.findMany({ where: { projectId }, include: withKey, orderBy: [{ startDate: 'asc' }, { createdAt: 'asc' }] });
      return rows.map(toSprintRecord);
    },
    findById: byId,
    async create(data) {
      const row = await prisma.sprint.create({
        data: { ...data, startDate: toDbDate(data.startDate), endDate: toDbDate(data.endDate) },
        include: withKey,
      });
      return toSprintRecord(row);
    },
    async update(id, changes) {
      const row = await prisma.sprint.update({
        where: { id },
        data: {
          ...(changes.name !== undefined ? { name: changes.name } : {}),
          ...(changes.goal !== undefined ? { goal: changes.goal } : {}),
          ...(changes.startDate !== undefined ? { startDate: toDbDate(changes.startDate) } : {}),
          ...(changes.endDate !== undefined ? { endDate: toDbDate(changes.endDate) } : {}),
        },
        include: withKey,
      });
      return toSprintRecord(row);
    },
    async start(id, at) {
      try {
        const res = await prisma.sprint.updateMany({ where: { id, status: 'planned' }, data: { status: 'active', startedAt: at } });
        if (res.count !== 1) return 'not_planned';
      } catch (err) {
        if (isUniqueViolation(err)) return 'another_active'; // the partial unique index said no
        throw err;
      }
      return (await byId(id)) ?? 'not_planned';
    },
    async complete(id, at) {
      const res = await prisma.sprint.updateMany({ where: { id, status: 'active' }, data: { status: 'completed', completedAt: at } });
      if (res.count !== 1) return 'not_active';
      return (await byId(id)) ?? 'not_active';
    },
    async deletePlanned(id) {
      const res = await prisma.sprint.deleteMany({ where: { id, status: 'planned' } });
      return res.count === 1;
    },
  };
}

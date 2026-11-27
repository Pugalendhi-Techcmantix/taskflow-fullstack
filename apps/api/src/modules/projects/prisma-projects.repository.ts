import { projectColorSchema, roleIdSchema } from '@taskflow/core';
import { Prisma, type PrismaClient } from '../../../generated/client';
import { ProjectKeyTakenError, type ProjectRecord, type ProjectRepository } from './projects.repository';

const withMembers = {
  members: {
    include: { user: { select: { id: true, name: true, email: true, roleId: true } } },
    orderBy: [{ addedAt: 'asc' }, { userId: 'asc' }],
  },
  sprints: { where: { status: 'active' }, select: { id: true, name: true }, take: 1 },
  tasks: { where: { status: 'done' }, select: { id: true } },
  _count: { select: { tasks: true } },
} satisfies Prisma.ProjectInclude;

type ProjectRow = Prisma.ProjectGetPayload<{ include: typeof withMembers }>;

/** Rows are validated on the way out: an unexpected colour or role in the DB is a bug, not data to pass on. */
const toProjectRecord = (p: ProjectRow): ProjectRecord => ({
  id: p.id,
  key: p.key,
  name: p.name,
  description: p.description,
  color: projectColorSchema.parse(p.color),
  createdById: p.createdById,
  createdAt: p.createdAt,
  updatedAt: p.updatedAt,
  members: p.members.map((m) => ({
    userId: m.user.id,
    name: m.user.name,
    email: m.user.email,
    roleId: roleIdSchema.parse(m.user.roleId),
    addedAt: m.addedAt,
  })),
  activeSprint: p.sprints[0] ?? null,
  taskCounts: { total: p._count.tasks, done: p.tasks.length },
});

const prismaCode = (err: unknown) => (err instanceof Prisma.PrismaClientKnownRequestError ? err.code : undefined);

export function createPrismaProjectRepository(prisma: PrismaClient): ProjectRepository {
  return {
    async listVisible(userId, all) {
      const rows = await prisma.project.findMany({
        where: all ? {} : { members: { some: { userId } } },
        include: withMembers,
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      });
      return rows.map(toProjectRecord);
    },
    async findByKey(key) {
      const row = await prisma.project.findUnique({ where: { key }, include: withMembers });
      return row ? toProjectRecord(row) : null;
    },
    async findById(id) {
      const row = await prisma.project.findUnique({ where: { id }, include: withMembers });
      return row ? toProjectRecord(row) : null;
    },
    async keyExists(key) {
      return (await prisma.project.count({ where: { key } })) > 0;
    },
    async create(data) {
      try {
        // One nested write = one transaction: the project never exists without its creator as member.
        const row = await prisma.project.create({
          data: { ...data, members: { create: { userId: data.createdById } } },
          include: withMembers,
        });
        return toProjectRecord(row);
      } catch (err) {
        if (prismaCode(err) === 'P2002') throw new ProjectKeyTakenError();
        throw err;
      }
    },
    async update(id, changes) {
      return toProjectRecord(await prisma.project.update({ where: { id }, data: changes, include: withMembers }));
    },
    async delete(id) {
      await prisma.project.delete({ where: { id } });
    },
    async addMember(projectId, userId) {
      try {
        await prisma.projectMember.create({ data: { projectId, userId } });
        return 'added';
      } catch (err) {
        if (prismaCode(err) === 'P2002') return 'already_member';
        if (prismaCode(err) === 'P2003') return 'no_such_user'; // foreign key: no such user
        throw err;
      }
    },
    async removeMember(projectId, userId) {
      const res = await prisma.projectMember.deleteMany({ where: { projectId, userId } });
      return res.count === 1;
    },
  };
}

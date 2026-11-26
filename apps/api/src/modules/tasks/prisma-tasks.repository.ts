import { POSITION_STEP, taskPrioritySchema, taskStatusSchema, taskTypeSchema, toIsoDate } from '@taskflow/core';
import type { Prisma, PrismaClient } from '../../../generated/client';
import type { Column, TaskChanges, TaskDetailRecord, TaskRecord, TaskRepository } from './tasks.repository';

const person = { select: { id: true, name: true } } as const;

const summaryInclude = {
  project: { select: { key: true } },
  assignee: person,
  reporter: person,
  sprint: { select: { id: true, name: true } },
  subtasks: { select: { done: true } },
  _count: { select: { comments: true } },
} satisfies Prisma.TaskInclude;

const detailInclude = {
  ...summaryInclude,
  subtasks: { orderBy: [{ position: 'asc' }, { createdAt: 'asc' }] },
  comments: { include: { author: person }, orderBy: { createdAt: 'asc' } },
} satisfies Prisma.TaskInclude;

type SummaryRow = Prisma.TaskGetPayload<{ include: typeof summaryInclude }>;
type DetailRow = Prisma.TaskGetPayload<{ include: typeof detailInclude }>;

const toDbDate = (iso: string) => new Date(`${iso}T00:00:00Z`);

/** Values are validated on the way out: an unknown status in the database is a bug, not data. */
function toTaskRecord(t: SummaryRow | DetailRow): TaskRecord {
  return {
    id: t.id,
    projectId: t.projectId,
    projectKey: t.project.key,
    number: t.number,
    title: t.title,
    description: t.description,
    type: taskTypeSchema.parse(t.type),
    status: taskStatusSchema.parse(t.status),
    priority: taskPrioritySchema.parse(t.priority),
    points: t.points,
    assignee: t.assignee,
    reporter: t.reporter,
    sprint: t.sprint,
    dueDate: t.dueDate ? toIsoDate(t.dueDate) : null,
    doneAt: t.doneAt,
    position: t.position,
    createdAt: t.createdAt,
    updatedAt: t.updatedAt,
    subtaskTotal: t.subtasks.length,
    subtaskDone: t.subtasks.filter((s) => s.done).length,
    commentCount: t._count.comments,
  };
}

const toDetailRecord = (t: DetailRow): TaskDetailRecord => ({
  ...toTaskRecord(t),
  subtasks: t.subtasks.map((s) => ({ id: s.id, title: s.title, done: s.done, position: s.position })),
  comments: t.comments.map((c) => ({ id: c.id, author: c.author, body: c.body, mentionedUserIds: c.mentionedUserIds, createdAt: c.createdAt })),
});

function toDbChanges(c: TaskChanges): Prisma.TaskUncheckedUpdateInput {
  const out: Prisma.TaskUncheckedUpdateInput = {};
  if (c.title !== undefined) out.title = c.title;
  if (c.description !== undefined) out.description = c.description;
  if (c.type !== undefined) out.type = c.type;
  if (c.status !== undefined) out.status = c.status;
  if (c.priority !== undefined) out.priority = c.priority;
  if (c.points !== undefined) out.points = c.points;
  if (c.assigneeId !== undefined) out.assigneeId = c.assigneeId;
  if (c.sprintId !== undefined) out.sprintId = c.sprintId;
  if (c.dueDate !== undefined) out.dueDate = c.dueDate === null ? null : toDbDate(c.dueDate);
  if (c.doneAt !== undefined) out.doneAt = c.doneAt;
  if (c.position !== undefined) out.position = c.position;
  return out;
}

const columnWhere = ({ projectId, sprintId, status }: Column) => ({ projectId, sprintId, status }) satisfies Prisma.TaskWhereInput;
const boardOrder = [{ position: 'asc' }, { number: 'asc' }] satisfies Prisma.TaskOrderByWithRelationInput[];

export function createPrismaTaskRepository(prisma: PrismaClient): TaskRepository {
  return {
    async listByProject(projectId) {
      const rows = await prisma.task.findMany({ where: { projectId }, include: summaryInclude, orderBy: { number: 'asc' } });
      return rows.map(toTaskRecord);
    },
    async findByNumber(projectId, number) {
      const row = await prisma.task.findUnique({ where: { projectId_number: { projectId, number } }, include: detailInclude });
      return row ? toDetailRecord(row) : null;
    },
    async findById(id) {
      const row = await prisma.task.findUnique({ where: { id }, include: summaryInclude });
      return row ? toTaskRecord(row) : null;
    },
    async listBySprint(sprintId) {
      const rows = await prisma.task.findMany({ where: { sprintId }, include: summaryInclude, orderBy: boardOrder });
      return rows.map(toTaskRecord);
    },
    async lastPosition(column) {
      const r = await prisma.task.aggregate({ where: columnWhere(column), _max: { position: true } });
      return r._max.position;
    },
    async renumberColumn(column) {
      await prisma.$transaction(async (tx) => {
        const ids = await tx.task.findMany({ where: columnWhere(column), select: { id: true }, orderBy: boardOrder });
        for (const [i, { id }] of ids.entries()) {
          await tx.task.update({ where: { id }, data: { position: (i + 1) * POSITION_STEP } });
        }
      });
    },
    async create({ dueDate, ...data }) {
      const row = await prisma.$transaction(async (tx) => {
        // UPDATE … RETURNING locks the project row, so concurrent creates get different numbers.
        const project = await tx.project.update({
          where: { id: data.projectId },
          data: { nextTaskNumber: { increment: 1 } },
          select: { nextTaskNumber: true },
        });
        return tx.task.create({
          data: { ...data, number: project.nextTaskNumber - 1, dueDate: dueDate === null ? null : toDbDate(dueDate) },
          include: summaryInclude,
        });
      });
      return toTaskRecord(row);
    },
    async update(id, changes) {
      return toTaskRecord(await prisma.task.update({ where: { id }, data: toDbChanges(changes), include: summaryInclude }));
    },
    async delete(id) {
      await prisma.task.delete({ where: { id } });
    },
    async countOpenByAssignee() {
      const rows = await prisma.task.groupBy({ by: ['assigneeId'], where: { status: { not: 'done' }, assigneeId: { not: null } }, _count: { _all: true } });
      return new Map(rows.flatMap((r) => (r.assigneeId ? [[r.assigneeId, r._count._all] as const] : [])));
    },

    /* ---------- subtasks ---------- */

    async addSubtask(taskId, title) {
      const last = await prisma.subtask.aggregate({ where: { taskId }, _max: { position: true } });
      const s = await prisma.subtask.create({ data: { taskId, title, position: (last._max.position ?? -1) + 1 } });
      return { id: s.id, title: s.title, done: s.done, position: s.position };
    },
    async updateSubtask(taskId, id, changes) {
      const res = await prisma.subtask.updateMany({ where: { id, taskId }, data: changes });
      if (res.count !== 1) return null;
      const s = await prisma.subtask.findUnique({ where: { id } });
      return s ? { id: s.id, title: s.title, done: s.done, position: s.position } : null;
    },
    async deleteSubtask(taskId, id) {
      return (await prisma.subtask.deleteMany({ where: { id, taskId } })).count === 1;
    },

    /* ---------- comments ---------- */

    async addComment(data) {
      const c = await prisma.comment.create({ data, include: { author: person } });
      return { id: c.id, author: c.author, body: c.body, mentionedUserIds: c.mentionedUserIds, createdAt: c.createdAt };
    },
    async findCommentAuthor(taskId, id) {
      return prisma.comment.findFirst({ where: { id, taskId }, select: { authorId: true } });
    },
    async deleteComment(taskId, id) {
      return (await prisma.comment.deleteMany({ where: { id, taskId } })).count === 1;
    },
  };
}

import {
  POSITION_STEP,
  TASK_PRIORITIES,
  TASK_STATUSES,
  likePattern,
  taskPrioritySchema,
  taskStatusSchema,
  taskTypeSchema,
  toIsoDate,
  type TaskSort,
  type TaskStatus,
} from '@taskflow/core';
import { z } from 'zod';
import { Prisma, type PrismaClient } from '../../../generated/client';
import type { Column, TaskChanges, TaskDetailRecord, TaskFilter, TaskOrder, TaskRecord, TaskRepository } from './tasks.repository';

const person = { select: { id: true, name: true } } as const;

export const summaryInclude = {
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
export function toTaskRecord(t: SummaryRow | DetailRow): TaskRecord {
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

/* ---------- task list: filter, sort and page in SQL ---------- */

/** "TF-107" for a row of `tasks t JOIN projects pr`. */
export const TASK_KEY_SQL = Prisma.raw(`(pr.key || '-' || t.number)`);

const textArray = (values: readonly string[]) => `ARRAY[${values.map((v) => `'${v}'`).join(', ')}]::text[]`;

/**
 * Sort expressions. Only these fixed strings ever reach ORDER BY. The user picks a key from TASK_SORTS,
 * never SQL. Status and priority sort in their natural order, not alphabetically.
 */
const SORT_SQL: Record<TaskSort, string> = {
  key: 't.number',
  title: 'lower(t.title)',
  status: `array_position(${textArray(TASK_STATUSES)}, t.status)`,
  priority: `array_position(${textArray(TASK_PRIORITIES)}, t.priority)`,
  assignee: 'lower(u.name)',
  sprint: 's.start_date',
  points: 't.points',
  due: 't.due_date',
};

/** WHERE clause for `tasks t JOIN projects pr`. Every user value is a bound parameter. */
function filterSql(f: TaskFilter): Prisma.Sql {
  const parts = [Prisma.sql`t.project_id = ${f.projectId}::uuid`];
  if (f.q) {
    const pattern = likePattern(f.q);
    parts.push(Prisma.sql`(t.title ILIKE ${pattern} OR ${TASK_KEY_SQL} ILIKE ${pattern})`);
  }
  if (f.status === 'open') parts.push(Prisma.sql`t.status <> 'done'`);
  else if (f.status === 'overdue') parts.push(Prisma.sql`t.status <> 'done' AND t.due_date < ${f.today}::date`);
  else if (f.status) parts.push(Prisma.sql`t.status = ${f.status}`);
  if (f.priority) parts.push(Prisma.sql`t.priority = ${f.priority}`);
  if (f.type) parts.push(Prisma.sql`t.type = ${f.type}`);
  if (f.assignee === 'none') parts.push(Prisma.sql`t.assignee_id IS NULL`);
  else if (f.assignee) parts.push(Prisma.sql`t.assignee_id = ${f.assignee}::uuid`);
  if (f.sprint === 'backlog') parts.push(Prisma.sql`t.sprint_id IS NULL`);
  else if (f.sprint) parts.push(Prisma.sql`t.sprint_id = ${f.sprint}::uuid`);
  return Prisma.join(parts, ' AND ');
}

const orderSql = ({ sort, dir }: TaskOrder) =>
  Prisma.raw(`${SORT_SQL[sort]} ${dir === 'desc' ? 'DESC' : 'ASC'} NULLS LAST, t.number ASC`);

const idRows = z.array(z.object({ id: z.string() }));
const countRows = z.array(z.object({ total: z.number().int() }));

/** Loads full task rows for `ids`, keeping the order of `ids`. */
export async function tasksInOrder(prisma: PrismaClient, ids: readonly string[]): Promise<TaskRecord[]> {
  if (ids.length === 0) return [];
  const rows = await prisma.task.findMany({ where: { id: { in: [...ids] } }, include: summaryInclude });
  const byId = new Map(rows.map((r) => [r.id, r]));
  return ids.flatMap((id) => {
    const row = byId.get(id);
    return row ? [toTaskRecord(row)] : [];
  });
}

/** Parses the id column of a raw query (raw rows are `unknown` until checked). */
export const parseIds = (rows: unknown) => idRows.parse(rows).map((r) => r.id);

export function createPrismaTaskRepository(prisma: PrismaClient): TaskRepository {
  return {
    async listByProject(projectId) {
      const rows = await prisma.task.findMany({ where: { projectId }, include: summaryInclude, orderBy: { number: 'asc' } });
      return rows.map(toTaskRecord);
    },
    async countMatching(filter) {
      const rows: unknown = await prisma.$queryRaw`
        SELECT count(*)::int AS total
        FROM tasks t JOIN projects pr ON pr.id = t.project_id
        WHERE ${filterSql(filter)}`;
      return countRows.parse(rows)[0]?.total ?? 0;
    },
    async listPage(filter, order, { offset, limit }) {
      const rows: unknown = await prisma.$queryRaw`
        SELECT t.id
        FROM tasks t
        JOIN projects pr ON pr.id = t.project_id
        LEFT JOIN users u ON u.id = t.assignee_id
        LEFT JOIN sprints s ON s.id = t.sprint_id
        WHERE ${filterSql(filter)}
        ORDER BY ${orderSql(order)}
        LIMIT ${limit} OFFSET ${offset}`;
      return tasksInOrder(prisma, parseIds(rows));
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
    async countByStatus({ projectId, sprintId }) {
      const rows = await prisma.task.groupBy({ by: ['status'], where: { projectId, ...(sprintId ? { sprintId } : {}) }, _count: { _all: true } });
      const out: Record<TaskStatus, number> = { todo: 0, in_progress: 0, in_review: 0, done: 0 };
      for (const r of rows) out[taskStatusSchema.parse(r.status)] = r._count._all;
      return out;
    },
    countOverdue: (projectId, today) =>
      prisma.task.count({ where: { projectId, status: { not: 'done' }, dueDate: { lt: toDbDate(today) } } }),
    async countOpenByAssigneeIn(projectId) {
      const rows = await prisma.task.groupBy({ by: ['assigneeId'], where: { projectId, status: { not: 'done' } }, _count: { _all: true } });
      return new Map(rows.map((r) => [r.assigneeId, r._count._all] as const));
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

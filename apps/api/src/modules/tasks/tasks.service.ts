import {
  ERROR_CODES,
  MIN_POSITION_GAP,
  TASK_CHANGE_FIELDS,
  findMentions,
  localIsoDate,
  pageCount,
  positionBetween,
  taskKey,
  type ActivityEvent,
  type Board,
  type CreateTaskInput,
  type TaskChangeField,
  type MoveTaskInput,
  type TaskDetail,
  type TaskListQuery,
  type TaskPage,
  type TaskStatus,
  type TaskSummary,
  type UpdateSubtaskInput,
  type UpdateTaskInput,
} from '@taskflow/core';
import { AppError, conflict, forbidden, notFoundError } from '../../http/errors';
import type { Repositories } from '../../repositories';
import { isAdmin, type Actor } from '../access/actor';
import type { ActivityRecorder } from '../activity/activity.service';
import type { ProjectRecord } from '../projects/projects.repository';
import type { ProjectsService } from '../projects/projects.service';
import { toSprint } from '../sprints/sprints.service';
import type { Column, TaskChanges, TaskDetailRecord, TaskFilter, TaskRecord } from './tasks.repository';

export const toTaskSummary = (t: TaskRecord): TaskSummary => ({
  id: t.id,
  key: taskKey(t.projectKey, t.number),
  number: t.number,
  projectKey: t.projectKey,
  title: t.title,
  type: t.type,
  status: t.status,
  priority: t.priority,
  points: t.points,
  assignee: t.assignee,
  sprint: t.sprint,
  dueDate: t.dueDate,
  position: t.position,
  subtasks: { total: t.subtaskTotal, done: t.subtaskDone },
  commentCount: t.commentCount,
  createdAt: t.createdAt.toISOString(),
  updatedAt: t.updatedAt.toISOString(),
  doneAt: t.doneAt?.toISOString() ?? null,
});

export const toTaskDetail = (t: TaskDetailRecord): TaskDetail => ({
  ...toTaskSummary(t),
  description: t.description,
  reporter: t.reporter,
  subtaskList: t.subtasks.map((s) => ({ id: s.id, title: s.title, done: s.done })),
  comments: t.comments.map((c) => ({ id: c.id, author: c.author, body: c.body, createdAt: c.createdAt.toISOString() })),
});

const fieldError = (field: string, message: string) => new AppError(400, ERROR_CODES.validation, message, { [field]: message });

export type TasksService = ReturnType<typeof createTasksService>;

/** A task field's value as the history shows it (codes for status/priority/type, names for people and sprints). */
const SHOWN: Record<TaskChangeField, (t: TaskRecord) => string | null> = {
  status: (t) => t.status,
  priority: (t) => t.priority,
  type: (t) => t.type,
  points: (t) => (t.points === null ? null : String(t.points)),
  assignee: (t) => t.assignee?.name ?? null,
  sprint: (t) => t.sprint?.name ?? null,
  dueDate: (t) => t.dueDate,
};

export function createTasksService(deps: {
  repos: Pick<Repositories, 'tasks' | 'sprints'>;
  projects: Pick<ProjectsService, 'visibleProject'>;
  activity: ActivityRecorder;
  now?: () => Date;
}) {
  const { tasks, sprints } = deps.repos;
  const now = deps.now ?? (() => new Date());

  const ref = (project: ProjectRecord, t: { number: number; title: string }) => ({ key: taskKey(project.key, t.number), title: t.title });
  /** `taskId: null` for a task that no longer exists (its entries stay in the project's history). */
  const record = (actor: Actor, project: ProjectRecord, taskId: string | null, event: ActivityEvent) =>
    deps.activity.record({ actorId: actor.user.id, projectId: project.id, taskId, event });

  async function taskIn(project: ProjectRecord, number: number): Promise<TaskDetailRecord> {
    const t = await tasks.findByNumber(project.id, number);
    if (!t) throw notFoundError(`Task ${taskKey(project.key, number)} not found`);
    return t;
  }

  /** Assignees must be members of the project. */
  function checkAssignee(project: ProjectRecord, assigneeId: string | null | undefined) {
    if (assigneeId && !project.members.some((m) => m.userId === assigneeId)) {
      throw fieldError('assigneeId', 'Only members of this project can be assigned');
    }
  }

  /** A task can go into a planned or active sprint of the same project — not a completed one. */
  async function checkSprint(project: ProjectRecord, sprintId: string | null | undefined) {
    if (!sprintId) return;
    const s = await sprints.findById(sprintId);
    if (!s || s.projectId !== project.id) throw fieldError('sprintId', 'That sprint is not in this project');
    if (s.status === 'completed') throw fieldError('sprintId', 'That sprint is already completed');
  }

  /** doneAt follows the status: set when a task becomes Done, cleared when it is reopened. */
  const doneAtFor = (from: TaskStatus | null, to: TaskStatus): Date | null | undefined =>
    to === 'done' ? (from === 'done' ? undefined : now()) : from === 'done' ? null : undefined;

  /** Position at the bottom of a column (new tasks, and tasks that change column outside the board). */
  const endOf = async (column: Column) => positionBetween(await tasks.lastPosition(column), null);

  /** One page of the Tasks table. A page past the end gives the last page, so a stale link still shows rows. */
  async function list(actor: Actor, projectKey: string, query: TaskListQuery): Promise<TaskPage> {
    const project = await deps.projects.visibleProject(actor, projectKey);
    const { q, status, priority, type, assignee, sprint, sort, dir, size } = query;
    const filter: TaskFilter = { projectId: project.id, q, status, priority, type, assignee, sprint, today: localIsoDate(now()) };
    const total = await tasks.countMatching(filter);
    const page = Math.min(query.page, pageCount(total, size));
    const rows = total === 0 ? [] : await tasks.listPage(filter, { sort, dir }, { offset: (page - 1) * size, limit: size });
    return { tasks: rows.map(toTaskSummary), total, page, size };
  }

  /** Every task of the project, for sprint planning (sprint lists and the backlog). Oldest first. */
  async function planning(actor: Actor, projectKey: string): Promise<TaskSummary[]> {
    const project = await deps.projects.visibleProject(actor, projectKey);
    return (await tasks.listByProject(project.id)).map(toTaskSummary);
  }

  async function get(actor: Actor, projectKey: string, number: number): Promise<TaskDetail> {
    const project = await deps.projects.visibleProject(actor, projectKey);
    return toTaskDetail(await taskIn(project, number));
  }

  async function create(actor: Actor, projectKey: string, input: CreateTaskInput): Promise<TaskDetail> {
    const project = await deps.projects.visibleProject(actor, projectKey);
    checkAssignee(project, input.assigneeId);
    await checkSprint(project, input.sprintId);
    const created = await tasks.create({
      ...input,
      projectId: project.id,
      reporterId: actor.user.id,
      doneAt: input.status === 'done' ? now() : null,
      position: await endOf({ projectId: project.id, sprintId: input.sprintId, status: input.status }),
    });
    await record(actor, project, created.id, { action: 'task.created', task: ref(project, created) });
    return toTaskDetail(await taskIn(project, created.number));
  }

  async function update(actor: Actor, projectKey: string, number: number, input: UpdateTaskInput): Promise<TaskDetail> {
    const project = await deps.projects.visibleProject(actor, projectKey);
    const t = await taskIn(project, number);
    checkAssignee(project, input.assigneeId);
    if (input.sprintId !== undefined && input.sprintId !== t.sprint?.id) await checkSprint(project, input.sprintId);

    const changes: TaskChanges = {};
    if (input.title !== undefined) changes.title = input.title;
    if (input.description !== undefined) changes.description = input.description;
    if (input.type !== undefined) changes.type = input.type;
    if (input.priority !== undefined) changes.priority = input.priority;
    if (input.points !== undefined) changes.points = input.points;
    if (input.assigneeId !== undefined) changes.assigneeId = input.assigneeId;
    if (input.sprintId !== undefined) changes.sprintId = input.sprintId;
    if (input.dueDate !== undefined) changes.dueDate = input.dueDate;
    if (input.status !== undefined) {
      changes.status = input.status;
      const doneAt = doneAtFor(t.status, input.status);
      if (doneAt !== undefined) changes.doneAt = doneAt;
    }
    // Changing status or sprint from the dialog puts the card at the bottom of its new board column.
    const sprintId = changes.sprintId !== undefined ? changes.sprintId : (t.sprint?.id ?? null);
    const status = changes.status ?? t.status;
    if (sprintId !== (t.sprint?.id ?? null) || status !== t.status) {
      changes.position = await endOf({ projectId: project.id, sprintId, status });
    }
    await tasks.update(t.id, changes);
    const after = await taskIn(project, number);

    // One history entry per changed field, with the values before and after.
    const task = ref(project, after);
    if (after.title !== t.title) await record(actor, project, t.id, { action: 'task.renamed', task, from: t.title });
    if (after.description !== t.description) await record(actor, project, t.id, { action: 'task.description_updated', task });
    for (const field of TASK_CHANGE_FIELDS) {
      const [from, to] = [SHOWN[field](t), SHOWN[field](after)];
      if (from !== to) await record(actor, project, t.id, { action: 'task.changed', task, field, from, to });
    }
    return toTaskDetail(after);
  }

  /* ---------- board ---------- */

  /** The active sprint and its tasks in board order; `sprint: null` when no sprint is active. */
  async function board(actor: Actor, projectKey: string): Promise<Board> {
    const project = await deps.projects.visibleProject(actor, projectKey);
    const active = (await sprints.listByProject(project.id)).find((s) => s.status === 'active');
    if (!active) return { sprint: null, tasks: [] };
    return { sprint: toSprint(active), tasks: (await tasks.listBySprint(active.id)).map(toTaskSummary) };
  }

  /**
   * Moves a card to `input.status`, between the cards `afterId` (above) and `beforeId` (below) of that column.
   * Only the moved row changes, unless the neighbours are too close: then the column is renumbered first.
   * Neighbours that are no longer where the browser thought (someone else moved them) give 409.
   */
  async function move(actor: Actor, projectKey: string, number: number, input: MoveTaskInput): Promise<TaskSummary> {
    const project = await deps.projects.visibleProject(actor, projectKey);
    const t = await taskIn(project, number);
    const column: Column = { projectId: project.id, sprintId: t.sprint?.id ?? null, status: input.status };
    const stale = () => conflict('The board changed while you were moving this card. Refresh and try again.');

    async function neighbour(field: 'afterId' | 'beforeId', id: string | null) {
      if (id === null) return null;
      if (id === t.id) throw fieldError(field, 'A card cannot be placed next to itself');
      const n = await tasks.findById(id);
      if (!n || n.projectId !== project.id) throw fieldError(field, 'That card is not in this project');
      if ((n.sprint?.id ?? null) !== column.sprintId || n.status !== column.status) throw stale();
      return n;
    }
    const placeBetween = async () => {
      const [after, before] = [await neighbour('afterId', input.afterId), await neighbour('beforeId', input.beforeId)];
      if (after && before && after.position >= before.position) throw stale();
      return { after, before };
    };

    let { after, before } = await placeBetween();
    let position: number;
    if (!after && !before) {
      position = await endOf(column);
    } else {
      if (after && before && before.position - after.position < MIN_POSITION_GAP) {
        await tasks.renumberColumn(column);
        ({ after, before } = await placeBetween());
      }
      position = positionBetween(after?.position ?? null, before?.position ?? null);
    }

    const changes: TaskChanges = { status: input.status, position };
    const doneAt = doneAtFor(t.status, input.status);
    if (doneAt !== undefined) changes.doneAt = doneAt;
    const moved = await tasks.update(t.id, changes);
    // Reordering inside a column is not history; a column change is.
    if (t.status !== input.status) {
      await record(actor, project, t.id, { action: 'task.moved', task: ref(project, t), from: t.status, to: input.status });
    }
    return toTaskSummary(moved);
  }

  async function remove(actor: Actor, projectKey: string, number: number): Promise<void> {
    const project = await deps.projects.visibleProject(actor, projectKey);
    const t = await taskIn(project, number);
    await tasks.delete(t.id);
    await record(actor, project, null, { action: 'task.deleted', task: ref(project, t) });
  }

  /* ---------- subtasks ---------- */

  async function addSubtask(actor: Actor, projectKey: string, number: number, title: string): Promise<TaskDetail> {
    const project = await deps.projects.visibleProject(actor, projectKey);
    const t = await taskIn(project, number);
    await tasks.addSubtask(t.id, title);
    await record(actor, project, t.id, { action: 'subtask.added', task: ref(project, t), subtask: title });
    return toTaskDetail(await taskIn(project, number));
  }

  async function updateSubtask(actor: Actor, projectKey: string, number: number, subtaskId: string, input: UpdateSubtaskInput): Promise<TaskDetail> {
    const project = await deps.projects.visibleProject(actor, projectKey);
    const t = await taskIn(project, number);
    const changes: { title?: string; done?: boolean } = {};
    if (input.title !== undefined) changes.title = input.title;
    if (input.done !== undefined) changes.done = input.done;
    const before = t.subtasks.find((s) => s.id === subtaskId);
    const after = await tasks.updateSubtask(t.id, subtaskId, changes);
    if (!before || !after) throw notFoundError('Subtask not found');
    const task = ref(project, t);
    if (after.title !== before.title) await record(actor, project, t.id, { action: 'subtask.renamed', task, subtask: after.title, from: before.title });
    if (after.done !== before.done) {
      await record(actor, project, t.id, { action: after.done ? 'subtask.completed' : 'subtask.reopened', task, subtask: after.title });
    }
    return toTaskDetail(await taskIn(project, number));
  }

  async function deleteSubtask(actor: Actor, projectKey: string, number: number, subtaskId: string): Promise<TaskDetail> {
    const project = await deps.projects.visibleProject(actor, projectKey);
    const t = await taskIn(project, number);
    const removed = t.subtasks.find((s) => s.id === subtaskId);
    if (!removed || !(await tasks.deleteSubtask(t.id, subtaskId))) throw notFoundError('Subtask not found');
    await record(actor, project, t.id, { action: 'subtask.removed', task: ref(project, t), subtask: removed.title });
    return toTaskDetail(await taskIn(project, number));
  }

  /* ---------- comments ---------- */

  /** Stores who was @mentioned (only project members can be), for notifications in Module 9. */
  async function addComment(actor: Actor, projectKey: string, number: number, body: string): Promise<TaskDetail> {
    const project = await deps.projects.visibleProject(actor, projectKey);
    const t = await taskIn(project, number);
    const mentioned = findMentions(body, project.members.map((m) => ({ id: m.userId, name: m.name })));
    await tasks.addComment({ taskId: t.id, authorId: actor.user.id, body, mentionedUserIds: mentioned.map((m) => m.id) });
    await record(actor, project, t.id, { action: 'comment.added', task: ref(project, t), mentions: mentioned.map((m) => m.name) });
    return toTaskDetail(await taskIn(project, number));
  }

  /** You can delete your own comments; Admins can delete any. */
  async function deleteComment(actor: Actor, projectKey: string, number: number, commentId: string): Promise<TaskDetail> {
    const project = await deps.projects.visibleProject(actor, projectKey);
    const t = await taskIn(project, number);
    const found = await tasks.findCommentAuthor(t.id, commentId);
    if (!found) throw notFoundError('Comment not found');
    if (found.authorId !== actor.user.id && !isAdmin(actor)) throw forbidden('You can only delete your own comments');
    await tasks.deleteComment(t.id, commentId);
    await record(actor, project, t.id, { action: 'comment.deleted', task: ref(project, t) });
    return toTaskDetail(await taskIn(project, number));
  }

  return { list, planning, get, create, update, remove, board, move, addSubtask, updateSubtask, deleteSubtask, addComment, deleteComment };
}

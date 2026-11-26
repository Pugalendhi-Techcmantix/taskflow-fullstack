import {
  ERROR_CODES,
  findMentions,
  taskKey,
  type CreateTaskInput,
  type TaskDetail,
  type TaskStatus,
  type TaskSummary,
  type UpdateSubtaskInput,
  type UpdateTaskInput,
} from '@taskflow/core';
import { AppError, forbidden, notFoundError } from '../../http/errors';
import type { Repositories } from '../../repositories';
import { isAdmin, type Actor } from '../access/actor';
import type { ProjectRecord } from '../projects/projects.repository';
import type { ProjectsService } from '../projects/projects.service';
import type { TaskChanges, TaskDetailRecord, TaskRecord } from './tasks.repository';

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

export function createTasksService(deps: {
  repos: Pick<Repositories, 'tasks' | 'sprints'>;
  projects: Pick<ProjectsService, 'visibleProject'>;
  now?: () => Date;
}) {
  const { tasks, sprints } = deps.repos;
  const now = deps.now ?? (() => new Date());

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

  async function list(actor: Actor, projectKey: string): Promise<TaskSummary[]> {
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
    });
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
    await tasks.update(t.id, changes);
    return toTaskDetail(await taskIn(project, number));
  }

  async function remove(actor: Actor, projectKey: string, number: number): Promise<void> {
    const project = await deps.projects.visibleProject(actor, projectKey);
    const t = await taskIn(project, number);
    await tasks.delete(t.id);
  }

  /* ---------- subtasks ---------- */

  async function addSubtask(actor: Actor, projectKey: string, number: number, title: string): Promise<TaskDetail> {
    const project = await deps.projects.visibleProject(actor, projectKey);
    const t = await taskIn(project, number);
    await tasks.addSubtask(t.id, title);
    return toTaskDetail(await taskIn(project, number));
  }

  async function updateSubtask(actor: Actor, projectKey: string, number: number, subtaskId: string, input: UpdateSubtaskInput): Promise<TaskDetail> {
    const project = await deps.projects.visibleProject(actor, projectKey);
    const t = await taskIn(project, number);
    const changes: { title?: string; done?: boolean } = {};
    if (input.title !== undefined) changes.title = input.title;
    if (input.done !== undefined) changes.done = input.done;
    if (!(await tasks.updateSubtask(t.id, subtaskId, changes))) throw notFoundError('Subtask not found');
    return toTaskDetail(await taskIn(project, number));
  }

  async function deleteSubtask(actor: Actor, projectKey: string, number: number, subtaskId: string): Promise<TaskDetail> {
    const project = await deps.projects.visibleProject(actor, projectKey);
    const t = await taskIn(project, number);
    if (!(await tasks.deleteSubtask(t.id, subtaskId))) throw notFoundError('Subtask not found');
    return toTaskDetail(await taskIn(project, number));
  }

  /* ---------- comments ---------- */

  /** Stores who was @mentioned (only project members can be), for notifications in Module 9. */
  async function addComment(actor: Actor, projectKey: string, number: number, body: string): Promise<TaskDetail> {
    const project = await deps.projects.visibleProject(actor, projectKey);
    const t = await taskIn(project, number);
    const mentioned = findMentions(body, project.members.map((m) => ({ id: m.userId, name: m.name })));
    await tasks.addComment({ taskId: t.id, authorId: actor.user.id, body, mentionedUserIds: mentioned.map((m) => m.id) });
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
    return toTaskDetail(await taskIn(project, number));
  }

  return { list, get, create, update, remove, addSubtask, updateSubtask, deleteSubtask, addComment, deleteComment };
}

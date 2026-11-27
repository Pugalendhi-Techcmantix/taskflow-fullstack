import {
  NOTIFICATIONS_PAGE_SIZE,
  activityCursor,
  notificationData,
  taskKey,
  taskStatusSchema,
  type Notification,
  type NotificationData,
  type NotificationsPage,
} from '@taskflow/core';
import { notFoundError } from '../../http/errors';
import type { Repositories } from '../../repositories';
import type { Actor } from '../access/actor';
import type { ActivityInput } from '../activity/activity.service';
import type { RealtimeHub } from '../realtime/realtime';
import type { NotificationRecord } from './notifications.repository';

export const toNotification = (r: NotificationRecord): Notification => ({
  id: r.id,
  actor: r.actor,
  project: r.project ? { key: r.project.key, name: r.project.name } : null,
  task: r.task && r.project ? { key: taskKey(r.project.key, r.task.number), number: r.task.number } : null,
  createdAt: r.createdAt.toISOString(),
  read: r.readAt !== null,
  data: notificationData.parse(r.data),
});

export type NotificationService = ReturnType<typeof createNotificationService>;

/**
 * Decides who hears about a change, stores it, and pushes it live.
 * Never the person who made the change; only people who are still members of the project.
 */
export function createNotificationService(deps: {
  repos: Pick<Repositories, 'notifications' | 'tasks' | 'projects'>;
  hub: RealtimeHub;
  now?: () => Date;
}) {
  const { notifications, tasks, projects } = deps.repos;
  const now = deps.now ?? (() => new Date());

  /** Who should get `data` for this change (before removing the actor and non-members). */
  async function recipientsOf({ projectId, taskId, event, refs }: ActivityInput): Promise<{ userIds: string[]; data: NotificationData } | null> {
    const task = taskId ? await tasks.findById(taskId) : null;
    const taskRef = task ? { key: taskKey(task.projectKey, task.number), title: task.title } : null;
    switch (event.action) {
      case 'task.created':
        // Created already assigned to someone: that's an assignment too.
        return task?.assignee && taskRef ? { userIds: [task.assignee.id], data: { kind: 'assigned', task: taskRef } } : null;
      case 'task.changed': {
        if (!task || !taskRef) return null;
        if (event.field === 'assignee') return task.assignee ? { userIds: [task.assignee.id], data: { kind: 'assigned', task: taskRef } } : null;
        if (event.field !== 'status') return null;
        const to = taskStatusSchema.safeParse(event.to);
        if (!to.success) return null;
        return { userIds: [task.assignee?.id, task.reporter?.id].filter((id): id is string => !!id), data: { kind: 'status_changed', task: taskRef, to: to.data } };
      }
      case 'task.moved':
        if (!task || !taskRef) return null;
        return { userIds: [task.assignee?.id, task.reporter?.id].filter((id): id is string => !!id), data: { kind: 'status_changed', task: taskRef, to: event.to } };
      case 'comment.added':
        return taskRef && refs?.mentionedUserIds?.length ? { userIds: [...refs.mentionedUserIds], data: { kind: 'mentioned', task: taskRef } } : null;
      case 'sprint.started': {
        if (!projectId || !refs?.sprintId) return null;
        const inSprint = await tasks.listBySprint(refs.sprintId);
        const members = (await projects.findById(projectId))?.members.map((m) => m.userId) ?? [];
        return {
          userIds: members,
          data: { kind: 'sprint_started', sprint: event.sprint, tasks: inSprint.length, points: inSprint.reduce((n, t) => n + (t.points ?? 0), 0) },
        };
      }
      case 'sprint.completed': {
        if (!projectId) return null;
        const members = (await projects.findById(projectId))?.members.map((m) => m.userId) ?? [];
        return { userIds: members, data: { kind: 'sprint_completed', sprint: event.sprint, done: event.done, total: event.total } };
      }
      default:
        return null;
    }
  }

  /** Activity listener (subscribed to the recorder). `at` = the history entry's time, so the bell and the history agree on order. */
  async function onActivity(input: ActivityInput, at: Date): Promise<void> {
    if (!input.projectId) return;
    const found = await recipientsOf(input);
    if (!found) return;
    const project = await projects.findById(input.projectId);
    if (!project) return;
    const members = new Set(project.members.map((m) => m.userId));
    const userIds = [...new Set(found.userIds)].filter((id) => id !== input.actorId && members.has(id));
    if (userIds.length === 0) return;

    const created = await notifications.addMany(
      userIds.map((userId) => ({
        userId,
        actorId: input.actorId,
        kind: found.data.kind,
        projectId: input.projectId ?? null,
        taskId: input.taskId ?? null,
        data: found.data,
        createdAt: at,
      })),
    );
    for (const record of created) {
      deps.hub.toUser(record.userId, { notification: toNotification(record), unread: await notifications.countUnread(record.userId) });
    }
  }

  /* ---------- the signed-in user's own notifications ---------- */

  async function list(actor: Actor, cursor: string | undefined): Promise<NotificationsPage> {
    const [at, id] = cursor?.split('~') ?? [];
    const before = at && id ? { createdAt: new Date(at), id } : null;
    const [rows, unread] = await Promise.all([
      notifications.list(actor.user.id, { before, limit: NOTIFICATIONS_PAGE_SIZE + 1 }),
      notifications.countUnread(actor.user.id),
    ]);
    const page = rows.slice(0, NOTIFICATIONS_PAGE_SIZE);
    const last = page.at(-1);
    return {
      notifications: page.map(toNotification),
      unread,
      nextCursor: rows.length > NOTIFICATIONS_PAGE_SIZE && last ? activityCursor(last.createdAt.toISOString(), last.id) : null,
    };
  }

  async function markRead(actor: Actor, id: string): Promise<number> {
    if (!(await notifications.markRead(actor.user.id, id, now()))) throw notFoundError('Notification not found');
    return notifications.countUnread(actor.user.id);
  }

  async function markAllRead(actor: Actor): Promise<number> {
    await notifications.markAllRead(actor.user.id, now());
    return 0;
  }

  return { onActivity, list, markRead, markAllRead };
}

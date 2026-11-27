import { z } from 'zod';
import { activityCursorSchema, activityEvent } from './activity';
import { taskStatusSchema } from './tasks';

/* ---------- what a notification says ---------- */

export const NOTIFICATION_KINDS = ['assigned', 'mentioned', 'status_changed', 'sprint_started', 'sprint_completed'] as const;
export type NotificationKind = (typeof NOTIFICATION_KINDS)[number];

const taskRef = z.object({ key: z.string(), title: z.string() });
const sprintRef = z.object({ name: z.string() });

/** The typed payload of a notification (stored as JSON, checked with Zod when read). */
export const notificationData = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('assigned'), task: taskRef }),
  z.object({ kind: z.literal('mentioned'), task: taskRef }),
  z.object({ kind: z.literal('status_changed'), task: taskRef, to: taskStatusSchema }),
  z.object({ kind: z.literal('sprint_started'), sprint: sprintRef, tasks: z.number().int(), points: z.number().int() }),
  z.object({ kind: z.literal('sprint_completed'), sprint: sprintRef, done: z.number().int(), total: z.number().int() }),
]);
export type NotificationData = z.infer<typeof notificationData>;

const personRef = z.object({ id: z.string(), name: z.string() });

export const notification = z.object({
  id: z.string(),
  /** Who caused it; null if that account no longer exists. */
  actor: personRef.nullable(),
  project: z.object({ key: z.string(), name: z.string() }).nullable(),
  /** The task, while it still exists (to open it). */
  task: z.object({ key: z.string(), number: z.number().int() }).nullable(),
  createdAt: z.string(),
  read: z.boolean(),
  data: notificationData,
});
export type Notification = z.infer<typeof notification>;

export const NOTIFICATIONS_PAGE_SIZE = 20;

export const notificationsQuery = z.object({ cursor: activityCursorSchema.optional() });

export const notificationsResponse = z.object({
  notifications: z.array(notification),
  /** Unread notifications in total (not just on this page). */
  unread: z.number().int(),
  nextCursor: activityCursorSchema.nullable(),
});
export type NotificationsPage = z.infer<typeof notificationsResponse>;

export const unreadResponse = z.object({ unread: z.number().int() });

/* ---------- real-time messages (Socket.IO) ---------- */

/** Server → client event names. */
export const REALTIME = {
  /** Something changed in a project you can see: refresh what shows it. */
  projectChanged: 'project:changed',
  /** A new notification for you. */
  notification: 'notification:new',
} as const;

export const projectChangedMessage = z.object({
  projectKey: z.string(),
  actor: personRef.nullable(),
  event: activityEvent,
});
export type ProjectChangedMessage = z.infer<typeof projectChangedMessage>;

export const notificationMessage = z.object({ notification, unread: z.number().int() });
export type NotificationMessage = z.infer<typeof notificationMessage>;

/** The handshake carries the same short-lived access token as API calls. */
export const realtimeAuth = z.object({ token: z.string().min(1) });

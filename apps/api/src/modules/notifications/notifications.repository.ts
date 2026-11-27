import type { NotificationData, NotificationKind } from '@taskflow/core';
import type { PersonRef } from '../tasks/tasks.repository';

export type NotificationRecord = {
  id: string;
  userId: string;
  actor: PersonRef | null;
  project: { id: string; key: string; name: string } | null;
  task: { id: string; number: number } | null;
  /** Stored payload, unchecked (the service validates it). */
  data: unknown;
  readAt: Date | null;
  createdAt: Date;
};

export type NewNotification = {
  userId: string;
  actorId: string | null;
  kind: NotificationKind;
  projectId: string | null;
  taskId: string | null;
  data: NotificationData;
  createdAt: Date;
};

export interface NotificationRepository {
  addMany(rows: NewNotification[]): Promise<NotificationRecord[]>;
  /** The user's notifications, newest first, older than `before` (keyset on created_at, then id). */
  list(userId: string, page: { before: { createdAt: Date; id: string } | null; limit: number }): Promise<NotificationRecord[]>;
  countUnread(userId: string): Promise<number>;
  /** False when there is no such notification for this user (someone else's counts as missing). */
  markRead(userId: string, id: string, at: Date): Promise<boolean>;
  markAllRead(userId: string, at: Date): Promise<void>;
}

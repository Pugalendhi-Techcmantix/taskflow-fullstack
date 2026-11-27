import type { ActivityEvent, ActivityType } from '@taskflow/core';
import type { PersonRef } from '../tasks/tasks.repository';

export type ActivityRecord = {
  id: string;
  type: ActivityType;
  actor: PersonRef | null;
  /** The project, while it still exists. */
  project: { id: string; key: string; name: string } | null;
  /** The task, while it still exists. */
  task: { id: string; number: number } | null;
  /** The stored event, unchecked (the service validates it). */
  data: unknown;
  createdAt: Date;
};

export type NewActivity = {
  actorId: string | null;
  type: ActivityType;
  projectId: string | null;
  taskId: string | null;
  event: ActivityEvent;
  createdAt: Date;
};

/**
 * Which entries a reader may see. Admins (`all`) see everything. Everyone else sees entries of projects
 * they are a member of, plus user events (roles, invites) when `userEvents` (user:manage or role:manage).
 */
export type ActivityScope = { userId: string; all: boolean; userEvents: boolean };

export type ActivityFilter = {
  scope: ActivityScope;
  projectId?: string | undefined;
  actorId?: string | undefined;
  type?: ActivityType | undefined;
};

export interface ActivityRepository {
  add(entry: NewActivity): Promise<void>;
  /** The newest entry by this person for this task and action since `since`, if any (description edits merge). */
  findRecent(query: { actorId: string; taskId: string; action: ActivityEvent['action']; since: Date }): Promise<string | null>;
  /** Moves an entry to a new time (a merged description edit becomes "recent" again). */
  touch(id: string, at: Date): Promise<void>;
  /** Newest first, older than `before` (keyset paging on created_at, then id). */
  list(filter: ActivityFilter, page: { before: { createdAt: Date; id: string } | null; limit: number }): Promise<ActivityRecord[]>;
  count(filter: ActivityFilter): Promise<number>;
  /** One task's entries, newest first. */
  listForTask(taskId: string, limit: number): Promise<ActivityRecord[]>;
}

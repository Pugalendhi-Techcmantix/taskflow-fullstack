import {
  ACTIVITY_PAGE_SIZE,
  DESCRIPTION_MERGE_MS,
  TASK_HISTORY_LIMIT,
  activityCursor,
  activityEvent,
  activityTypeOf,
  taskKey,
  type ActivityEntry,
  type ActivityEvent,
  type ActivityPage,
  type ActivityQuery,
} from '@taskflow/core';
import { notFoundError } from '../../http/errors';
import type { Repositories } from '../../repositories';
import { isAdmin, type Actor } from '../access/actor';
import type { ProjectsService } from '../projects/projects.service';
import type { ActivityFilter, ActivityRecord } from './activity.repository';

/* ---------- writing: the one place every change is recorded ---------- */

export type ActivityInput = {
  /** Who did it (null only for changes nobody made, e.g. system jobs). */
  actorId: string | null;
  projectId?: string | null;
  taskId?: string | null;
  event: ActivityEvent;
};

/** Services call `record` after a change has succeeded. */
export type ActivityRecorder = { record: (input: ActivityInput) => Promise<void> };

/**
 * Writes activity entries. A failed write is logged and swallowed: the change itself has already been
 * saved, and telling the user it failed would be wrong.
 */
export function createActivityRecorder(repos: Pick<Repositories, 'activity'>, now: () => Date = () => new Date()): ActivityRecorder {
  const { activity } = repos;
  /**
   * Each entry gets a strictly later time than the one before (at most 1 ms later), so entries written
   * in the same millisecond (several fields saved at once) keep the order they happened in.
   */
  let lastMs = 0;
  const nextTime = () => {
    lastMs = Math.max(now().getTime(), lastMs + 1);
    return new Date(lastMs);
  };
  return {
    async record({ actorId, projectId = null, taskId = null, event }) {
      try {
        const at = nextTime();
        // Description autosave: repeated edits by the same person within a few minutes are one entry.
        if (event.action === 'task.description_updated' && actorId && taskId) {
          const recent = await activity.findRecent({ actorId, taskId, action: event.action, since: new Date(at.getTime() - DESCRIPTION_MERGE_MS) });
          if (recent) {
            await activity.touch(recent, at);
            return;
          }
        }
        await activity.add({ actorId, type: activityTypeOf(event.action), projectId, taskId, event, createdAt: at });
      } catch (err) {
        console.error(`Activity not recorded (${event.action}):`, err);
      }
    },
  };
}

/* ---------- reading ---------- */

/** Stored events are checked on the way out: a malformed entry is a bug, not data. */
export const toActivityEntry = (r: ActivityRecord): ActivityEntry => ({
  id: r.id,
  type: r.type,
  actor: r.actor,
  createdAt: r.createdAt.toISOString(),
  project: r.project ? { key: r.project.key, name: r.project.name } : null,
  task: r.task && r.project ? { key: taskKey(r.project.key, r.task.number), number: r.task.number } : null,
  event: activityEvent.parse(r.data),
});

export type ActivityService = ReturnType<typeof createActivityService>;

export function createActivityService(deps: {
  repos: Pick<Repositories, 'activity' | 'tasks'>;
  projects: Pick<ProjectsService, 'visibleProject'>;
}) {
  const { activity, tasks } = deps.repos;

  /** Same visibility as projects; user events only for people who manage users or roles. */
  const scopeOf = (actor: Actor) => ({
    userId: actor.user.id,
    all: isAdmin(actor),
    userEvents: actor.permissions.includes('user:manage') || actor.permissions.includes('role:manage'),
  });

  /** The workspace timeline, newest first, one page at a time. */
  async function list(actor: Actor, query: ActivityQuery): Promise<ActivityPage> {
    // A project filter must name a project you can see (404 otherwise, like everywhere else).
    const project = query.project ? await deps.projects.visibleProject(actor, query.project) : null;
    const filter: ActivityFilter = { scope: scopeOf(actor), projectId: project?.id, actorId: query.user, type: query.type };
    const size = query.limit ?? ACTIVITY_PAGE_SIZE;
    const [at, id] = query.cursor?.split('~') ?? [];
    const before = at && id ? { createdAt: new Date(at), id } : null;
    // One extra row tells whether there is a next page.
    const [rows, total] = await Promise.all([activity.list(filter, { before, limit: size + 1 }), activity.count(filter)]);
    const page = rows.slice(0, size);
    const last = page.at(-1);
    return {
      entries: page.map(toActivityEntry),
      nextCursor: rows.length > size && last ? activityCursor(last.createdAt.toISOString(), last.id) : null,
      total,
    };
  }

  /** The History list in the task dialog. Anyone who can see the project can see it. */
  async function taskHistory(actor: Actor, projectKey: string, number: number): Promise<ActivityEntry[]> {
    const project = await deps.projects.visibleProject(actor, projectKey);
    const task = await tasks.findByNumber(project.id, number);
    if (!task) throw notFoundError(`Task ${taskKey(project.key, number)} not found`);
    return (await activity.listForTask(task.id, TASK_HISTORY_LIMIT)).map(toActivityEntry);
  }

  return { list, taskHistory };
}

import { z } from 'zod';
import { permissionKeySchema, roleIdSchema } from './access';
import { projectKeySchema } from './projects';
import { taskStatusSchema } from './tasks';

/* ---------- event groups (the prototype's "Event type" filter) ---------- */

export const ACTIVITY_TYPES = ['task', 'sprint', 'project', 'comment', 'user'] as const;
export type ActivityType = (typeof ACTIVITY_TYPES)[number];
export const activityTypeSchema = z.enum(ACTIVITY_TYPES, { error: 'Unknown event type' });
export const ACTIVITY_TYPE_LABELS: Record<ActivityType, string> = {
  task: 'Task events',
  sprint: 'Sprint events',
  project: 'Project events',
  comment: 'Comment events',
  user: 'User events',
};

/* ---------- what happened: one typed event per kind of change ---------- */

/** Task fields whose change is recorded as "changed <field> of TF-107 from A to B". */
export const TASK_CHANGE_FIELDS = ['status', 'priority', 'type', 'points', 'assignee', 'sprint', 'dueDate'] as const;
export type TaskChangeField = (typeof TASK_CHANGE_FIELDS)[number];
export const SPRINT_CHANGE_FIELDS = ['name', 'goal', 'startDate', 'endDate'] as const;
export const PROJECT_CHANGE_FIELDS = ['name', 'description', 'color'] as const;

/** Names and keys are copied into the event, so the history still reads right after a rename or delete. */
const taskRef = z.object({ key: z.string(), title: z.string() });
const sprintRef = z.object({ name: z.string() });
const projectRef = z.object({ key: z.string(), name: z.string() });
/** A field value as shown to people: a status/priority/type code, a name, "5", "2026-12-01", or null (empty). */
const shownValue = z.string().nullable();

const subtaskEvent = <A extends string>(action: A) => z.object({ action: z.literal(action), task: taskRef, subtask: z.string() });

export const activityEvent = z.discriminatedUnion('action', [
  // tasks
  z.object({ action: z.literal('task.created'), task: taskRef }),
  z.object({ action: z.literal('task.renamed'), task: taskRef, from: z.string() }),
  z.object({ action: z.literal('task.changed'), task: taskRef, field: z.enum(TASK_CHANGE_FIELDS), from: shownValue, to: shownValue }),
  z.object({ action: z.literal('task.description_updated'), task: taskRef }),
  z.object({ action: z.literal('task.moved'), task: taskRef, from: taskStatusSchema, to: taskStatusSchema }),
  z.object({ action: z.literal('task.deleted'), task: taskRef }),
  subtaskEvent('subtask.added'),
  subtaskEvent('subtask.completed'),
  subtaskEvent('subtask.reopened'),
  subtaskEvent('subtask.removed'),
  z.object({ action: z.literal('subtask.renamed'), task: taskRef, subtask: z.string(), from: z.string() }),
  // comments
  z.object({ action: z.literal('comment.added'), task: taskRef, mentions: z.array(z.string()) }),
  z.object({ action: z.literal('comment.deleted'), task: taskRef }),
  // sprints
  z.object({ action: z.literal('sprint.created'), sprint: sprintRef }),
  z.object({ action: z.literal('sprint.updated'), sprint: sprintRef, fields: z.array(z.enum(SPRINT_CHANGE_FIELDS)) }),
  z.object({ action: z.literal('sprint.started'), sprint: sprintRef }),
  z.object({
    action: z.literal('sprint.completed'),
    sprint: sprintRef,
    done: z.number().int(),
    total: z.number().int(),
    /** Where unfinished tasks went: a sprint name, or null for the backlog. */
    movedTo: z.string().nullable(),
  }),
  z.object({ action: z.literal('sprint.deleted'), sprint: sprintRef }),
  // projects
  z.object({ action: z.literal('project.created'), project: projectRef }),
  z.object({ action: z.literal('project.updated'), project: projectRef, fields: z.array(z.enum(PROJECT_CHANGE_FIELDS)) }),
  z.object({ action: z.literal('project.deleted'), project: projectRef }),
  z.object({ action: z.literal('project.member_added'), project: projectRef, member: z.string() }),
  z.object({ action: z.literal('project.member_removed'), project: projectRef, member: z.string() }),
  // people, roles and invites
  z.object({ action: z.literal('user.role_changed'), member: z.string(), from: roleIdSchema, to: roleIdSchema }),
  z.object({ action: z.literal('user.permission_changed'), role: roleIdSchema, permission: permissionKeySchema, granted: z.boolean() }),
  z.object({ action: z.literal('user.invited'), email: z.string(), role: roleIdSchema }),
  z.object({ action: z.literal('user.invite_resent'), email: z.string() }),
  z.object({ action: z.literal('user.invite_revoked'), email: z.string() }),
  z.object({ action: z.literal('user.joined'), via: z.enum(['signup', 'invite']), role: roleIdSchema }),
]);
export type ActivityEvent = z.infer<typeof activityEvent>;
export type ActivityAction = ActivityEvent['action'];

/** The filter group of an action: subtasks count as task events. */
export function activityTypeOf(action: ActivityAction): ActivityType {
  if (action.startsWith('comment.')) return 'comment';
  if (action.startsWith('sprint.')) return 'sprint';
  if (action.startsWith('project.')) return 'project';
  if (action.startsWith('user.')) return 'user';
  return 'task';
}

/* ---------- reading the history ---------- */

export const ACTIVITY_PAGE_SIZE = 30;
/** Task history in the task dialog shows at most this many entries (newest first). */
export const TASK_HISTORY_LIMIT = 100;
/** Autosaved description edits by the same person within this window count as one entry. */
export const DESCRIPTION_MERGE_MS = 10 * 60_000;

/** Opaque "load more" cursor: `<ISO time>~<entry id>` of the last entry shown. */
export const activityCursorSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z~[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/, 'Invalid cursor');
export const activityCursor = (createdAt: string, id: string) => `${createdAt}~${id}`;

/** Query string of GET /api/activity. A missing filter means "all". */
export const activityQuery = z.object({
  user: z.uuid('Pick a person').optional(),
  type: activityTypeSchema.optional(),
  /** Only this project (a key you can see; otherwise 404). */
  project: projectKeySchema.optional(),
  cursor: activityCursorSchema.optional(),
  /** Page size, at most ACTIVITY_PAGE_SIZE (the dashboard asks for a few). */
  limit: z.coerce.number({ error: 'Limit must be a number' }).int('Limit must be a whole number').min(1, 'At least 1').max(30, 'At most 30').optional(),
});
export type ActivityQuery = z.output<typeof activityQuery>;

const personRef = z.object({ id: z.string(), name: z.string() });

export const activityEntry = z.object({
  id: z.string(),
  type: activityTypeSchema,
  /** Who did it; null if that account no longer exists. */
  actor: personRef.nullable(),
  createdAt: z.string(),
  /** The project it happened in, while it still exists. */
  project: projectRef.nullable(),
  /** The task, while it still exists (for an "Open" link). */
  task: z.object({ key: z.string(), number: z.number().int() }).nullable(),
  event: activityEvent,
});
export type ActivityEntry = z.infer<typeof activityEntry>;

export const activityPageResponse = z.object({
  entries: z.array(activityEntry),
  /** Pass back as `cursor` to load the next (older) page; null when there is no more. */
  nextCursor: activityCursorSchema.nullable(),
  /** How many entries match the filters in total. */
  total: z.number().int(),
});
export type ActivityPage = z.infer<typeof activityPageResponse>;

export const taskHistoryResponse = z.object({ entries: z.array(activityEntry) });

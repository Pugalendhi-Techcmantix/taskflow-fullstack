import { z } from 'zod';
import { isoDateSchema, sprint } from './sprints';

/* ---------- fixed value sets (labels match the prototype) ---------- */

export const TASK_TYPES = ['story', 'task', 'bug'] as const;
export type TaskType = (typeof TASK_TYPES)[number];
export const taskTypeSchema = z.enum(TASK_TYPES, { error: 'Pick a type' });
export const TASK_TYPE_LABELS: Record<TaskType, string> = { story: 'Story', task: 'Task', bug: 'Bug' };

export const TASK_STATUSES = ['todo', 'in_progress', 'in_review', 'done'] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];
export const taskStatusSchema = z.enum(TASK_STATUSES, { error: 'Pick a status' });
export const TASK_STATUS_LABELS: Record<TaskStatus, string> = { todo: 'To Do', in_progress: 'In Progress', in_review: 'In Review', done: 'Done' };

export const TASK_PRIORITIES = ['critical', 'high', 'medium', 'low'] as const;
export type TaskPriority = (typeof TASK_PRIORITIES)[number];
export const taskPrioritySchema = z.enum(TASK_PRIORITIES, { error: 'Pick a priority' });
export const TASK_PRIORITY_LABELS: Record<TaskPriority, string> = { critical: 'Critical', high: 'High', medium: 'Medium', low: 'Low' };

export const STORY_POINTS = [1, 2, 3, 5, 8, 13] as const;
export const storyPointsSchema = z
  .number()
  .int()
  .refine((n): n is (typeof STORY_POINTS)[number] => STORY_POINTS.some((p) => p === n), 'Use 1, 2, 3, 5, 8 or 13');

/* ---------- task keys: "TF-107" ---------- */

export const taskKey = (projectKey: string, number: number) => `${projectKey}-${number}`;

/** "tf-107" → { projectKey: "TF", number: 107 }, or null. */
export function parseTaskKey(value: string): { projectKey: string; number: number } | null {
  const m = /^([A-Za-z]{2,5})-(\d{1,9})$/.exec(value.trim());
  if (!m?.[1] || !m[2]) return null;
  return { projectKey: m[1].toUpperCase(), number: Number(m[2]) };
}

/* ---------- inputs ---------- */

const title = z.string().trim().min(3, 'Use at least 3 characters').max(200, 'Use at most 200 characters');
const description = z.string().max(10_000, 'Use at most 10,000 characters');
const optionalId = (msg: string) => z.uuid(msg).nullable();

export const createTaskInput = z.object({
  title,
  description: description.default(''),
  type: taskTypeSchema.default('task'),
  status: taskStatusSchema.default('todo'),
  priority: taskPrioritySchema.default('medium'),
  points: storyPointsSchema.nullable().default(null),
  assigneeId: optionalId('Pick a project member').default(null),
  sprintId: optionalId('Pick a sprint').default(null),
  dueDate: isoDateSchema.nullable().default(null),
});
export type CreateTaskInput = z.infer<typeof createTaskInput>;

export const updateTaskInput = z
  .object({
    title,
    description,
    type: taskTypeSchema,
    status: taskStatusSchema,
    priority: taskPrioritySchema,
    points: storyPointsSchema.nullable(),
    assigneeId: optionalId('Pick a project member'),
    sprintId: optionalId('Pick a sprint'),
    dueDate: isoDateSchema.nullable(),
  })
  .partial()
  .refine((o) => Object.keys(o).length > 0, 'Nothing to update');
export type UpdateTaskInput = z.infer<typeof updateTaskInput>;

/* ---------- board: moving a card ---------- */

/**
 * Move a card to `status`, between two neighbour cards of that column (ids, not positions:
 * the server works out the new position). Both null = the column is empty, or "put it at the end".
 */
export const moveTaskInput = z.object({
  status: taskStatusSchema,
  afterId: z.uuid('Invalid card id').nullable().default(null),
  beforeId: z.uuid('Invalid card id').nullable().default(null),
});
export type MoveTaskInput = z.infer<typeof moveTaskInput>;

/** Gap between cards when a column is (re)numbered. */
export const POSITION_STEP = 1024;
/** Below this gap the column is renumbered before a card is put between two others. */
export const MIN_POSITION_GAP = 1e-6;

/**
 * The position for a card placed after `prev` and before `next` (fractional ordering: one row changes per move).
 * Null means "no card on that side".
 */
export function positionBetween(prev: number | null, next: number | null): number {
  if (prev === null && next === null) return POSITION_STEP;
  if (prev === null) return (next ?? 0) - POSITION_STEP;
  if (next === null) return prev + POSITION_STEP;
  return (prev + next) / 2;
}

/** Board order: by position, then by number (ties happen when two cards were created at the same moment). */
export const byPosition = <T extends { position: number; number: number }>(a: T, b: T) => a.position - b.position || a.number - b.number;

/* ---------- subtasks and comments ---------- */

const subtaskTitle = z.string().trim().min(1, 'Enter a subtask').max(200, 'Use at most 200 characters');
export const createSubtaskInput = z.object({ title: subtaskTitle });
export const updateSubtaskInput = z
  .object({ title: subtaskTitle, done: z.boolean() })
  .partial()
  .refine((o) => Object.keys(o).length > 0, 'Nothing to update');
export type UpdateSubtaskInput = z.infer<typeof updateSubtaskInput>;

export const createCommentInput = z.object({
  body: z.string().trim().min(1, 'Write something first').max(5000, 'Use at most 5,000 characters'),
});

/**
 * Finds "@Name" mentions of people in `members`. Full names win over first names, matching ignores case,
 * and a mention must end at a word boundary ("@Dana" matches Dana, not "@Danaë").
 */
export function findMentions<M extends { id: string; name: string }>(body: string, members: readonly M[]): M[] {
  const text = body.toLowerCase();
  const endsWord = (at: number) => !/[\p{L}\p{N}_]/u.test(text.charAt(at));
  /** Positions of "@label" that end at a word boundary. */
  const positions = (label: string) => {
    const needle = `@${label.toLowerCase()}`;
    const out: number[] = [];
    for (let i = text.indexOf(needle); i !== -1; i = text.indexOf(needle, i + 1)) {
      if (endsWord(i + needle.length)) out.push(i);
    }
    return out;
  };

  const found = new Map<string, M>();
  const fullNameAt = new Set<number>(); // "@" positions already used by a full name
  for (const m of members) {
    const at = positions(m.name);
    if (at.length) found.set(m.id, m);
    for (const i of at) fullNameAt.add(i);
  }
  for (const m of members) {
    const first = m.name.split(/\s+/)[0];
    if (found.has(m.id) || !first) continue;
    // "@Dana Smith" is a full-name mention of Dana Smith, not a first-name mention of Dana Dev.
    if (positions(first).some((i) => !fullNameAt.has(i))) found.set(m.id, m);
  }
  return [...found.values()];
}

/* ---------- responses ---------- */

const personRef = z.object({ id: z.string(), name: z.string() });

export const taskSummary = z.object({
  id: z.string(),
  key: z.string(),
  number: z.number().int(),
  projectKey: z.string(),
  title: z.string(),
  type: taskTypeSchema,
  status: taskStatusSchema,
  priority: taskPrioritySchema,
  points: z.number().int().nullable(),
  assignee: personRef.nullable(),
  sprint: z.object({ id: z.string(), name: z.string() }).nullable(),
  dueDate: z.string().nullable(),
  /** Order inside its board column (sprint + status). */
  position: z.number(),
  subtasks: z.object({ total: z.number().int(), done: z.number().int() }),
  commentCount: z.number().int(),
  createdAt: z.string(),
  updatedAt: z.string(),
  doneAt: z.string().nullable(),
});
export type TaskSummary = z.infer<typeof taskSummary>;

export const subtask = z.object({ id: z.string(), title: z.string(), done: z.boolean() });
export type Subtask = z.infer<typeof subtask>;

export const comment = z.object({ id: z.string(), author: personRef.nullable(), body: z.string(), createdAt: z.string() });
export type Comment = z.infer<typeof comment>;

export const taskDetail = taskSummary.extend({
  description: z.string(),
  reporter: personRef.nullable(),
  subtaskList: z.array(subtask),
  comments: z.array(comment),
});
export type TaskDetail = z.infer<typeof taskDetail>;

export const tasksResponse = z.object({ tasks: z.array(taskSummary) });
export const taskResponse = z.object({ task: taskDetail });
export const taskSummaryResponse = z.object({ task: taskSummary });
/** The active sprint's board. `sprint: null` = no active sprint. Tasks are in board order. */
export const boardResponse = z.object({ sprint: sprint.nullable(), tasks: z.array(taskSummary) });
export type Board = z.infer<typeof boardResponse>;

/* ---------- task list: filtered, sorted and paged on the server ---------- */

export const TASK_SORTS = ['key', 'title', 'status', 'priority', 'assignee', 'sprint', 'points', 'due'] as const;
export type TaskSort = (typeof TASK_SORTS)[number];
export const SORT_DIRS = ['asc', 'desc'] as const;
export type SortDir = (typeof SORT_DIRS)[number];

export const PAGE_SIZES = [10, 25, 50, 100] as const;
export type PageSize = (typeof PAGE_SIZES)[number];
export const DEFAULT_PAGE_SIZE = 25 satisfies PageSize;
export const SEARCH_TEXT_MAX = 100;

/** Free-text search: trimmed, at most 100 characters. */
export const searchTextSchema = z.string().trim().max(SEARCH_TEXT_MAX, `Use at most ${SEARCH_TEXT_MAX} characters`);
/** A member id, or "none" for unassigned tasks. */
export const assigneeFilterSchema = z.union([z.literal('none'), z.uuid()], { error: 'Pick a member or "none"' });
/**
 * Status filter of the Tasks table: one status, or a group. `open` = everything not Done;
 * `overdue` = not Done and the due date has passed (the dashboard cards link to these).
 */
export const TASK_STATUS_GROUPS = ['open', 'overdue'] as const;
export type TaskStatusGroup = (typeof TASK_STATUS_GROUPS)[number];
export const TASK_STATUS_GROUP_LABELS: Record<TaskStatusGroup, string> = { open: 'Open (not done)', overdue: 'Overdue' };
export const taskStatusFilterSchema = z.union([taskStatusSchema, z.enum(TASK_STATUS_GROUPS)], { error: 'Pick a status' });
export type TaskStatusFilter = z.infer<typeof taskStatusFilterSchema>;

/** A sprint id, or "backlog" for tasks in no sprint. */
export const sprintFilterSchema = z.union([z.literal('backlog'), z.uuid()], { error: 'Pick a sprint or "backlog"' });

/**
 * The query string of GET /api/projects/:key/tasks. Every value arrives as text, so numbers are coerced.
 * A missing filter means "all". Anything invalid is a 400, never silently ignored.
 */
export const taskListQuery = z.object({
  q: searchTextSchema.default(''),
  status: taskStatusFilterSchema.optional(),
  priority: taskPrioritySchema.optional(),
  type: taskTypeSchema.optional(),
  assignee: assigneeFilterSchema.optional(),
  sprint: sprintFilterSchema.optional(),
  sort: z.enum(TASK_SORTS, { error: 'Unknown sort column' }).default('key'),
  dir: z.enum(SORT_DIRS, { error: 'Use asc or desc' }).default('asc'),
  page: z.coerce.number({ error: 'Page must be a number' }).int('Page must be a whole number').min(1, 'Pages start at 1').max(100_000, 'Page is too large').default(1),
  size: z.coerce.number({ error: 'Rows per page must be a number' })
    .pipe(z.literal(PAGE_SIZES, { error: `Use ${PAGE_SIZES.join(', ')} rows per page` }))
    .default(DEFAULT_PAGE_SIZE),
});
export type TaskListQuery = z.output<typeof taskListQuery>;

/** One page of tasks. `page` is the page actually returned (a page past the end gives the last page). */
export const taskPageResponse = z.object({
  tasks: z.array(taskSummary),
  total: z.number().int(),
  page: z.number().int(),
  size: z.number().int(),
});
export type TaskPage = z.infer<typeof taskPageResponse>;

/** Number of pages for `total` rows (at least 1, so an empty list still has page 1). */
export const pageCount = (total: number, size: number) => Math.max(1, Math.ceil(total / size));

/**
 * Page buttons for a pager: every page when there are 7 or fewer, otherwise the first, the last and
 * the pages next to `current`, with 'gap' where pages are left out. pageItems(6, 20) → 1 … 5 6 7 … 20.
 */
export function pageItems(current: number, count: number): (number | 'gap')[] {
  if (count <= 7) return Array.from({ length: count }, (_, i) => i + 1);
  const near = current <= 4 ? [2, 3, 4, 5] : current >= count - 3 ? [count - 4, count - 3, count - 2, count - 1] : [current - 1, current, current + 1];
  const pages = [1, ...near, count];
  return pages.flatMap((p, i) => {
    const prev = pages[i - 1];
    return prev !== undefined && p - prev > 1 ? ['gap' as const, p] : [p];
  });
}

/** A task is "overdue" when its due date has passed and it is not done. */
export const isOverdue = (t: Pick<TaskSummary, 'dueDate' | 'status'>, today: string) =>
  t.dueDate !== null && t.status !== 'done' && t.dueDate < today;

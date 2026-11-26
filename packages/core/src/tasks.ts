import { z } from 'zod';
import { isoDateSchema } from './sprints';

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

/** A task is "overdue" when its due date has passed and it is not done. */
export const isOverdue = (t: Pick<TaskSummary, 'dueDate' | 'status'>, today: string) =>
  t.dueDate !== null && t.status !== 'done' && t.dueDate < today;

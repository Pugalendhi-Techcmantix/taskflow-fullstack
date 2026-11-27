import {
  DEFAULT_PAGE_SIZE,
  PAGE_SIZES,
  SEARCH_TEXT_MAX,
  SORT_DIRS,
  TASK_SORTS,
  assigneeFilterSchema,
  sprintFilterSchema,
  taskPrioritySchema,
  taskStatusFilterSchema,
  taskTypeSchema,
  type TaskListQuery,
  type TaskSort,
  type TaskSummary,
} from '@taskflow/core';
import { z } from 'zod';

/**
 * The Tasks table's view, kept in the URL (`?status=todo&sort=priority&page=2`).
 * Every field falls back to its default, so a hand-edited or old link never breaks the page.
 * '' means "all" for the filters.
 */
export const taskTableState = z.object({
  q: z.string().max(SEARCH_TEXT_MAX).catch(''),
  status: taskStatusFilterSchema.or(z.literal('')).catch(''),
  priority: taskPrioritySchema.or(z.literal('')).catch(''),
  type: taskTypeSchema.or(z.literal('')).catch(''),
  assignee: assigneeFilterSchema.or(z.literal('')).catch(''),
  sprint: sprintFilterSchema.or(z.literal('')).catch(''),
  sort: z.enum(TASK_SORTS).catch('key'),
  dir: z.enum(SORT_DIRS).catch('asc'),
  page: z.coerce.number().int().min(1).catch(1),
  size: z.coerce.number().pipe(z.literal(PAGE_SIZES)).catch(DEFAULT_PAGE_SIZE),
});
export type TaskTableState = z.output<typeof taskTableState>;

/** The filters only (what "Clear filters" resets). Changing any of them goes back to page 1. */
export const NO_FILTERS = { q: '', status: '', priority: '', type: '', assignee: '', sprint: '', page: 1 } as const satisfies Partial<TaskTableState>;

export const hasFilters = (s: TaskTableState) =>
  s.q.trim() !== '' || s.status !== '' || s.priority !== '' || s.type !== '' || s.assignee !== '' || s.sprint !== '';

/** URL state → the API query ('' filters are left out, the search text is trimmed). */
export const toTaskListQuery = (s: TaskTableState): TaskListQuery => ({
  q: s.q.trim(),
  status: s.status || undefined,
  priority: s.priority || undefined,
  type: s.type || undefined,
  assignee: s.assignee || undefined,
  sprint: s.sprint || undefined,
  sort: s.sort,
  dir: s.dir,
  page: s.page,
  size: s.size,
});

/* ---------- table columns ↔ API sort keys ---------- */

type SortColumn = 'key' | 'title' | 'status' | 'priority' | 'assignee' | 'sprint' | 'points' | 'dueDate';
export const COLUMN_OF_SORT = {
  key: 'key', title: 'title', status: 'status', priority: 'priority', assignee: 'assignee', sprint: 'sprint', points: 'points', due: 'dueDate',
} as const satisfies Record<TaskSort, SortColumn & keyof TaskSummary>;
const SORT_OF_COLUMN: Record<SortColumn, TaskSort> = {
  key: 'key', title: 'title', status: 'status', priority: 'priority', assignee: 'assignee', sprint: 'sprint', points: 'points', dueDate: 'due',
};
export const SORTABLE_COLUMNS = Object.values(COLUMN_OF_SORT);

const isSortColumn = (id: string): id is SortColumn => Object.hasOwn(SORT_OF_COLUMN, id);
/** The API sort key for a clicked column, or null if that column can't be sorted. */
export const sortOfColumn = (id: string): TaskSort | null => (isSortColumn(id) ? SORT_OF_COLUMN[id] : null);

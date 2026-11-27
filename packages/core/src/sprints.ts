import { z } from 'zod';

export const SPRINT_STATUSES = ['planned', 'active', 'completed'] as const;
export type SprintStatus = (typeof SPRINT_STATUSES)[number];
export const sprintStatusSchema = z.enum(SPRINT_STATUSES);

export const SPRINT_STATUS_LABELS: Record<SprintStatus, string> = { planned: 'Planned', active: 'Active', completed: 'Completed' };

/** Longest allowed sprint, in days. */
export const MAX_SPRINT_DAYS = 56;
export const SPRINT_WEEK_OPTIONS = [1, 2, 3, 4] as const;

/* ---------- calendar dates as "YYYY-MM-DD" (no time, no time zone) ---------- */

const DAY_MS = 86_400_000;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** "2026-11-26" → UTC midnight of that day, or null if it is not a real date (e.g. 2026-02-30). */
export function parseIsoDate(value: string): Date | null {
  if (!ISO_DATE.test(value)) return null;
  const d = new Date(`${value}T00:00:00Z`);
  return Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== value ? null : d;
}
export const toIsoDate = (d: Date) => d.toISOString().slice(0, 10);
/** The calendar day of `d` in this machine's time zone (not UTC), "YYYY-MM-DD". */
export const localIsoDate = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
export const addDays = (isoDate: string, days: number) => {
  const d = parseIsoDate(isoDate);
  return d ? toIsoDate(new Date(d.getTime() + days * DAY_MS)) : isoDate;
};
/** Whole days from a to b (b − a). */
export const daysBetween = (a: string, b: string) => {
  const da = parseIsoDate(a);
  const db = parseIsoDate(b);
  return da && db ? Math.round((db.getTime() - da.getTime()) / DAY_MS) : 0;
};
/** A sprint of N weeks that starts on `start` ends N×7−1 days later (both days included). */
export const sprintEndDate = (start: string, weeks: number) => addDays(start, weeks * 7 - 1);

export const isoDateSchema = z.string().trim().refine((s) => parseIsoDate(s) !== null, 'Enter a valid date');

/* ---------- inputs ---------- */

const sprintName = z.string().trim().min(1, 'Enter a sprint name').max(60, 'Use at most 60 characters');
const sprintGoal = z.string().trim().max(300, 'Use at most 300 characters');

const datesInOrder = (v: { startDate?: string | undefined; endDate?: string | undefined }) =>
  v.startDate === undefined || v.endDate === undefined || v.endDate >= v.startDate;
const notTooLong = (v: { startDate?: string | undefined; endDate?: string | undefined }) =>
  v.startDate === undefined || v.endDate === undefined || daysBetween(v.startDate, v.endDate) < MAX_SPRINT_DAYS;

export const createSprintInput = z
  .object({ name: sprintName, goal: sprintGoal.default(''), startDate: isoDateSchema, endDate: isoDateSchema })
  .refine(datesInOrder, { message: 'The end date must be on or after the start date', path: ['endDate'] })
  .refine(notTooLong, { message: `A sprint can be at most ${MAX_SPRINT_DAYS / 7} weeks`, path: ['endDate'] });
export type CreateSprintInput = z.infer<typeof createSprintInput>;

export const updateSprintInput = z
  .object({ name: sprintName, goal: sprintGoal, startDate: isoDateSchema, endDate: isoDateSchema })
  .partial()
  .refine((o) => Object.keys(o).length > 0, 'Nothing to update')
  .refine(datesInOrder, { message: 'The end date must be on or after the start date', path: ['endDate'] })
  .refine(notTooLong, { message: `A sprint can be at most ${MAX_SPRINT_DAYS / 7} weeks`, path: ['endDate'] });
export type UpdateSprintInput = z.infer<typeof updateSprintInput>;

/* ---------- responses ---------- */

export const sprint = z.object({
  id: z.string(),
  projectKey: z.string(),
  name: z.string(),
  goal: z.string(),
  startDate: z.string(),
  endDate: z.string(),
  status: sprintStatusSchema,
  startedAt: z.string().nullable(),
  completedAt: z.string().nullable(),
  createdAt: z.string(),
});
export type Sprint = z.infer<typeof sprint>;

/** Where unfinished tasks go when a sprint is completed: the backlog or another (planned) sprint. */
export const completeSprintInput = z.object({ moveUnfinishedTo: z.union([z.literal('backlog'), z.uuid('Pick a sprint')]).default('backlog') });
export type CompleteSprintInput = z.infer<typeof completeSprintInput>;

export const sprintsResponse = z.object({ sprints: z.array(sprint) });
export const sprintResponse = z.object({ sprint });

/** Display order: active first, then planned (soonest first), then completed (most recent first). */
export function sortSprints<T extends { status: SprintStatus; startDate: string; endDate: string }>(list: readonly T[]): T[] {
  const rank: Record<SprintStatus, number> = { active: 0, planned: 1, completed: 2 };
  return list.toSorted((a, b) =>
    rank[a.status] - rank[b.status] ||
    (a.status === 'completed' ? b.endDate.localeCompare(a.endDate) : a.startDate.localeCompare(b.startDate)),
  );
}

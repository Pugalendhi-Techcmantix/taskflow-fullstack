import { z } from 'zod';
import { addDays, daysBetween, sprint } from './sprints';
import { taskStatusSchema, taskSummary } from './tasks';

/** How many of "my open tasks" the dashboard lists (the total is shown too). */
export const MY_OPEN_TASKS_LIMIT = 8;
/** Entries in the dashboard's "Recent activity" card. */
export const RECENT_ACTIVITY_LIMIT = 6;

const count = z.number().int().nonnegative();

/** GET /api/projects/:key/dashboard. Every number is counted by the database, for this project. */
export const dashboardResponse = z.object({
  counts: z.object({
    total: count,
    /** Not Done. */
    open: count,
    inProgress: count,
    done: count,
    /** Not Done and the due date is before today (server date). */
    overdue: count,
  }),
  activeSprint: sprint.nullable(),
  /** Tasks per status: of the active sprint, or of the whole project when no sprint is active. */
  byStatus: z.object({ scope: z.enum(['sprint', 'project']), counts: z.record(taskStatusSchema, count) }),
  /** Open tasks per project member who can work on tasks (Viewers left out), most first. */
  workload: z.array(z.object({ id: z.string(), name: z.string(), open: count })),
  unassignedOpen: count,
  /** The signed-in user's open tasks in this project (highest priority first, at most MY_OPEN_TASKS_LIMIT). */
  myOpenTasks: z.array(taskSummary),
  myOpenTotal: count,
  /** The active sprint's tasks, reduced to what the burndown needs. */
  sprintTasks: z.array(z.object({ points: z.number().int().nullable(), doneAt: z.string().nullable() })),
});
export type Dashboard = z.infer<typeof dashboardResponse>;

/* ---------- burndown ---------- */

export type BurndownInput = {
  /** Sprint calendar days, "YYYY-MM-DD". */
  startDate: string;
  endDate: string;
  /** Today in the viewer's calendar. */
  today: string;
  /** `doneDay`: the calendar day the task became Done, or null if it is not done. */
  tasks: readonly { points: number | null; doneDay: string | null }[];
};

export type Burndown = {
  /** Story points, or a plain task count when no task in the sprint has points. */
  unit: 'points' | 'tasks';
  total: number;
  /** Left to do now. */
  remaining: number;
  /** One entry per sprint day. `remaining` is null for days that haven't come yet. */
  days: { date: string; remaining: number | null }[];
  /** Index of today in `days`, or null when today is outside the sprint. */
  todayIndex: number | null;
};

/**
 * Remaining work per sprint day: the sprint's total minus what was Done on or before that day.
 * Uses the sprint's tasks as they are now (a task added mid-sprint counts from day 1).
 */
export function computeBurndown({ startDate, endDate, today, tasks }: BurndownInput): Burndown {
  const unit = tasks.some((t) => (t.points ?? 0) > 0) ? 'points' : 'tasks';
  const weight = (t: { points: number | null }) => (unit === 'points' ? (t.points ?? 0) : 1);
  const total = tasks.reduce((n, t) => n + weight(t), 0);
  const doneBy = (day: string) => tasks.reduce((n, t) => n + (t.doneDay !== null && t.doneDay <= day ? weight(t) : 0), 0);

  const length = Math.max(0, daysBetween(startDate, endDate)) + 1;
  const days = Array.from({ length }, (_, i) => {
    const date = addDays(startDate, i);
    return { date, remaining: date <= today ? total - doneBy(date) : null };
  });
  const offset = daysBetween(startDate, today);
  return {
    unit,
    total,
    remaining: total - tasks.reduce((n, t) => n + (t.doneDay !== null ? weight(t) : 0), 0),
    days,
    todayIndex: offset >= 0 && offset < length ? offset : null,
  };
}

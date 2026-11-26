import { daysBetween } from '@taskflow/core';

/** Today's calendar date in the user's own time zone, as "YYYY-MM-DD". */
export function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** "2026-12-01" → "Dec 1, 2026" (calendar date: no time-zone shifting). */
export function formatDay(iso: string, withYear = true): string {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    ...(withYear ? { year: 'numeric' } : {}),
    timeZone: 'UTC',
  });
}

/** "Dec 1 – Dec 14, 2026" */
export function formatRange(start: string, end: string): string {
  const sameYear = start.slice(0, 4) === end.slice(0, 4);
  return `${formatDay(start, !sameYear)} – ${formatDay(end)}`;
}

/** Inclusive length: Dec 1 – Dec 14 is 14 days. */
export const inclusiveDays = (start: string, end: string) => daysBetween(start, end) + 1;

export const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

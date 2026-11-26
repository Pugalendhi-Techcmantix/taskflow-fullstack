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

/** "just now", "5m ago", "3h ago", "2d ago", then a date. */
export function timeAgo(iso: string, now: number = Date.now()): string {
  const s = Math.max(0, (now - new Date(iso).getTime()) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86_400) return `${Math.floor(s / 3600)}h ago`;
  if (s < 7 * 86_400) return `${Math.floor(s / 86_400)}d ago`;
  return formatDay(iso.slice(0, 10));
}

import { daysBetween, type Sprint } from '@taskflow/core';
import { plural } from '../../lib/dates';

/** "6 days left", "Starts in 3 days", "Overdue by 2 days"… relative to today in the user's time zone. */
export function sprintTiming(s: Sprint, today: string): string {
  if (s.status === 'completed') return 'Completed';
  if (s.status === 'active') {
    const left = daysBetween(today, s.endDate);
    if (left > 0) return `${plural(left, 'day')} left`;
    if (left === 0) return 'Ends today';
    return `Overdue by ${plural(-left, 'day')}`;
  }
  const until = daysBetween(today, s.startDate);
  if (until > 0) return `Starts in ${plural(until, 'day')}`;
  if (until === 0) return 'Starts today';
  return `Planned start was ${plural(-until, 'day')} ago`;
}

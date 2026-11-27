import { Link } from 'react-router';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { z } from 'zod';
import { ACTIVITY_TYPES, ACTIVITY_TYPE_LABELS, activityTypeSchema, type ActivityEntry } from '@taskflow/core';
import { Avatar } from '../../app/Avatar';
import { LoadError, SkeletonRows } from '../../app/feedback';
import { Icon } from '../../app/icons';
import { plural, timeAgo } from '../../lib/dates';
import { useUrlState } from '../../lib/useUrlState';
import { fetchMembers, teamKeys } from '../team/team-api';
import { activityKeys, fetchTimeline } from './activity-api';
import { ACTIVITY_ICONS, describeActivity } from './describe';

/** Filters kept in the URL (`/activity?user=…&type=task`). Unknown values fall back to "all". */
const activityFilters = z.object({
  user: z.uuid().or(z.literal('')).catch(''),
  type: activityTypeSchema.or(z.literal('')).catch(''),
});

const pad = (n: number) => String(n).padStart(2, '0');
/** The calendar day in the viewer's time zone, "2026-11-27". */
const localDay = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

function dayLabel(day: string, now: Date): string {
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (day === localDay(now)) return 'Today';
  if (day === localDay(yesterday)) return 'Yesterday';
  const [y, m, d] = day.split('-').map(Number);
  const date = new Date(y ?? 0, (m ?? 1) - 1, d ?? 1);
  // "Nov 20" like the prototype; the year only when it isn't this year.
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', ...(date.getFullYear() === now.getFullYear() ? {} : { year: 'numeric' }) });
}

/** Consecutive entries of the same day, newest day first (entries arrive newest first). */
function byDay(entries: ActivityEntry[]): { day: string; items: ActivityEntry[] }[] {
  const groups: { day: string; items: ActivityEntry[] }[] = [];
  for (const e of entries) {
    const day = localDay(new Date(e.createdAt));
    const last = groups.at(-1);
    if (last?.day === day) last.items.push(e);
    else groups.push({ day, items: [e] });
  }
  return groups;
}

const noCursor = (): string | null => null;
const clockTime = (iso: string) => new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });

/** /activity: the workspace timeline (prototype "Activity history"). */
export function ActivityPage() {
  const [filters, setFilters, { isDefault, reset }] = useUrlState(activityFilters);
  const query = { user: filters.user || undefined, type: filters.type || undefined };
  const timeline = useInfiniteQuery({
    queryKey: activityKeys.timeline(query),
    queryFn: ({ pageParam, signal }) => fetchTimeline(query, pageParam, signal),
    initialPageParam: noCursor(),
    getNextPageParam: (last) => last.nextCursor,
    staleTime: 0, // history changes with every action elsewhere: always refetch when the page opens
  });
  const members = useQuery({ queryKey: teamKeys.members, queryFn: ({ signal }) => fetchMembers(signal) });
  const now = new Date();

  const entries = timeline.data?.pages.flatMap((p) => p.entries) ?? [];
  const total = timeline.data?.pages[0]?.total ?? 0;

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Activity history</h1>
          <p className="sub">An audit trail of every change in the workspace, written by the event bus</p>
        </div>
      </div>

      <div className="filters" role="search" aria-label="Filter activity">
        <select className="input" aria-label="Person" value={filters.user} onChange={(e) => setFilters({ user: e.target.value })}>
          <option value="">Everyone</option>
          {members.data?.members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
        </select>
        <select className="input" aria-label="Event type" value={filters.type}
          onChange={(e) => setFilters({ type: activityTypeSchema.or(z.literal('')).catch('').parse(e.target.value) })}>
          <option value="">All event types</option>
          {ACTIVITY_TYPES.map((t) => <option key={t} value={t}>{ACTIVITY_TYPE_LABELS[t]}</option>)}
        </select>
        {timeline.data && <span className="muted small" aria-live="polite">{plural(total, 'event')}</span>}
        {!isDefault && <button className="btn sm" onClick={reset}>Clear filters</button>}
      </div>

      {timeline.status === 'pending' && <div className="card"><SkeletonRows rows={8} label="Loading activity" /></div>}
      {timeline.status === 'error' && !timeline.data && <LoadError error={timeline.error} onRetry={() => void timeline.refetch()} />}
      {timeline.data && entries.length === 0 && (
        <div className="card empty-state">
          <div className="empty-icon"><Icon name="clock" size={22} /></div>
          <h2>{isDefault ? 'No activity yet' : 'No activity matches these filters'}</h2>
          <p className="muted">{isDefault ? 'Changes to projects, sprints and tasks will be listed here as they happen.' : 'Try another person or event type.'}</p>
          {!isDefault && <button className="btn" onClick={reset}>Clear filters</button>}
        </div>
      )}
      {timeline.data && entries.length > 0 && (
        <div className="card">
          <div className="timeline">
            {byDay(entries).map(({ day, items }) => (
              <section key={day} aria-label={dayLabel(day, now)}>
                <h2 className="tl-day">{dayLabel(day, now)}</h2>
                <ol className="tl-list">
                  {items.map((e) => <TimelineItem key={e.id} entry={e} />)}
                </ol>
              </section>
            ))}
          </div>
          {timeline.hasNextPage && (
            <div className="tl-more">
              <button className="btn" onClick={() => void timeline.fetchNextPage()} disabled={timeline.isFetchingNextPage}>
                {timeline.isFetchingNextPage ? 'Loading…' : `Load more (${total - entries.length} older)`}
              </button>
            </div>
          )}
          {/* A failed "Load more" keeps the entries already shown and offers a retry. */}
          {timeline.isFetchNextPageError && <LoadError error={timeline.error} onRetry={() => void timeline.fetchNextPage()} />}
        </div>
      )}
    </>
  );
}

function TimelineItem({ entry: e }: { entry: ActivityEntry }) {
  return (
    <li className="tl-item">
      <span className={`tl-icon tl-${e.type}`} aria-hidden="true"><Icon name={ACTIVITY_ICONS[e.type]} size={14} /></span>
      <div className="tl-body">
        <div>
          <b>{e.actor?.name ?? 'Someone'}</b> {describeActivity(e.event)}
          {e.task && e.project && (
            <Link className="tl-open" to={`/projects/${e.project.key}/tasks?task=${e.task.key}`} aria-label={`Open ${e.task.key}`}>Open</Link>
          )}
        </div>
        <div className="muted small">
          <time dateTime={e.createdAt} title={new Date(e.createdAt).toLocaleString('en-US')}>{timeAgo(e.createdAt)} · {clockTime(e.createdAt)}</time>
          {e.project && <> · {e.project.name}</>}
        </div>
      </div>
      {e.actor && <Avatar id={e.actor.id} name={e.actor.name} size="sm" />}
    </li>
  );
}

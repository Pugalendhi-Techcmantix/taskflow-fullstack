import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { SPRINT_STATUS_LABELS, addDays, daysBetween, sortSprints, type Sprint, type SprintStatus } from '@taskflow/core';
import { ConfirmDialog } from '../../app/ConfirmDialog';
import { LoadError, SkeletonRows, errorMessage } from '../../app/feedback';
import { Icon } from '../../app/icons';
import { toast } from '../../app/toast';
import { formatRange, inclusiveDays, plural, todayIso } from '../../lib/dates';
import { ApiError } from '../../lib/http';
import { reloadSessionUser, useCan } from '../auth/session';
import { useCurrentProject } from '../projects/ProjectPage';
import { SprintFormDialog } from './SprintFormDialog';
import { completeSprint, deleteSprint, fetchSprints, sprintKeys, startSprint } from './sprints-api';

type Dialog =
  | { kind: 'none' }
  | { kind: 'create' }
  | { kind: 'edit'; sprint: Sprint }
  | { kind: 'complete'; sprint: Sprint }
  | { kind: 'delete'; sprint: Sprint };

/** "6 days left", "Starts in 3 days", "Ended 2 days ago"… relative to today in the user's time zone. */
function timing(s: Sprint, today: string): string {
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

export function SprintsPage() {
  const project = useCurrentProject();
  const can = useCan();
  const qc = useQueryClient();
  const listKey = sprintKeys.list(project.key);
  const sprints = useQuery({ queryKey: listKey, queryFn: ({ signal }) => fetchSprints(project.key, signal) });
  const [dialog, setDialog] = useState<Dialog>({ kind: 'none' });
  const close = () => setDialog({ kind: 'none' });
  const manage = can('sprint:manage');
  const today = todayIso();

  /** Optimistic status change: the card moves at once and snaps back if the server refuses. */
  const transition = useMutation({
    mutationFn: ({ sprint, to }: { sprint: Sprint; to: Extract<SprintStatus, 'active' | 'completed'> }) =>
      to === 'active' ? startSprint(project.key, sprint.id) : completeSprint(project.key, sprint.id),
    onMutate: async ({ sprint, to }) => {
      await qc.cancelQueries({ queryKey: listKey });
      const previous = qc.getQueryData<{ sprints: Sprint[] }>(listKey);
      qc.setQueryData<{ sprints: Sprint[] }>(listKey, (old) =>
        old && { sprints: sortSprints(old.sprints.map((s) => (s.id === sprint.id ? { ...s, status: to } : s))) },
      );
      return { previous };
    },
    onError: (err, _v, ctx) => {
      if (ctx?.previous) qc.setQueryData(listKey, ctx.previous);
      toast(errorMessage(err), 'error');
      if (err instanceof ApiError && err.status === 403) void reloadSessionUser();
    },
    onSuccess: ({ sprint }) => {
      toast(sprint.status === 'active' ? `${sprint.name} started` : `${sprint.name} completed`);
      close();
    },
    onSettled: () => void qc.invalidateQueries({ queryKey: listKey }),
  });

  const remove = useMutation({
    mutationFn: (sprint: Sprint) => deleteSprint(project.key, sprint.id),
    onError: (err) => toast(errorMessage(err), 'error'),
    onSuccess: (_d, sprint) => {
      toast(`${sprint.name} deleted`);
      close();
    },
    onSettled: () => void qc.invalidateQueries({ queryKey: listKey }),
  });

  if (sprints.status === 'pending') return <div className="card"><SkeletonRows rows={5} label="Loading sprints" /></div>;
  if (sprints.status === 'error') return <LoadError error={sprints.error} onRetry={() => void sprints.refetch()} />;

  const list = sprints.data.sprints;
  const active = list.find((s) => s.status === 'active');
  // New sprint: starts the day after the latest sprint ends (or today), named "Sprint N".
  const lastEnd = list.reduce<string | null>((max, s) => (max === null || s.endDate > max ? s.endDate : max), null);
  const nextStart = lastEnd && addDays(lastEnd, 1) > today ? addDays(lastEnd, 1) : today;

  return (
    <>
      <div className="section-head">
        <div>
          <h2>Sprints</h2>
          <p className="muted small">{active ? `${active.name} is active · ${timing(active, today)}` : 'No active sprint'} · {plural(list.length, 'sprint')}</p>
        </div>
        {manage && <button className="btn primary" onClick={() => setDialog({ kind: 'create' })}>+ New sprint</button>}
      </div>

      {list.length === 0 ? (
        <div className="card empty-state">
          <div className="empty-icon"><Icon name="sprint" size={22} /></div>
          <h2>No sprints yet</h2>
          <p className="muted">{manage ? 'Plan the first sprint: give it a goal and a 1–4 week time box.' : 'A Project Manager will plan the first sprint.'}</p>
          {manage && <button className="btn primary" onClick={() => setDialog({ kind: 'create' })}>+ New sprint</button>}
        </div>
      ) : (
        <ul className="sprint-list">
          {list.map((s) => (
            <li key={s.id} className={`card sprint ${s.status}`}>
              <div className="sprint-head">
                <h3>{s.name}</h3>
                <span className={`badge chip-${s.status}`}>{SPRINT_STATUS_LABELS[s.status]}</span>
                <span className="muted small nowrap"><Icon name="clock" size={13} /> {formatRange(s.startDate, s.endDate)} · {plural(inclusiveDays(s.startDate, s.endDate), 'day')}</span>
                <span className={`small nowrap ${s.status === 'active' && daysBetween(today, s.endDate) < 0 ? 'overdue' : 'muted'}`}>{timing(s, today)}</span>
                {manage && (
                  <span className="sprint-actions">
                    {s.status === 'planned' && (
                      <button className="btn sm primary" disabled={Boolean(active) || transition.isPending}
                        title={active ? `Complete ${active.name} first — only one sprint can be active` : undefined}
                        onClick={() => transition.mutate({ sprint: s, to: 'active' })}>Start sprint</button>
                    )}
                    {s.status === 'active' && <button className="btn sm primary" onClick={() => setDialog({ kind: 'complete', sprint: s })}>Complete sprint</button>}
                    {s.status !== 'completed' && <button className="btn sm" onClick={() => setDialog({ kind: 'edit', sprint: s })} aria-label={`Edit ${s.name}`}>Edit</button>}
                    {s.status === 'planned' && <button className="btn sm danger" onClick={() => setDialog({ kind: 'delete', sprint: s })} aria-label={`Delete ${s.name}`}>Delete</button>}
                  </span>
                )}
              </div>
              <p className={s.goal ? 'sprint-goal' : 'sprint-goal muted'}>{s.goal || 'No goal set.'}</p>
            </li>
          ))}
        </ul>
      )}

      {dialog.kind === 'create' && (
        <SprintFormDialog mode="create" projectKey={project.key} defaults={{ name: `Sprint ${list.length + 1}`, startDate: nextStart }} onClose={close} />
      )}
      {dialog.kind === 'edit' && <SprintFormDialog mode="edit" projectKey={project.key} sprint={dialog.sprint} onClose={close} />}
      {dialog.kind === 'complete' && (
        <ConfirmDialog title={`Complete ${dialog.sprint.name}?`} confirmLabel="Complete sprint" pendingLabel="Completing…" pending={transition.isPending}
          onConfirm={() => transition.mutate({ sprint: dialog.sprint, to: 'completed' })} onClose={close}>
          <p>The sprint becomes read-only and another sprint can be started.</p>
          <p className="muted small" style={{ marginTop: 8 }}>Moving unfinished tasks to the next sprint or the backlog arrives with tasks (Module 5).</p>
        </ConfirmDialog>
      )}
      {dialog.kind === 'delete' && (
        <ConfirmDialog title={`Delete ${dialog.sprint.name}?`} confirmLabel="Delete sprint" pendingLabel="Deleting…" danger pending={remove.isPending}
          onConfirm={() => remove.mutate(dialog.sprint)} onClose={close}>
          <p>This planned sprint will be removed. This can't be undone.</p>
        </ConfirmDialog>
      )}
    </>
  );
}

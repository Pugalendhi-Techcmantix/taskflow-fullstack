import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { z } from 'zod';
import {
  RECENT_ACTIVITY_LIMIT,
  TASK_STATUSES,
  TASK_STATUS_LABELS,
  computeBurndown,
  localIsoDate,
  projectKeySchema,
  type Dashboard,
  type Project,
} from '@taskflow/core';
import { Avatar } from '../../app/Avatar';
import { LoadError, SkeletonRows } from '../../app/feedback';
import { Icon, type IconName } from '../../app/icons';
import { formatRange, timeAgo, todayIso } from '../../lib/dates';
import { useUrlState } from '../../lib/useUrlState';
import { activityKeys, fetchTimeline } from '../activity/activity-api';
import { describeActivity } from '../activity/describe';
import { useCan } from '../auth/session';
import { lastProject, useProjects } from '../projects/projects-api';
import { sprintTiming } from '../sprints/sprint-timing';
import { StatusBadge, TypeIcon } from '../tasks/badges';
import { TaskDialog } from '../tasks/TaskDialog';
import { useTaskParam } from '../tasks/useTaskParam';
import { BurndownChart } from './BurndownChart';
import { dashboardKeys, fetchDashboard } from './dashboard-api';

/** `/?project=TF` (shareable). Without it: the last project you opened, else your first project. */
const dashboardView = z.object({ project: projectKeySchema.or(z.literal('')).catch('') });

/** `/`: the project dashboard (prototype). */
export function DashboardPage() {
  const projects = useProjects();
  const [view] = useUrlState(dashboardView);
  const can = useCan();

  if (projects.status === 'pending') return <DashboardSkeleton />;
  if (projects.status === 'error') return <LoadError error={projects.error} onRetry={() => void projects.refetch()} />;

  const list = projects.data.projects;
  const remembered = lastProject();
  const project = list.find((p) => p.key === view.project) ?? list.find((p) => p.key === remembered) ?? list[0];
  if (!project) {
    return (
      <>
        <PageHead sub="Your projects at a glance" />
        <div className="card empty-state">
          <div className="empty-icon"><Icon name="dashboard" size={22} /></div>
          <h2>No projects yet</h2>
          <p className="muted">{can('project:create') ? 'Create a project to see its progress, sprint burndown and workload here.' : 'When someone adds you to a project, its dashboard appears here.'}</p>
          <Link className="btn primary" to="/projects">Go to projects</Link>
        </div>
      </>
    );
  }
  // A new key remounts the dashboard, so nothing from the previous project lingers.
  return <ProjectDashboard key={project.key} project={project} />;
}

function PageHead({ sub }: { sub: ReactNode }) {
  return (
    <div className="page-head">
      <div>
        <h1>Dashboard</h1>
        <p className="sub">{sub}</p>
      </div>
    </div>
  );
}

function ProjectDashboard({ project }: { project: Project }) {
  const dashboard = useQuery({ queryKey: dashboardKeys.project(project.key), queryFn: ({ signal }) => fetchDashboard(project.key, signal), staleTime: 0 });
  const recentFilters = { project: project.key, limit: RECENT_ACTIVITY_LIMIT };
  const recent = useQuery({
    queryKey: activityKeys.timeline(recentFilters),
    queryFn: ({ signal }) => fetchTimeline(recentFilters, null, signal),
    staleTime: 0,
  });
  const { openNumber, open, close } = useTaskParam(project.key);
  const today = todayIso();

  if (dashboard.status === 'pending') return <DashboardSkeleton />;
  if (dashboard.status === 'error') {
    return (
      <>
        <PageHead sub={project.name} />
        <LoadError error={dashboard.error} onRetry={() => void dashboard.refetch()} />
      </>
    );
  }

  const d = dashboard.data;
  const sprint = d.activeSprint;
  const tasksUrl = (status: string) => `/projects/${project.key}/tasks?status=${status}`;
  const percentDone = d.counts.total ? Math.round((d.counts.done / d.counts.total) * 100) : 0;

  return (
    <div className={dashboard.isRefetching ? 'refreshing' : undefined}>
      <PageHead sub={<>{project.name} · {sprint ? <>{sprint.name} · {sprintTiming(sprint, today)}</> : 'No active sprint'}</>} />

      <div className="stats">
        <StatCard to={tasksUrl('open')} icon="list" label="Open tasks" value={d.counts.open} note={`${d.counts.total} total in project`} />
        <StatCard to={tasksUrl('in_progress')} icon="trend" label="In progress" value={d.counts.inProgress} note="Being worked on now" />
        <StatCard to={tasksUrl('done')} icon="check" label="Completed" value={d.counts.done} note={`${percentDone}% of all tasks`} />
        <StatCard to={tasksUrl('overdue')} icon="alert" label="Overdue" value={d.counts.overdue}
          note={d.counts.overdue ? <span className="overdue">Needs attention</span> : 'All on track'} />
      </div>

      <div className="dash-grid">
        <section className="card" aria-labelledby="burn-h">
          <div className="dash-head">
            <h2 id="burn-h">Sprint burndown</h2>
            {sprint && <span className="muted small">{sprint.name} · {formatRange(sprint.startDate, sprint.endDate)}</span>}
          </div>
          <Burndown dashboard={d} today={today} projectKey={project.key} />
        </section>

        <section className="card" aria-labelledby="status-h">
          <div className="dash-head"><h2 id="status-h">{d.byStatus.scope === 'sprint' ? 'Sprint tasks by status' : 'Tasks by status'}</h2></div>
          <StatusBars dashboard={d} />
          <h3 className="sub-h dash-sub" id="load-h">Open tasks per person</h3>
          <WorkloadBars dashboard={d} />
        </section>
      </div>

      <div className="dash-grid even">
        <section className="card" aria-labelledby="mine-h">
          <div className="dash-head">
            <h2 id="mine-h">My open tasks</h2>
            <span className="muted small">{d.myOpenTotal}</span>
          </div>
          {d.myOpenTasks.length === 0 ? (
            <p className="muted small">Nothing assigned to you in this project.</p>
          ) : (
            <ul className="list-rows">
              {d.myOpenTasks.map((t) => (
                <li key={t.id}>
                  <button type="button" className="list-row" onClick={() => open(t.key)}>
                    <TypeIcon type={t.type} />
                    <span className="key">{t.key}</span>
                    <span className="title">{t.title}</span>
                    <StatusBadge status={t.status} />
                  </button>
                </li>
              ))}
            </ul>
          )}
          {d.myOpenTotal > d.myOpenTasks.length && (
            <Link className="small dash-more" to={`/projects/${project.key}/tasks?status=open&sort=priority`}>
              See all {d.myOpenTotal} in the task list
            </Link>
          )}
        </section>

        <section className="card" aria-labelledby="recent-h">
          <div className="dash-head">
            <h2 id="recent-h">Recent activity</h2>
            <Link className="small" to="/activity">View all</Link>
          </div>
          {recent.status === 'pending' && <SkeletonRows rows={4} label="Loading recent activity" />}
          {recent.status === 'error' && <LoadError error={recent.error} onRetry={() => void recent.refetch()} />}
          {recent.status === 'success' && recent.data.entries.length === 0 && <p className="muted small">No activity yet.</p>}
          {recent.status === 'success' && recent.data.entries.length > 0 && (
            <ul className="act-list">
              {recent.data.entries.map((e) => (
                <li key={e.id} className="act">
                  {e.actor ? <Avatar id={e.actor.id} name={e.actor.name} size="sm" /> : <span className="avatar sm more" aria-hidden="true">?</span>}
                  <div>
                    <div><b>{e.actor?.name ?? 'Someone'}</b> {describeActivity(e.event)}</div>
                    <time className="time" dateTime={e.createdAt}>{timeAgo(e.createdAt)}</time>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      {openNumber !== null && <TaskDialog key={openNumber} project={project} number={openNumber} onClose={close} />}
    </div>
  );
}

/** A summary number that opens the matching Tasks table view. */
function StatCard({ to, icon, label, value, note }: { to: string; icon: IconName; label: string; value: number; note: ReactNode }) {
  return (
    <Link to={to} className="card stat" aria-label={`${label}: ${value}. Show these tasks`}>
      <div className="label"><Icon name={icon} size={15} /> {label}</div>
      <div className="value">{value}</div>
      <div className="delta">{note}</div>
    </Link>
  );
}

function Burndown({ dashboard: d, today, projectKey }: { dashboard: Dashboard; today: string; projectKey: string }) {
  const sprint = d.activeSprint;
  const can = useCan();
  if (!sprint) {
    return (
      <div className="empty-state small-empty">
        <p className="muted">Start a sprint to see its burndown.</p>
        {can('sprint:manage') && <Link className="btn sm" to={`/projects/${projectKey}/sprints`}>Go to sprints</Link>}
      </div>
    );
  }
  if (d.sprintTasks.length === 0) {
    return <div className="empty-state small-empty"><p className="muted">{sprint.name} has no tasks yet. Add tasks to the sprint to track progress.</p></div>;
  }
  const data = computeBurndown({
    startDate: sprint.startDate,
    endDate: sprint.endDate,
    today,
    // "done on which day" in the viewer's own calendar
    tasks: d.sprintTasks.map((t) => ({ points: t.points, doneDay: t.doneAt ? localIsoDate(new Date(t.doneAt)) : null })),
  });
  return <BurndownChart data={data} label={`${sprint.name} burndown`} />;
}

/** One labelled bar per row: the label and the number are always visible (colour is never the only cue). */
function BarRow({ label, value, max, fill }: { label: ReactNode; value: number; max: number; fill: string }) {
  return (
    <li className="bar-row">
      <span className="bar-label">{label}</span>
      <span className="bar" aria-hidden="true"><span className={`bar-fill ${fill}`} style={{ width: `${max ? (value / max) * 100 : 0}%` }} /></span>
      <b className="bar-value">{value}</b>
    </li>
  );
}

function StatusBars({ dashboard: d }: { dashboard: Dashboard }) {
  const total = TASK_STATUSES.reduce((n, s) => n + d.byStatus.counts[s], 0);
  if (total === 0) return <p className="muted small">{d.byStatus.scope === 'sprint' ? 'This sprint has no tasks yet.' : 'No tasks yet.'}</p>;
  return (
    <ul className="bars" aria-label="Tasks by status">
      {TASK_STATUSES.map((s) => <BarRow key={s} label={TASK_STATUS_LABELS[s]} value={d.byStatus.counts[s]} max={total} fill={`st-${s}`} />)}
    </ul>
  );
}

function WorkloadBars({ dashboard: d }: { dashboard: Dashboard }) {
  const max = Math.max(1, d.unassignedOpen, ...d.workload.map((w) => w.open));
  if (d.workload.length === 0 && d.unassignedOpen === 0) return <p className="muted small">No members can work on tasks yet.</p>;
  return (
    <ul className="bars" aria-labelledby="load-h">
      {d.workload.map((w) => (
        <BarRow key={w.id} max={max} value={w.open} fill="accent"
          label={<><Avatar id={w.id} name={w.name} size="xs" /><span className="bar-name" title={w.name}>{w.name.split(/\s+/)[0]}</span></>} />
      ))}
      {d.unassignedOpen > 0 && <BarRow max={max} value={d.unassignedOpen} fill="muted" label={<span className="bar-name muted">Unassigned</span>} />}
    </ul>
  );
}

function DashboardSkeleton() {
  return (
    <div aria-busy="true">
      <PageHead sub="Loading…" />
      <div className="stats">{[0, 1, 2, 3].map((i) => <div key={i} className="card stat"><SkeletonRows rows={2} label={i === 0 ? 'Loading dashboard' : ''} /></div>)}</div>
      <div className="dash-grid">
        <div className="card"><SkeletonRows rows={6} label="" /></div>
        <div className="card"><SkeletonRows rows={6} label="" /></div>
      </div>
    </div>
  );
}

import { MY_OPEN_TASKS_LIMIT, TASK_STATUSES, localIsoDate, type Dashboard } from '@taskflow/core';
import type { Repositories } from '../../repositories';
import type { Actor } from '../access/actor';
import type { ProjectsService } from '../projects/projects.service';
import { toSprint } from '../sprints/sprints.service';
import type { TaskFilter } from '../tasks/tasks.repository';
import { toTaskSummary } from '../tasks/tasks.service';

export type DashboardService = ReturnType<typeof createDashboardService>;

/**
 * The project dashboard. Every number is counted by the database with the same filters the Tasks
 * table uses (`status=open`, `status=overdue`…), so a card and the table it links to always agree.
 */
export function createDashboardService(deps: {
  repos: Pick<Repositories, 'tasks' | 'sprints'>;
  projects: Pick<ProjectsService, 'visibleProject'>;
  now?: () => Date;
}) {
  const { tasks, sprints } = deps.repos;
  const now = deps.now ?? (() => new Date());

  async function get(actor: Actor, projectKey: string): Promise<Dashboard> {
    const project = await deps.projects.visibleProject(actor, projectKey);
    const today = localIsoDate(now());
    const active = (await sprints.listByProject(project.id)).find((s) => s.status === 'active') ?? null;
    const mine: TaskFilter = { projectId: project.id, q: '', status: 'open', assignee: actor.user.id, today };

    const [byStatus, overdue, openByAssignee, sprintByStatus, sprintTasks, myOpenTasks, myOpenTotal] = await Promise.all([
      tasks.countByStatus({ projectId: project.id }),
      tasks.countOverdue(project.id, today),
      tasks.countOpenByAssigneeIn(project.id),
      active ? tasks.countByStatus({ projectId: project.id, sprintId: active.id }) : null,
      active ? tasks.listBySprint(active.id) : [],
      tasks.listPage(mine, { sort: 'priority', dir: 'asc' }, { offset: 0, limit: MY_OPEN_TASKS_LIMIT }),
      tasks.countMatching(mine),
    ]);

    const total = TASK_STATUSES.reduce((n, s) => n + byStatus[s], 0);
    return {
      counts: { total, open: total - byStatus.done, inProgress: byStatus.in_progress, done: byStatus.done, overdue },
      activeSprint: active ? toSprint(active) : null,
      byStatus: sprintByStatus ? { scope: 'sprint', counts: sprintByStatus } : { scope: 'project', counts: byStatus },
      workload: project.members
        .filter((m) => m.roleId !== 'viewer') // Viewers can't work on tasks (prototype)
        .map((m) => ({ id: m.userId, name: m.name, open: openByAssignee.get(m.userId) ?? 0 }))
        .sort((a, b) => b.open - a.open || a.name.localeCompare(b.name)),
      unassignedOpen: openByAssignee.get(null) ?? 0,
      myOpenTasks: myOpenTasks.map(toTaskSummary),
      myOpenTotal,
      sprintTasks: sprintTasks.map((t) => ({ points: t.points, doneAt: t.status === 'done' ? (t.doneAt?.toISOString() ?? null) : null })),
    };
  }

  return { get };
}

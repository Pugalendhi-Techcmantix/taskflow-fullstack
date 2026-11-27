import {
  MAX_SPRINT_DAYS,
  SPRINT_CHANGE_FIELDS,
  daysBetween,
  sortSprints,
  ERROR_CODES,
  type CompleteSprintInput,
  type CreateSprintInput,
  type Sprint,
  type UpdateSprintInput,
} from '@taskflow/core';
import { AppError, conflict, notFoundError } from '../../http/errors';
import type { Repositories } from '../../repositories';
import type { Actor } from '../access/actor';
import type { ActivityRecorder } from '../activity/activity.service';
import type { ProjectsService } from '../projects/projects.service';
import type { SprintChanges, SprintRecord } from './sprints.repository';

export const toSprint = (s: SprintRecord): Sprint => ({
  id: s.id,
  projectKey: s.projectKey,
  name: s.name,
  goal: s.goal,
  startDate: s.startDate,
  endDate: s.endDate,
  status: s.status,
  startedAt: s.startedAt?.toISOString() ?? null,
  completedAt: s.completedAt?.toISOString() ?? null,
  createdAt: s.createdAt.toISOString(),
});

const notFound = () => notFoundError('Sprint not found');

export type SprintsService = ReturnType<typeof createSprintsService>;

export function createSprintsService(deps: {
  repos: Pick<Repositories, 'sprints' | 'tasks'>;
  projects: Pick<ProjectsService, 'visibleProject'>;
  activity: ActivityRecorder;
  now?: () => Date;
}) {
  const { sprints } = deps.repos;
  const now = deps.now ?? (() => new Date());
  const record = (actor: Actor, projectId: string, event: Parameters<ActivityRecorder['record']>[0]['event']) =>
    deps.activity.record({ actorId: actor.user.id, projectId, event });

  /** The sprint, checked to belong to a project the actor can see (otherwise 404). */
  async function sprintIn(actor: Actor, projectKey: string, sprintId: string): Promise<SprintRecord> {
    const project = await deps.projects.visibleProject(actor, projectKey);
    const s = await sprints.findById(sprintId);
    if (!s || s.projectId !== project.id) throw notFound();
    return s;
  }

  async function list(actor: Actor, projectKey: string): Promise<Sprint[]> {
    const project = await deps.projects.visibleProject(actor, projectKey);
    return sortSprints(await sprints.listByProject(project.id)).map(toSprint);
  }

  async function create(actor: Actor, projectKey: string, input: CreateSprintInput): Promise<Sprint> {
    const project = await deps.projects.visibleProject(actor, projectKey);
    const created = await sprints.create({ projectId: project.id, ...input });
    await record(actor, project.id, { action: 'sprint.created', sprint: { name: created.name } });
    return toSprint(created);
  }

  /** Planned: anything. Active: name, goal and end date. Completed: nothing. */
  async function update(actor: Actor, projectKey: string, sprintId: string, input: UpdateSprintInput): Promise<Sprint> {
    const s = await sprintIn(actor, projectKey, sprintId);
    if (s.status === 'completed') throw conflict('A completed sprint can’t be changed.');
    if (s.status === 'active' && input.startDate !== undefined && input.startDate !== s.startDate) {
      throw conflict('The start date of an active sprint can’t be changed.', { startDate: 'Already started' });
    }
    const startDate = input.startDate ?? s.startDate;
    const endDate = input.endDate ?? s.endDate;
    if (endDate < startDate) throw conflict('The end date must be on or after the start date', { endDate: 'Must be on or after the start date' });
    if (daysBetween(startDate, endDate) >= MAX_SPRINT_DAYS) {
      throw conflict(`A sprint can be at most ${MAX_SPRINT_DAYS / 7} weeks`, { endDate: `At most ${MAX_SPRINT_DAYS / 7} weeks` });
    }
    const changes: SprintChanges = {};
    if (input.name !== undefined) changes.name = input.name;
    if (input.goal !== undefined) changes.goal = input.goal;
    if (input.startDate !== undefined) changes.startDate = input.startDate;
    if (input.endDate !== undefined) changes.endDate = input.endDate;
    const updated = await sprints.update(s.id, changes);
    const fields = SPRINT_CHANGE_FIELDS.filter((f) => changes[f] !== undefined && changes[f] !== s[f]);
    if (fields.length) await record(actor, s.projectId, { action: 'sprint.updated', sprint: { name: updated.name }, fields });
    return toSprint(updated);
  }

  async function start(actor: Actor, projectKey: string, sprintId: string): Promise<Sprint> {
    const s = await sprintIn(actor, projectKey, sprintId);
    const result = await sprints.start(s.id, now());
    if (result === 'not_planned') throw conflict(s.status === 'active' ? 'This sprint is already active.' : 'Only a planned sprint can be started.');
    if (result === 'another_active') throw conflict('Another sprint is already active in this project. Complete it first.');
    await record(actor, s.projectId, { action: 'sprint.started', sprint: { name: s.name } });
    return toSprint(result);
  }

  /** Unfinished tasks go to the backlog or to another planned sprint of the same project. */
  async function complete(actor: Actor, projectKey: string, sprintId: string, input: CompleteSprintInput): Promise<{ sprint: Sprint; movedTasks: number }> {
    const s = await sprintIn(actor, projectKey, sprintId);
    let moveTo: string | null = null;
    let movedTo: string | null = null; // sprint name for the history, null = backlog
    if (input.moveUnfinishedTo !== 'backlog') {
      const target = await sprints.findById(input.moveUnfinishedTo);
      if (!target || target.projectId !== s.projectId || target.id === s.id || target.status !== 'planned') {
        throw new AppError(400, ERROR_CODES.validation, 'Unfinished tasks can only move to a planned sprint of this project', { moveUnfinishedTo: 'Pick a planned sprint or the backlog' });
      }
      moveTo = target.id;
      movedTo = target.name;
    }
    const inSprint = await deps.repos.tasks.listBySprint(s.id);
    const result = await sprints.complete(s.id, now(), moveTo);
    if (result === 'not_active') throw conflict('Only the active sprint can be completed.');
    await record(actor, s.projectId, {
      action: 'sprint.completed',
      sprint: { name: s.name },
      done: inSprint.filter((t) => t.status === 'done').length,
      total: inSprint.length,
      movedTo,
    });
    return { sprint: toSprint(result.sprint), movedTasks: result.moved };
  }

  async function remove(actor: Actor, projectKey: string, sprintId: string): Promise<void> {
    const s = await sprintIn(actor, projectKey, sprintId);
    if (!(await sprints.deletePlanned(s.id))) throw conflict('Only a planned sprint can be deleted.');
    await record(actor, s.projectId, { action: 'sprint.deleted', sprint: { name: s.name } });
  }

  return { list, create, update, start, complete, remove };
}

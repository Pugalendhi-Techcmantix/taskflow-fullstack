import {
  MAX_SPRINT_DAYS,
  daysBetween,
  sortSprints,
  type CreateSprintInput,
  type Sprint,
  type UpdateSprintInput,
} from '@taskflow/core';
import { conflict, notFoundError } from '../../http/errors';
import type { Repositories } from '../../repositories';
import type { Actor } from '../access/actor';
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
  repos: Pick<Repositories, 'sprints'>;
  projects: Pick<ProjectsService, 'visibleProject'>;
  now?: () => Date;
}) {
  const { sprints } = deps.repos;
  const now = deps.now ?? (() => new Date());

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
    return toSprint(await sprints.create({ projectId: project.id, ...input }));
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
    return toSprint(await sprints.update(s.id, changes));
  }

  async function start(actor: Actor, projectKey: string, sprintId: string): Promise<Sprint> {
    const s = await sprintIn(actor, projectKey, sprintId);
    const result = await sprints.start(s.id, now());
    if (result === 'not_planned') throw conflict(s.status === 'active' ? 'This sprint is already active.' : 'Only a planned sprint can be started.');
    if (result === 'another_active') throw conflict('Another sprint is already active in this project. Complete it first.');
    return toSprint(result);
  }

  async function complete(actor: Actor, projectKey: string, sprintId: string): Promise<Sprint> {
    const s = await sprintIn(actor, projectKey, sprintId);
    const result = await sprints.complete(s.id, now());
    if (result === 'not_active') throw conflict('Only the active sprint can be completed.');
    return toSprint(result);
  }

  async function remove(actor: Actor, projectKey: string, sprintId: string): Promise<void> {
    const s = await sprintIn(actor, projectKey, sprintId);
    if (!(await sprints.deletePlanned(s.id))) throw conflict('Only a planned sprint can be deleted.');
  }

  return { list, create, update, start, complete, remove };
}

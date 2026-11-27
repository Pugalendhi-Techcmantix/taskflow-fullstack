import { ERROR_CODES, PROJECT_CHANGE_FIELDS, roleSummaryOf, type CreateProjectInput, type Project, type UpdateProjectInput } from '@taskflow/core';
import { AppError, conflict, notFoundError } from '../../http/errors';
import type { Repositories } from '../../repositories';
import { isAdmin, type Actor } from '../access/actor';
import type { ActivityRecorder } from '../activity/activity.service';
import { ProjectKeyTakenError, type ProjectChanges, type ProjectRecord } from './projects.repository';

export const toProject = (p: ProjectRecord, viewerId: string): Project => ({
  id: p.id,
  key: p.key,
  name: p.name,
  description: p.description,
  color: p.color,
  members: p.members.map((m) => ({
    id: m.userId,
    name: m.name,
    email: m.email,
    role: roleSummaryOf(m.roleId),
    addedAt: m.addedAt.toISOString(),
  })),
  isMember: p.members.some((m) => m.userId === viewerId),
  activeSprint: p.activeSprint,
  taskCounts: p.taskCounts,
  createdAt: p.createdAt.toISOString(),
});

const notFound = () => notFoundError('Project not found');
const keyTaken = () => conflict('This key is already used by another project', { key: 'This key is already used by another project' });

export type ProjectsService = ReturnType<typeof createProjectsService>;

export function createProjectsService(repos: Pick<Repositories, 'projects'>, activity: ActivityRecorder) {
  const { projects } = repos;
  const ref = (p: { key: string; name: string }) => ({ key: p.key, name: p.name });

  /** Members and Admins can see a project; for everyone else it does not exist (404, not 403). */
  const canSee = (actor: Actor, p: ProjectRecord) => isAdmin(actor) || p.members.some((m) => m.userId === actor.user.id);

  async function visible(actor: Actor, key: string): Promise<ProjectRecord> {
    const p = await projects.findByKey(key);
    if (!p || !canSee(actor, p)) throw notFound();
    return p;
  }

  async function list(actor: Actor): Promise<Project[]> {
    return (await projects.listVisible(actor.user.id, isAdmin(actor))).map((p) => toProject(p, actor.user.id));
  }

  async function get(actor: Actor, key: string): Promise<Project> {
    return toProject(await visible(actor, key), actor.user.id);
  }

  async function isKeyAvailable(key: string): Promise<boolean> {
    return !(await projects.keyExists(key));
  }

  async function create(actor: Actor, input: CreateProjectInput): Promise<Project> {
    try {
      const p = await projects.create({ ...input, createdById: actor.user.id });
      await activity.record({ actorId: actor.user.id, projectId: p.id, event: { action: 'project.created', project: ref(p) } });
      return toProject(p, actor.user.id);
    } catch (err) {
      if (err instanceof ProjectKeyTakenError) throw keyTaken();
      throw err;
    }
  }

  async function update(actor: Actor, key: string, input: UpdateProjectInput): Promise<Project> {
    const p = await visible(actor, key);
    const changes: ProjectChanges = {};
    if (input.name !== undefined) changes.name = input.name;
    if (input.description !== undefined) changes.description = input.description;
    if (input.color !== undefined) changes.color = input.color;
    const updated = await projects.update(p.id, changes);
    const fields = PROJECT_CHANGE_FIELDS.filter((f) => changes[f] !== undefined && changes[f] !== p[f]);
    if (fields.length) await activity.record({ actorId: actor.user.id, projectId: p.id, event: { action: 'project.updated', project: ref(updated), fields } });
    return toProject(updated, actor.user.id);
  }

  /** Recorded without a project link (the project is gone), so only Admins see it. */
  async function remove(actor: Actor, key: string): Promise<void> {
    const p = await visible(actor, key);
    await projects.delete(p.id);
    await activity.record({ actorId: actor.user.id, event: { action: 'project.deleted', project: ref(p) } });
  }

  async function addMember(actor: Actor, key: string, userId: string): Promise<Project> {
    const p = await visible(actor, key);
    const result = await projects.addMember(p.id, userId);
    if (result === 'already_member') throw conflict('Already a member of this project');
    if (result === 'no_such_user') {
      throw new AppError(400, ERROR_CODES.validation, 'That person is not a TaskFlow member', { userId: 'That person is not a TaskFlow member' });
    }
    const updated = await visible(actor, key);
    const member = updated.members.find((m) => m.userId === userId)?.name ?? 'Unknown';
    await activity.record({ actorId: actor.user.id, projectId: p.id, event: { action: 'project.member_added', project: ref(p), member }, refs: { memberId: userId } });
    return toProject(updated, actor.user.id);
  }

  /** Removing yourself is allowed; as a non-Admin you then lose access to the project. */
  async function removeMember(actor: Actor, key: string, userId: string): Promise<void> {
    const p = await visible(actor, key);
    if (!(await projects.removeMember(p.id, userId))) throw notFoundError('That person is not a member of this project');
    const member = p.members.find((m) => m.userId === userId)?.name ?? 'Unknown';
    await activity.record({ actorId: actor.user.id, projectId: p.id, event: { action: 'project.member_removed', project: ref(p), member }, refs: { memberId: userId } });
  }

  return { list, get, isKeyAvailable, create, update, remove, addMember, removeMember, visibleProject: visible };
}

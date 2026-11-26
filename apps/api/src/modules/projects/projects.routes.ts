import { Router } from 'express';
import { addProjectMemberInput, createProjectInput, projectKeySchema, updateProjectInput } from '@taskflow/core';
import { z } from 'zod';
import { parse } from '../../http/errors';
import type { Guards } from '../access/actor';
import type { ProjectsService } from './projects.service';

const keyParam = z.object({ key: projectKeySchema });
const memberParams = z.object({ key: projectKeySchema, userId: z.uuid('Invalid member id') });
const keyQuery = z.object({ key: projectKeySchema });

/** /api/projects — visible to members and Admins; changes need project permissions. */
export function createProjectsRouter(projects: ProjectsService, { signedIn, requirePermission, actorOf }: Guards): Router {
  const router = Router();
  router.use(signedIn);

  router.get('/', async (req, res) => {
    res.json({ projects: await projects.list(await actorOf(req)) });
  });

  // Before "/:key" so "key-available" is not read as a project key.
  router.get('/key-available', requirePermission('project:create'), async (req, res) => {
    const { key } = parse(keyQuery, req.query);
    res.json({ key, available: await projects.isKeyAvailable(key) });
  });

  router.post('/', requirePermission('project:create'), async (req, res) => {
    const input = parse(createProjectInput, req.body);
    res.status(201).json({ project: await projects.create(await actorOf(req), input) });
  });

  router.get('/:key', async (req, res) => {
    const { key } = parse(keyParam, req.params);
    res.json({ project: await projects.get(await actorOf(req), key) });
  });

  router.patch('/:key', requirePermission('project:update'), async (req, res) => {
    const { key } = parse(keyParam, req.params);
    const input = parse(updateProjectInput, req.body);
    res.json({ project: await projects.update(await actorOf(req), key, input) });
  });

  router.delete('/:key', requirePermission('project:delete'), async (req, res) => {
    const { key } = parse(keyParam, req.params);
    await projects.remove(await actorOf(req), key);
    res.status(204).end();
  });

  router.post('/:key/members', requirePermission('project:update'), async (req, res) => {
    const { key } = parse(keyParam, req.params);
    const { userId } = parse(addProjectMemberInput, req.body);
    res.status(201).json({ project: await projects.addMember(await actorOf(req), key, userId) });
  });

  router.delete('/:key/members/:userId', requirePermission('project:update'), async (req, res) => {
    const { key, userId } = parse(memberParams, req.params);
    await projects.removeMember(await actorOf(req), key, userId);
    res.status(204).end();
  });

  return router;
}

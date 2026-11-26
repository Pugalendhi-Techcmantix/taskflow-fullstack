import { Router } from 'express';
import { completeSprintInput, createSprintInput, projectKeySchema, updateSprintInput } from '@taskflow/core';
import { z } from 'zod';
import { parse } from '../../http/errors';
import type { Guards } from '../access/actor';
import type { SprintsService } from './sprints.service';

const keyParam = z.object({ key: projectKeySchema });
const sprintParams = z.object({ key: projectKeySchema, id: z.uuid('Invalid sprint id') });

/** /api/projects/:key/sprints — reading follows project visibility; every change needs sprint:manage. */
export function createSprintsRouter(sprints: SprintsService, { signedIn, requirePermission, actorOf }: Guards): Router {
  const router = Router({ mergeParams: true });
  router.use(signedIn);
  const manage = requirePermission('sprint:manage');

  router.get('/', async (req, res) => {
    const { key } = parse(keyParam, req.params);
    res.json({ sprints: await sprints.list(await actorOf(req), key) });
  });

  router.post('/', manage, async (req, res) => {
    const { key } = parse(keyParam, req.params);
    const input = parse(createSprintInput, req.body);
    res.status(201).json({ sprint: await sprints.create(await actorOf(req), key, input) });
  });

  router.patch('/:id', manage, async (req, res) => {
    const { key, id } = parse(sprintParams, req.params);
    const input = parse(updateSprintInput, req.body);
    res.json({ sprint: await sprints.update(await actorOf(req), key, id, input) });
  });

  router.post('/:id/start', manage, async (req, res) => {
    const { key, id } = parse(sprintParams, req.params);
    res.json({ sprint: await sprints.start(await actorOf(req), key, id) });
  });

  router.post('/:id/complete', manage, async (req, res) => {
    const { key, id } = parse(sprintParams, req.params);
    const input = parse(completeSprintInput, req.body ?? {});
    res.json(await sprints.complete(await actorOf(req), key, id, input));
  });

  router.delete('/:id', manage, async (req, res) => {
    const { key, id } = parse(sprintParams, req.params);
    await sprints.remove(await actorOf(req), key, id);
    res.status(204).end();
  });

  return router;
}

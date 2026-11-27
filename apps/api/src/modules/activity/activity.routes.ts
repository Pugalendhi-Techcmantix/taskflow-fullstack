import { Router } from 'express';
import { activityQuery, projectKeySchema } from '@taskflow/core';
import { z } from 'zod';
import { parse } from '../../http/errors';
import type { Guards } from '../access/actor';
import type { ActivityService } from './activity.service';

/** GET /api/activity — the workspace timeline. Any signed-in user; entries are limited to what they may see. */
export function createActivityRouter(service: ActivityService, { signedIn, actorOf }: Guards): Router {
  const router = Router();
  router.use(signedIn);
  router.get('/', async (req, res) => {
    const query = parse(activityQuery, req.query);
    res.json(await service.list(await actorOf(req), query));
  });
  return router;
}

const taskParams = z.object({ key: projectKeySchema, number: z.coerce.number().int().positive('Invalid task number') });

/** GET /api/projects/:key/tasks/:number/activity — one task's history (follows project visibility). */
export function createTaskHistoryRouter(service: ActivityService, { signedIn, actorOf }: Guards): Router {
  const router = Router({ mergeParams: true });
  router.use(signedIn);
  router.get('/', async (req, res) => {
    const { key, number } = parse(taskParams, req.params);
    res.json({ entries: await service.taskHistory(await actorOf(req), key, number) });
  });
  return router;
}

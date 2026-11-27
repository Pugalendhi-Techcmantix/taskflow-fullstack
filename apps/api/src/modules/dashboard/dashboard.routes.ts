import { Router } from 'express';
import { projectKeySchema } from '@taskflow/core';
import { z } from 'zod';
import { parse } from '../../http/errors';
import type { Guards } from '../access/actor';
import type { DashboardService } from './dashboard.service';

const keyParam = z.object({ key: projectKeySchema });

/** GET /api/projects/:key/dashboard — reading follows project visibility (non-members get 404). */
export function createDashboardRouter(service: DashboardService, { signedIn, actorOf }: Guards): Router {
  const router = Router({ mergeParams: true });
  router.use(signedIn);
  router.get('/', async (req, res) => {
    const { key } = parse(keyParam, req.params);
    res.json(await service.get(await actorOf(req), key));
  });
  return router;
}

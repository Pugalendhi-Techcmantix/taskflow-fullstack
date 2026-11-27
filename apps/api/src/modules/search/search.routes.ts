import { Router } from 'express';
import { searchQuery } from '@taskflow/core';
import { parse } from '../../http/errors';
import type { Guards } from '../access/actor';
import type { SearchService } from './search.service';

/** GET /api/search?q=… — any signed-in user; results only come from projects they can see. */
export function createSearchRouter(service: SearchService, { signedIn, actorOf }: Guards): Router {
  const router = Router();
  router.use(signedIn);
  router.get('/', async (req, res) => {
    const { q } = parse(searchQuery, req.query);
    res.json(await service.search(await actorOf(req), q));
  });
  return router;
}

import { Router } from 'express';
import { notificationsQuery } from '@taskflow/core';
import { z } from 'zod';
import { parse } from '../../http/errors';
import type { Guards } from '../access/actor';
import type { NotificationService } from './notifications.service';

const idParam = z.object({ id: z.uuid('Invalid notification id') });

/** /api/notifications — always the signed-in user's own; someone else's id is a 404. */
export function createNotificationsRouter(service: NotificationService, { signedIn, actorOf }: Guards): Router {
  const router = Router();
  router.use(signedIn);

  router.get('/', async (req, res) => {
    const { cursor } = parse(notificationsQuery, req.query);
    res.json(await service.list(await actorOf(req), cursor));
  });

  router.post('/read-all', async (req, res) => {
    res.json({ unread: await service.markAllRead(await actorOf(req)) });
  });

  router.post('/:id/read', async (req, res) => {
    const { id } = parse(idParam, req.params);
    res.json({ unread: await service.markRead(await actorOf(req), id) });
  });

  return router;
}

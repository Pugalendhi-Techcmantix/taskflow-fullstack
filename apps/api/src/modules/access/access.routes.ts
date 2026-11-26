import { Router } from 'express';
import {
  changeRoleInput,
  createInviteInput,
  permissionKeySchema,
  roleIdSchema,
  setPermissionInput,
  type MembersResponse,
} from '@taskflow/core';
import { z } from 'zod';
import { parse } from '../../http/errors';
import { toPublicUser } from '../auth/auth.service';
import { createRequireAuth, currentUserId } from '../auth/require-auth';
import type { AccessService } from './access.service';
import { createPermissionGuard } from './require-permission';

const idParam = z.object({ id: z.uuid('Invalid id') });

/** /api/roles, /api/members, /api/invites — each route needs a signed-in user; changes also need a permission. */
export function createAccessRouter(access: AccessService, verifyAccessToken: (token: string) => string): Router {
  const router = Router();
  const requirePermission = createPermissionGuard(access);
  const signedIn = createRequireAuth(verifyAccessToken);

  /* ---------- roles & permission matrix ---------- */

  router.get('/roles', signedIn, async (_req, res) => {
    res.json(await access.listRoles());
  });

  router.put('/roles/:roleId/permissions/:permissionKey', signedIn, requirePermission('role:manage'), async (req, res) => {
    const { roleId, permissionKey } = parse(z.object({ roleId: roleIdSchema, permissionKey: permissionKeySchema }), req.params);
    const { granted } = parse(setPermissionInput, req.body);
    res.json({ role: await access.setPermission(roleId, permissionKey, granted) });
  });

  /* ---------- members ---------- */

  router.get('/members', signedIn, async (_req, res) => {
    const body: MembersResponse = { members: (await access.listMembers()).map(toPublicUser) };
    res.json(body);
  });

  router.patch('/members/:id/role', signedIn, requirePermission('user:manage'), async (req, res) => {
    const { id } = parse(idParam, req.params);
    const { roleId } = parse(changeRoleInput, req.body);
    res.json({ member: toPublicUser(await access.changeRole(currentUserId(req), id, roleId)) });
  });

  /* ---------- invites ---------- */

  router.get('/invites', signedIn, requirePermission('user:manage'), async (_req, res) => {
    res.json({ invites: await access.listInvites() });
  });

  router.post('/invites', signedIn, requirePermission('user:manage'), async (req, res) => {
    const input = parse(createInviteInput, req.body);
    res.status(201).json({ invite: await access.createInvite(currentUserId(req), input) });
  });

  router.post('/invites/:id/resend', signedIn, requirePermission('user:manage'), async (req, res) => {
    const { id } = parse(idParam, req.params);
    res.json({ invite: await access.resendInvite(id) });
  });

  router.delete('/invites/:id', signedIn, requirePermission('user:manage'), async (req, res) => {
    const { id } = parse(idParam, req.params);
    await access.revokeInvite(id);
    res.status(204).end();
  });

  return router;
}

import type { RequestHandler } from 'express';
import { PERMISSION_LABELS, type PermissionKey } from '@taskflow/core';
import { forbidden } from '../../http/errors';
import { currentUserId } from '../auth/require-auth';
import type { AccessService } from './access.service';

/**
 * `requirePermission('task:move')` — use after requireAuth. Checks the database on every request,
 * so a role or permission change takes effect immediately, even for users who are already signed in.
 */
export function createPermissionGuard(access: Pick<AccessService, 'userWithPermissions'>) {
  return (permission: PermissionKey): RequestHandler =>
    async (req, _res, next) => {
      const { permissions } = await access.userWithPermissions(currentUserId(req));
      if (!permissions.includes(permission)) {
        throw forbidden(`Your role doesn't allow this: ${PERMISSION_LABELS[permission].toLowerCase()}.`);
      }
      next();
    };
}

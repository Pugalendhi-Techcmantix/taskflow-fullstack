import type { Request, RequestHandler } from 'express';
import { ADMIN_ROLE, PERMISSION_LABELS, type PermissionKey } from '@taskflow/core';
import { forbidden } from '../../http/errors';
import type { UserRecord } from '../auth/auth.repository';
import { currentUserId } from '../auth/require-auth';
import type { AccessService } from './access.service';

/** The signed-in user for this request, with what their role may do. */
export type Actor = { user: UserRecord; permissions: PermissionKey[] };

export const isAdmin = (actor: Actor) => actor.user.roleId === ADMIN_ROLE;

export type ActorOf = (req: Request) => Promise<Actor>;

/**
 * Loads the actor once per request (cached on the request), from the database — so a role or
 * permission change applies on the very next request, even for users who are already signed in.
 */
export function createActorLookup(access: Pick<AccessService, 'userWithPermissions'>): ActorOf {
  const cache = new WeakMap<Request, Promise<Actor>>();
  return (req) => {
    let actor = cache.get(req);
    if (!actor) {
      actor = access.userWithPermissions(currentUserId(req));
      cache.set(req, actor);
    }
    return actor;
  };
}

/** `requirePermission('task:move')` — use after requireAuth. */
export type RequirePermission = (permission: PermissionKey) => RequestHandler;

export function createPermissionGuard(actorOf: ActorOf): RequirePermission {
  return (permission) => async (req, _res, next) => {
    const { permissions } = await actorOf(req);
    if (!permissions.includes(permission)) {
      throw forbidden(`Your role doesn't allow this: ${PERMISSION_LABELS[permission].toLowerCase()}.`);
    }
    next();
  };
}

/** Middleware shared by every protected router. */
export type Guards = { signedIn: RequestHandler; requirePermission: RequirePermission; actorOf: ActorOf };

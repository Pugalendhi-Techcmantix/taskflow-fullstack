import type { RequestHandler } from 'express';
import { unauthorized } from '../../http/errors';

declare module 'express-serve-static-core' {
  interface Request {
    /** Set by requireAuth. Present on every route that uses it. */
    userId?: string;
  }
}

/** Requires `Authorization: Bearer <access token>`. */
export function createRequireAuth(verifyAccessToken: (token: string) => string): RequestHandler {
  return (req, _res, next) => {
    const [scheme, token] = (req.get('authorization') ?? '').split(' ');
    if (scheme !== 'Bearer' || !token) throw unauthorized();
    req.userId = verifyAccessToken(token);
    next();
  };
}

/** Reads the id requireAuth stored; throws if a route forgot to use requireAuth. */
export function currentUserId(req: { userId?: string | undefined }): string {
  if (!req.userId) throw unauthorized();
  return req.userId;
}

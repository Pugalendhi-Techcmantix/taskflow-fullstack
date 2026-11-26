import { Router, type CookieOptions, type Response } from 'express';
import { acceptInviteInput, loginInput, registerInput, type AuthResponse, type SessionUser } from '@taskflow/core';
import { z } from 'zod';
import { AppError, parse, unauthorized } from '../../http/errors';
import { createRateLimiter } from '../../http/rate-limit';
import type { AccessService } from '../access/access.service';
import type { UserRecord } from './auth.repository';
import { toPublicUser, type AuthService } from './auth.service';
import { createRequireAuth, currentUserId } from './require-auth';

export const REFRESH_COOKIE = 'tf_refresh';

export type AuthRouterOptions = {
  /** true in production (HTTPS only). */
  secureCookies: boolean;
  /** Turn off only in automated tests. */
  rateLimit: boolean;
};

const readRefreshCookie = (cookies: unknown): string | undefined => {
  if (typeof cookies !== 'object' || cookies === null || !(REFRESH_COOKIE in cookies)) return undefined;
  const value: unknown = Reflect.get(cookies, REFRESH_COOKIE);
  return typeof value === 'string' && value.length > 0 ? value : undefined;
};

const tokenParam = z.object({ token: z.string().min(20).max(200) });

export function createAuthRouter(auth: AuthService, access: Pick<AccessService, 'permissionsOf' | 'previewInvite' | 'acceptInvite'>, options: AuthRouterOptions): Router {
  const cookieOptions: CookieOptions = {
    httpOnly: true, // JavaScript in the page can never read it
    secure: options.secureCookies,
    sameSite: 'strict', // never sent on cross-site requests (CSRF protection)
    path: '/api/auth', // only sent to the auth endpoints
    maxAge: auth.refreshTokenTtlDays * 86_400_000,
  };
  const limiter = createRateLimiter(options.rateLimit);
  const requireAuth = createRequireAuth(auth.verifyAccessToken);

  async function sessionUser(user: UserRecord): Promise<SessionUser> {
    return { user: toPublicUser(user), permissions: await access.permissionsOf(user.roleId) };
  }

  async function sendSession(res: Response, user: UserRecord, refreshToken: string, status = 200) {
    const body: AuthResponse = { accessToken: auth.signAccessToken(user.id), ...(await sessionUser(user)) };
    res.cookie(REFRESH_COOKIE, refreshToken, cookieOptions);
    res.status(status).json(body);
  }

  const router = Router();

  router.post('/register', limiter, async (req, res) => {
    const user = await auth.register(parse(registerInput, req.body));
    await sendSession(res, user, await auth.issueRefreshToken(user.id), 201);
  });

  router.post('/login', limiter, async (req, res) => {
    const user = await auth.login(parse(loginInput, req.body));
    await sendSession(res, user, await auth.issueRefreshToken(user.id));
  });

  router.post('/refresh', async (req, res) => {
    const token = readRefreshCookie(req.cookies);
    try {
      if (!token) throw unauthorized('Please sign in');
      const { userId, refreshToken } = await auth.rotateRefreshToken(token);
      await sendSession(res, await auth.getUser(userId), refreshToken);
    } catch (err) {
      // Only an invalid session clears the cookie; a database hiccup (500) must not log the user out.
      if (err instanceof AppError && err.status === 401) res.clearCookie(REFRESH_COOKIE, cookieOptions);
      throw err;
    }
  });

  router.post('/logout', async (req, res) => {
    const token = readRefreshCookie(req.cookies);
    if (token) await auth.revokeRefreshToken(token);
    res.clearCookie(REFRESH_COOKIE, cookieOptions);
    res.status(204).end();
  });

  router.get('/me', requireAuth, async (req, res) => {
    res.json(await sessionUser(await auth.getUser(currentUserId(req))));
  });

  /* ---------- invite links (public: the person has no account yet) ---------- */

  router.get('/invites/:token', limiter, async (req, res) => {
    const { token } = parse(tokenParam, req.params);
    res.json(await access.previewInvite(token));
  });

  router.post('/invites/:token/accept', limiter, async (req, res) => {
    const { token } = parse(tokenParam, req.params);
    const user = await access.acceptInvite(token, parse(acceptInviteInput, req.body));
    await sendSession(res, user, await auth.issueRefreshToken(user.id), 201);
  });

  return router;
}

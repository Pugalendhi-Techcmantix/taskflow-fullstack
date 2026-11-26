import { Router, type CookieOptions, type RequestHandler, type Response } from 'express';
import rateLimit from 'express-rate-limit';
import { ERROR_CODES, loginInput, registerInput, type AuthResponse } from '@taskflow/core';
import { AppError, parse, unauthorized } from '../../http/errors';
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

export function createAuthRouter(auth: AuthService, options: AuthRouterOptions): Router {
  const cookieOptions: CookieOptions = {
    httpOnly: true, // JavaScript in the page can never read it
    secure: options.secureCookies,
    sameSite: 'strict', // never sent on cross-site requests (CSRF protection)
    path: '/api/auth', // only sent to the auth endpoints
    maxAge: auth.refreshTokenTtlDays * 86_400_000,
  };

  /** Slows down password guessing: 20 attempts per 15 minutes per IP on login and register. */
  const authLimiter: RequestHandler = options.rateLimit
    ? rateLimit({
        windowMs: 15 * 60_000,
        limit: 20,
        standardHeaders: 'draft-8',
        legacyHeaders: false,
        message: { error: { code: ERROR_CODES.rateLimited, message: 'Too many attempts. Wait a few minutes and try again.' } },
      })
    : (_req, _res, next) => next();

  const requireAuth = createRequireAuth(auth.verifyAccessToken);

  function sendSession(res: Response, user: UserRecord, refreshToken: string, status = 200) {
    res.cookie(REFRESH_COOKIE, refreshToken, cookieOptions);
    const body: AuthResponse = { accessToken: auth.signAccessToken(user.id), user: toPublicUser(user) };
    res.status(status).json(body);
  }

  const router = Router();

  router.post('/register', authLimiter, async (req, res) => {
    const user = await auth.register(parse(registerInput, req.body));
    sendSession(res, user, await auth.issueRefreshToken(user.id), 201);
  });

  router.post('/login', authLimiter, async (req, res) => {
    const user = await auth.login(parse(loginInput, req.body));
    sendSession(res, user, await auth.issueRefreshToken(user.id));
  });

  router.post('/refresh', async (req, res) => {
    const token = readRefreshCookie(req.cookies);
    try {
      if (!token) throw unauthorized('Please sign in');
      const { userId, refreshToken } = await auth.rotateRefreshToken(token);
      sendSession(res, await auth.getUser(userId), refreshToken);
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
    res.json({ user: toPublicUser(await auth.getUser(currentUserId(req))) });
  });

  return router;
}

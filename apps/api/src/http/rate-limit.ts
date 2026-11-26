import type { RequestHandler } from 'express';
import rateLimit from 'express-rate-limit';
import { ERROR_CODES } from '@taskflow/core';

/** Slows down guessing: 20 attempts per 15 minutes per IP. A no-op when disabled (automated tests). */
export function createRateLimiter(enabled: boolean): RequestHandler {
  if (!enabled) return (_req, _res, next) => next();
  return rateLimit({
    windowMs: 15 * 60_000,
    limit: 20,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    message: { error: { code: ERROR_CODES.rateLimited, message: 'Too many attempts. Wait a few minutes and try again.' } },
  });
}

import cookieParser from 'cookie-parser';
import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import { errorHandler, notFound } from './http/errors';
import { createAccessRouter } from './modules/access/access.routes';
import type { AccessService } from './modules/access/access.service';
import { createAuthRouter } from './modules/auth/auth.routes';
import type { AuthService } from './modules/auth/auth.service';

/** Everything the HTTP layer needs. server.ts wires real Prisma services; tests wire in-memory ones. */
export type AppDeps = {
  auth: AuthService;
  access: AccessService;
  /** Resolves when the database answers; rejects otherwise. */
  checkDatabase: () => Promise<void>;
  corsOrigins: string[];
  secureCookies: boolean;
  rateLimit: boolean;
};

export function createApp(deps: AppDeps) {
  const app = express();
  app.disable('x-powered-by');
  app.use(helmet());
  app.use(cors({ origin: deps.corsOrigins, credentials: true }));
  app.use(express.json({ limit: '100kb' }));
  app.use(cookieParser());

  app.get('/api/health', async (_req, res) => {
    try {
      await deps.checkDatabase();
      res.json({ status: 'ok', database: 'up' });
    } catch {
      res.status(503).json({ status: 'degraded', database: 'down' });
    }
  });

  app.use('/api/auth', createAuthRouter(deps.auth, deps.access, { secureCookies: deps.secureCookies, rateLimit: deps.rateLimit }));
  app.use('/api', createAccessRouter(deps.access, deps.auth.verifyAccessToken));

  app.use(notFound);
  app.use(errorHandler);
  return app;
}

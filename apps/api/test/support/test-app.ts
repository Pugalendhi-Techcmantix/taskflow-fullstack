import { createApp } from '../../src/app';
import { createAuthService } from '../../src/modules/auth/auth.service';
import { createMemoryAuthRepositories } from './memory-auth.repository';

/** A full app wired to in-memory dummy data and a clock the test controls. No database needed. */
export function createTestApp() {
  let current = new Date('2026-01-15T10:00:00Z');
  const clock = {
    now: () => new Date(current),
    advance: (ms: number) => {
      current = new Date(current.getTime() + ms);
    },
  };

  const store = createMemoryAuthRepositories(clock.now);
  const auth = createAuthService(
    store.repos,
    { jwtSecret: 'test-secret-that-is-at-least-32-characters-long', accessTokenTtlSeconds: 900, refreshTokenTtlDays: 14, bcryptRounds: 4 },
    clock.now,
  );
  const app = createApp({
    auth,
    checkDatabase: async () => {},
    corsOrigins: ['http://localhost:5200'],
    secureCookies: false,
    rateLimit: false,
  });

  return { app, store, clock };
}

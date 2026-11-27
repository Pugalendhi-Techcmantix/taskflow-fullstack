import request from 'supertest';
import { authResponse, type RoleId } from '@taskflow/core';
import { createApp } from '../../src/app';
import type { EmailMessage, EmailSender } from '../../src/email/email-sender';
import { createAccessService } from '../../src/modules/access/access.service';
import { createActivityRecorder, createActivityService } from '../../src/modules/activity/activity.service';
import { createAuthService } from '../../src/modules/auth/auth.service';
import { createDashboardService } from '../../src/modules/dashboard/dashboard.service';
import { createProjectsService } from '../../src/modules/projects/projects.service';
import { createSearchService } from '../../src/modules/search/search.service';
import { createSprintsService } from '../../src/modules/sprints/sprints.service';
import { createTasksService } from '../../src/modules/tasks/tasks.service';
import { createMemoryRepositories } from './memory-repositories';

/** A full app wired to in-memory dummy data, a fake mailbox and a clock the test controls. No database needed. */
export function createTestApp() {
  let current = new Date('2026-01-15T10:00:00Z');
  const clock = {
    now: () => new Date(current),
    advance: (ms: number) => {
      current = new Date(current.getTime() + ms);
    },
  };

  const outbox: EmailMessage[] = [];
  const mail = { failNext: false };
  const email: EmailSender = {
    async send(message) {
      if (mail.failNext) {
        mail.failNext = false;
        throw new Error('SMTP down');
      }
      outbox.push(message);
    },
  };

  const store = createMemoryRepositories(clock.now);
  const activity = createActivityRecorder(store.repos, clock.now);
  const auth = createAuthService(
    store.repos,
    { jwtSecret: 'test-secret-that-is-at-least-32-characters-long', accessTokenTtlSeconds: 900, refreshTokenTtlDays: 14, bcryptRounds: 4 },
    activity,
    clock.now,
  );
  const access = createAccessService({
    repos: store.repos,
    email,
    hashPassword: auth.hashPassword,
    config: { appUrl: 'http://localhost:5200', inviteTtlDays: 7 },
    activity,
    now: clock.now,
  });
  const projects = createProjectsService(store.repos, activity);
  const app = createApp({
    auth,
    access,
    projects,
    sprints: createSprintsService({ repos: store.repos, projects, activity, now: clock.now }),
    tasks: createTasksService({ repos: store.repos, projects, activity, now: clock.now }),
    search: createSearchService(store.repos),
    activity: createActivityService({ repos: store.repos, projects }),
    dashboard: createDashboardService({ repos: store.repos, projects, now: clock.now }),
    checkDatabase: async () => {},
    corsOrigins: ['http://localhost:5200'],
    secureCookies: false,
    rateLimit: false,
  });

  /** Registers a user through the API, optionally moves them to `role`, and returns an auth header. */
  async function signUp(name: string, role?: RoleId) {
    const email = `${name.toLowerCase().replace(/\s+/g, '.')}@example.com`;
    const res = await request(app).post('/api/auth/register').send({ name, email, password: 'password-123' });
    const session = authResponse.parse(res.body);
    if (role) {
      const row = store.users.find((u) => u.id === session.user.id);
      if (row) row.roleId = role;
    }
    return { id: session.user.id, email, auth: { Authorization: `Bearer ${session.accessToken}` } };
  }

  /** The invite token from the most recent email in the outbox. */
  function lastInviteToken(): string {
    const match = outbox.at(-1)?.text.match(/\/invite\/([A-Za-z0-9_-]+)/);
    if (!match?.[1]) throw new Error('no invite link in the outbox');
    return match[1];
  }

  return { app, store, clock, outbox, mail, signUp, lastInviteToken };
}

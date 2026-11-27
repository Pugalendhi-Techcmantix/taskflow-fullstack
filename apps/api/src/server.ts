import { createApp } from './app';
import { prisma } from './db';
import { createConsoleEmailSender, createSmtpEmailSender } from './email/email-sender';
import { env, isProduction } from './env';
import { createAccessService } from './modules/access/access.service';
import { createAuthService } from './modules/auth/auth.service';
import { createProjectsService } from './modules/projects/projects.service';
import { createSearchService } from './modules/search/search.service';
import { createSprintsService } from './modules/sprints/sprints.service';
import { createTasksService } from './modules/tasks/tasks.service';
import { createPrismaRepositories } from './prisma-repositories';

/** Composition root: the only place that connects the app to the real database, email and environment. */
const repos = createPrismaRepositories(prisma);

const auth = createAuthService(repos, {
  jwtSecret: env.JWT_ACCESS_SECRET,
  accessTokenTtlSeconds: env.ACCESS_TOKEN_TTL_SECONDS,
  refreshTokenTtlDays: env.REFRESH_TOKEN_TTL_DAYS,
  bcryptRounds: env.BCRYPT_ROUNDS,
});

const smtp = env.SMTP_HOST
  ? createSmtpEmailSender({
      host: env.SMTP_HOST,
      port: env.SMTP_PORT,
      secure: env.SMTP_SECURE,
      user: env.SMTP_USER,
      pass: env.SMTP_PASS,
      from: env.MAIL_FROM,
    })
  : null;
const email = smtp ?? createConsoleEmailSender();

const access = createAccessService({
  repos,
  email,
  hashPassword: auth.hashPassword,
  config: { appUrl: env.APP_URL, inviteTtlDays: env.INVITE_TTL_DAYS },
});

const projects = createProjectsService(repos);
const sprints = createSprintsService({ repos, projects });
const tasks = createTasksService({ repos, projects });
const search = createSearchService(repos);

const app = createApp({
  auth,
  access,
  projects,
  sprints,
  tasks,
  search,
  checkDatabase: async () => {
    await prisma.$queryRaw`SELECT 1`;
  },
  corsOrigins: env.CORS_ORIGIN.split(',').map((o) => o.trim()),
  secureCookies: isProduction,
  rateLimit: true,
});

const server = app.listen(env.PORT, () => {
  console.log(`TaskFlow API listening on http://localhost:${env.PORT}`);
  if (!smtp) {
    console.log('Email: SMTP not configured — invite emails are printed here instead of sent.');
    return;
  }
  // Check the mail login at startup so a wrong password shows up now, not at the first invite.
  smtp.verify().then(
    () => console.log(`Email: SMTP ready (${env.SMTP_HOST}:${env.SMTP_PORT})`),
    (err: unknown) => console.error(`Email: SMTP login FAILED (${env.SMTP_HOST}) — ${err instanceof Error ? err.message : String(err)}`),
  );
});

function shutdown(signal: string) {
  console.log(`${signal} received, closing server…`);
  server.close(() => {
    void prisma.$disconnect().finally(() => process.exit(0));
  });
}
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

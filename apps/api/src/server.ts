import { createApp } from './app';
import { prisma } from './db';
import { env, isProduction } from './env';
import { createAuthService } from './modules/auth/auth.service';
import { createPrismaAuthRepositories } from './modules/auth/prisma-auth.repository';

/** Composition root: the only place that connects the app to the real database and environment. */
const auth = createAuthService(createPrismaAuthRepositories(prisma), {
  jwtSecret: env.JWT_ACCESS_SECRET,
  accessTokenTtlSeconds: env.ACCESS_TOKEN_TTL_SECONDS,
  refreshTokenTtlDays: env.REFRESH_TOKEN_TTL_DAYS,
  bcryptRounds: env.BCRYPT_ROUNDS,
});

const app = createApp({
  auth,
  checkDatabase: async () => {
    await prisma.$queryRaw`SELECT 1`;
  },
  corsOrigins: env.CORS_ORIGIN.split(',').map((o) => o.trim()),
  secureCookies: isProduction,
  rateLimit: true,
});

const server = app.listen(env.PORT, () => {
  console.log(`TaskFlow API listening on http://localhost:${env.PORT}`);
});

function shutdown(signal: string) {
  console.log(`${signal} received, closing server…`);
  server.close(() => {
    void prisma.$disconnect().finally(() => process.exit(0));
  });
}
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

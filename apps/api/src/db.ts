import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/client';
import { env } from './env';

/** One client (one connection pool) for the whole process. */
export const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: env.DATABASE_URL }),
});

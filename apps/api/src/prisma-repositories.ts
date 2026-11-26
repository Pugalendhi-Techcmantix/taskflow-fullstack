import type { PrismaClient } from '../generated/client';
import { createPrismaInviteRepository, createPrismaRoleRepository } from './modules/access/prisma-access.repository';
import { createPrismaRefreshTokenRepository, createPrismaUserRepository } from './modules/auth/prisma-auth.repository';
import { createPrismaProjectRepository } from './modules/projects/prisma-projects.repository';
import { createPrismaSprintRepository } from './modules/sprints/prisma-sprints.repository';
import { createPrismaTaskRepository } from './modules/tasks/prisma-tasks.repository';
import type { Repositories } from './repositories';

export function createPrismaRepositories(prisma: PrismaClient): Repositories {
  return {
    users: createPrismaUserRepository(prisma),
    refreshTokens: createPrismaRefreshTokenRepository(prisma),
    roles: createPrismaRoleRepository(prisma),
    invites: createPrismaInviteRepository(prisma),
    projects: createPrismaProjectRepository(prisma),
    sprints: createPrismaSprintRepository(prisma),
    tasks: createPrismaTaskRepository(prisma),
  };
}

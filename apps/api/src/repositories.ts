import type { InviteRepository, RoleRepository } from './modules/access/access.repository';
import type { RefreshTokenRepository, UserRepository } from './modules/auth/auth.repository';
import type { ProjectRepository } from './modules/projects/projects.repository';
import type { SprintRepository } from './modules/sprints/sprints.repository';

/** Every storage dependency of the API. Prisma in production, in-memory fakes in tests. */
export type Repositories = {
  users: UserRepository;
  refreshTokens: RefreshTokenRepository;
  roles: RoleRepository;
  invites: InviteRepository;
  projects: ProjectRepository;
  sprints: SprintRepository;
};

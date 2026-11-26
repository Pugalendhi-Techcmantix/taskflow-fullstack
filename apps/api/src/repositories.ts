import type { InviteRepository, RoleRepository } from './modules/access/access.repository';
import type { RefreshTokenRepository, UserRepository } from './modules/auth/auth.repository';

/** Every storage dependency of the API. Prisma in production, in-memory fakes in tests. */
export type Repositories = {
  users: UserRepository;
  refreshTokens: RefreshTokenRepository;
  roles: RoleRepository;
  invites: InviteRepository;
};

import type { InviteRepository, RoleRepository } from './modules/access/access.repository';
import type { ActivityRepository } from './modules/activity/activity.repository';
import type { RefreshTokenRepository, UserRepository } from './modules/auth/auth.repository';
import type { ProjectRepository } from './modules/projects/projects.repository';
import type { SearchRepository } from './modules/search/search.repository';
import type { SprintRepository } from './modules/sprints/sprints.repository';
import type { TaskRepository } from './modules/tasks/tasks.repository';

/** Every storage dependency of the API. Prisma in production, in-memory fakes in tests. */
export type Repositories = {
  users: UserRepository;
  refreshTokens: RefreshTokenRepository;
  roles: RoleRepository;
  invites: InviteRepository;
  projects: ProjectRepository;
  sprints: SprintRepository;
  tasks: TaskRepository;
  search: SearchRepository;
  activity: ActivityRepository;
};

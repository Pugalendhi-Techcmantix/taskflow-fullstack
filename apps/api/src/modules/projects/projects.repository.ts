import type { ProjectColor, RoleId } from '@taskflow/core';

export type ProjectMemberRecord = { userId: string; name: string; email: string; roleId: RoleId; addedAt: Date };

export type ProjectRecord = {
  id: string;
  key: string;
  name: string;
  description: string;
  color: ProjectColor;
  createdById: string | null;
  createdAt: Date;
  updatedAt: Date;
  /** Oldest first. */
  members: ProjectMemberRecord[];
  activeSprint: { id: string; name: string } | null;
};

export type NewProject = { key: string; name: string; description: string; color: ProjectColor; createdById: string };
export type ProjectChanges = Partial<Pick<ProjectRecord, 'name' | 'description' | 'color'>>;

/** Thrown by create when the key is already used. */
export class ProjectKeyTakenError extends Error {
  constructor() {
    super('Project key already used');
    this.name = 'ProjectKeyTakenError';
  }
}

export interface ProjectRepository {
  /** Projects the user is a member of — or every project when `all` (Admins). Oldest first. */
  listVisible(userId: string, all: boolean): Promise<ProjectRecord[]>;
  findByKey(key: string): Promise<ProjectRecord | null>;
  keyExists(key: string): Promise<boolean>;
  /** Creates the project with its creator as the first member. Throws ProjectKeyTakenError. */
  create(data: NewProject): Promise<ProjectRecord>;
  update(id: string, changes: ProjectChanges): Promise<ProjectRecord>;
  delete(id: string): Promise<void>;
  addMember(projectId: string, userId: string): Promise<'added' | 'already_member' | 'no_such_user'>;
  /** False if the user was not a member. */
  removeMember(projectId: string, userId: string): Promise<boolean>;
}

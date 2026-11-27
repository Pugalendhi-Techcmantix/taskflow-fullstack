import type { ProjectColor } from '@taskflow/core';
import type { TaskRecord } from '../tasks/tasks.repository';

/** Whose projects a search may look at: the user's own projects, or every project (`all`, for Admins). */
export type SearchScope = { userId: string; all: boolean };

export type ProjectHitRecord = { id: string; key: string; name: string; color: ProjectColor };

export interface SearchRepository {
  /**
   * Tasks whose key ("TF-107") or title contains `text`, ignoring case, in projects inside `scope`.
   * An exact key match comes first, then the most recently updated.
   */
  tasks(text: string, scope: SearchScope, limit: number): Promise<TaskRecord[]>;
  /** Projects whose name or key contains `text`, ignoring case, inside `scope`. By name. */
  projects(text: string, scope: SearchScope, limit: number): Promise<ProjectHitRecord[]>;
}

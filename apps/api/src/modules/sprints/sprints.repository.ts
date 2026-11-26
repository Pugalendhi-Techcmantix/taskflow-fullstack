import type { SprintStatus } from '@taskflow/core';

export type SprintRecord = {
  id: string;
  projectId: string;
  projectKey: string;
  name: string;
  goal: string;
  /** Calendar dates, "YYYY-MM-DD". */
  startDate: string;
  endDate: string;
  status: SprintStatus;
  startedAt: Date | null;
  completedAt: Date | null;
  createdAt: Date;
};

export type NewSprint = { projectId: string; name: string; goal: string; startDate: string; endDate: string };
export type SprintChanges = Partial<Pick<SprintRecord, 'name' | 'goal' | 'startDate' | 'endDate'>>;

export interface SprintRepository {
  listByProject(projectId: string): Promise<SprintRecord[]>;
  findById(id: string): Promise<SprintRecord | null>;
  create(data: NewSprint): Promise<SprintRecord>;
  update(id: string, changes: SprintChanges): Promise<SprintRecord>;
  /** planned → active, atomically. The database allows only one active sprint per project. */
  start(id: string, at: Date): Promise<SprintRecord | 'not_planned' | 'another_active'>;
  /** active → completed, atomically. */
  complete(id: string, at: Date): Promise<SprintRecord | 'not_active'>;
  /** Deletes the sprint only while it is still planned. */
  deletePlanned(id: string): Promise<boolean>;
}

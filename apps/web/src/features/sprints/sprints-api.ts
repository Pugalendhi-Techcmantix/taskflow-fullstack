import { sprint, sprintResponse, sprintsResponse, type CompleteSprintInput, type CreateSprintInput, type UpdateSprintInput } from '@taskflow/core';
import { z } from 'zod';
import { api } from '../../lib/http';

export const sprintKeys = { list: (projectKey: string) => ['projects', projectKey, 'sprints'] as const };

const base = (projectKey: string) => `/api/projects/${encodeURIComponent(projectKey)}/sprints`;

export const fetchSprints = (projectKey: string, signal?: AbortSignal) =>
  api(base(projectKey), { schema: sprintsResponse, ...(signal ? { signal } : {}) });
export const createSprint = (projectKey: string, input: CreateSprintInput) =>
  api(base(projectKey), { method: 'POST', body: input, schema: sprintResponse });
export const updateSprint = (projectKey: string, id: string, input: UpdateSprintInput) =>
  api(`${base(projectKey)}/${id}`, { method: 'PATCH', body: input, schema: sprintResponse });
export const startSprint = (projectKey: string, id: string) => api(`${base(projectKey)}/${id}/start`, { method: 'POST', schema: sprintResponse });
export const completeSprint = (projectKey: string, id: string, input: CompleteSprintInput) =>
  api(`${base(projectKey)}/${id}/complete`, { method: 'POST', body: input, schema: z.object({ sprint, movedTasks: z.number().int() }) });
export const deleteSprint = (projectKey: string, id: string) => api(`${base(projectKey)}/${id}`, { method: 'DELETE', schema: z.null() });

import { useQuery } from '@tanstack/react-query';
import {
  keyAvailability,
  projectResponse,
  projectsResponse,
  type CreateProjectInput,
  type UpdateProjectInput,
} from '@taskflow/core';
import { z } from 'zod';
import { api } from '../../lib/http';

export const projectKeys = {
  all: ['projects'] as const,
  detail: (key: string) => ['projects', key] as const,
  keyCheck: (key: string) => ['project-key-available', key] as const,
};

const withSignal = (signal?: AbortSignal) => (signal ? { signal } : {});

export const fetchProjects = (signal?: AbortSignal) => api('/api/projects', { schema: projectsResponse, ...withSignal(signal) });
export const fetchProject = (key: string, signal?: AbortSignal) =>
  api(`/api/projects/${encodeURIComponent(key)}`, { schema: projectResponse, ...withSignal(signal) });
export const checkKey = (key: string, signal?: AbortSignal) =>
  api(`/api/projects/key-available?key=${encodeURIComponent(key)}`, { schema: keyAvailability, ...withSignal(signal) });

export const createProject = (input: CreateProjectInput) => api('/api/projects', { method: 'POST', body: input, schema: projectResponse });
export const updateProject = (key: string, input: UpdateProjectInput) =>
  api(`/api/projects/${encodeURIComponent(key)}`, { method: 'PATCH', body: input, schema: projectResponse });
export const deleteProject = (key: string) => api(`/api/projects/${encodeURIComponent(key)}`, { method: 'DELETE', schema: z.null() });
export const addProjectMember = (key: string, userId: string) =>
  api(`/api/projects/${encodeURIComponent(key)}/members`, { method: 'POST', body: { userId }, schema: projectResponse });
export const removeProjectMember = (key: string, userId: string) =>
  api(`/api/projects/${encodeURIComponent(key)}/members/${userId}`, { method: 'DELETE', schema: z.null() });

/** All projects the signed-in user can see. Shared by the grid and the sidebar switcher. */
export const useProjects = () => useQuery({ queryKey: projectKeys.all, queryFn: ({ signal }) => fetchProjects(signal) });

/** Last project the user opened, so later pages (board, sprints, tasks) can default to it. */
const LAST_PROJECT = 'tf-project';
export function rememberProject(key: string) {
  try {
    localStorage.setItem(LAST_PROJECT, key);
  } catch {
    // storage blocked: not important
  }
}
export function lastProject(): string | null {
  try {
    return localStorage.getItem(LAST_PROJECT);
  } catch {
    return null;
  }
}

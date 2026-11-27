import type { QueryClient } from '@tanstack/react-query';
import {
  DEFAULT_PAGE_SIZE,
  taskPageResponse,
  taskResponse,
  tasksResponse,
  type CreateTaskInput,
  type TaskListQuery,
  type TaskSummary,
  type UpdateTaskInput,
} from '@taskflow/core';
import { z } from 'zod';
import { api } from '../../lib/http';

/**
 * Every task query of a project sits under `list`, so invalidating it refreshes the table pages,
 * the planning list (Sprints page), the board and open task dialogs together.
 */
export const taskKeys = {
  list: (projectKey: string) => ['projects', projectKey, 'tasks'] as const,
  pages: (projectKey: string) => ['projects', projectKey, 'tasks', 'page'] as const,
  page: (projectKey: string, query: TaskListQuery) => ['projects', projectKey, 'tasks', 'page', query] as const,
  planning: (projectKey: string) => ['projects', projectKey, 'tasks', 'planning'] as const,
  detail: (projectKey: string, number: number) => ['projects', projectKey, 'tasks', number] as const,
};

const base = (projectKey: string) => `/api/projects/${encodeURIComponent(projectKey)}/tasks`;
const withSignal = (signal?: AbortSignal) => (signal ? { signal } : {});

/** The query string for a page of the Tasks table. Defaults and empty filters are left out. */
export function taskQueryString(query: TaskListQuery): string {
  const params = new URLSearchParams();
  const put = (name: string, value: string | number | undefined, fallback?: string | number) => {
    if (value !== undefined && value !== '' && value !== fallback) params.set(name, String(value));
  };
  put('q', query.q);
  put('status', query.status);
  put('priority', query.priority);
  put('type', query.type);
  put('assignee', query.assignee);
  put('sprint', query.sprint);
  put('sort', query.sort, 'key');
  put('dir', query.dir, 'asc');
  put('page', query.page, 1);
  put('size', query.size, DEFAULT_PAGE_SIZE);
  const s = params.toString();
  return s ? `?${s}` : '';
}

/** One page of the Tasks table, filtered and sorted by the server. */
export const fetchTaskPage = (projectKey: string, query: TaskListQuery, signal?: AbortSignal) =>
  api(`${base(projectKey)}${taskQueryString(query)}`, { schema: taskPageResponse, ...withSignal(signal) });
/** Every task of the project (Sprints page: sprint lists and the backlog). */
export const fetchPlanning = (projectKey: string, signal?: AbortSignal) =>
  api(`/api/projects/${encodeURIComponent(projectKey)}/planning`, { schema: tasksResponse, ...withSignal(signal) });
export const fetchTask = (projectKey: string, number: number, signal?: AbortSignal) =>
  api(`${base(projectKey)}/${number}`, { schema: taskResponse, ...withSignal(signal) });
export const createTask = (projectKey: string, input: Partial<CreateTaskInput> & { title: string }) =>
  api(base(projectKey), { method: 'POST', body: input, schema: taskResponse });
export const updateTask = (projectKey: string, number: number, input: UpdateTaskInput) =>
  api(`${base(projectKey)}/${number}`, { method: 'PATCH', body: input, schema: taskResponse });
export const deleteTask = (projectKey: string, number: number) => api(`${base(projectKey)}/${number}`, { method: 'DELETE', schema: z.null() });

/**
 * Optimistic edit of every cached task list of a project (each table page and the planning list).
 * Returns a function that puts the lists back exactly as they were (rollback on error).
 */
export function patchTaskLists(qc: QueryClient, projectKey: string, update: (t: TaskSummary) => TaskSummary): () => void {
  const snapshots = [
    ...qc.getQueriesData<{ tasks: TaskSummary[] }>({ queryKey: taskKeys.pages(projectKey) }),
    ...qc.getQueriesData<{ tasks: TaskSummary[] }>({ queryKey: taskKeys.planning(projectKey) }),
  ];
  for (const [key, data] of snapshots) {
    if (data) qc.setQueryData(key, { ...data, tasks: data.tasks.map(update) });
  }
  return () => {
    for (const [key, data] of snapshots) qc.setQueryData(key, data);
  };
}

/* ---------- subtasks and comments: each returns the updated task ---------- */

export const addSubtask = (projectKey: string, number: number, title: string) =>
  api(`${base(projectKey)}/${number}/subtasks`, { method: 'POST', body: { title }, schema: taskResponse });
export const updateSubtask = (projectKey: string, number: number, id: string, input: { title?: string; done?: boolean }) =>
  api(`${base(projectKey)}/${number}/subtasks/${id}`, { method: 'PATCH', body: input, schema: taskResponse });
export const deleteSubtask = (projectKey: string, number: number, id: string) =>
  api(`${base(projectKey)}/${number}/subtasks/${id}`, { method: 'DELETE', schema: taskResponse });
export const addComment = (projectKey: string, number: number, body: string) =>
  api(`${base(projectKey)}/${number}/comments`, { method: 'POST', body: { body }, schema: taskResponse });
export const deleteComment = (projectKey: string, number: number, id: string) =>
  api(`${base(projectKey)}/${number}/comments/${id}`, { method: 'DELETE', schema: taskResponse });

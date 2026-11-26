import { taskResponse, tasksResponse, type CreateTaskInput, type UpdateTaskInput } from '@taskflow/core';
import { z } from 'zod';
import { api } from '../../lib/http';

export const taskKeys = {
  list: (projectKey: string) => ['projects', projectKey, 'tasks'] as const,
  detail: (projectKey: string, number: number) => ['projects', projectKey, 'tasks', number] as const,
};

const base = (projectKey: string) => `/api/projects/${encodeURIComponent(projectKey)}/tasks`;
const withSignal = (signal?: AbortSignal) => (signal ? { signal } : {});

export const fetchTasks = (projectKey: string, signal?: AbortSignal) => api(base(projectKey), { schema: tasksResponse, ...withSignal(signal) });
export const fetchTask = (projectKey: string, number: number, signal?: AbortSignal) =>
  api(`${base(projectKey)}/${number}`, { schema: taskResponse, ...withSignal(signal) });
export const createTask = (projectKey: string, input: Partial<CreateTaskInput> & { title: string }) =>
  api(base(projectKey), { method: 'POST', body: input, schema: taskResponse });
export const updateTask = (projectKey: string, number: number, input: UpdateTaskInput) =>
  api(`${base(projectKey)}/${number}`, { method: 'PATCH', body: input, schema: taskResponse });
export const deleteTask = (projectKey: string, number: number) => api(`${base(projectKey)}/${number}`, { method: 'DELETE', schema: z.null() });

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

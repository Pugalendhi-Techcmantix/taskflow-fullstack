import { activityPageResponse, taskHistoryResponse, type ActivityType } from '@taskflow/core';
import { api } from '../../lib/http';
import { taskKeys } from '../tasks/tasks-api';

export type TimelineFilters = {
  user?: string | undefined;
  type?: ActivityType | undefined;
  /** Only this project (dashboard "Recent activity"). */
  project?: string | undefined;
  /** Page size (default 30). */
  limit?: number | undefined;
};

export const activityKeys = {
  all: ['activity'] as const,
  timeline: (filters: TimelineFilters) => ['activity', 'timeline', filters] as const,
  /** Under the task's detail key: anything that refreshes the task also refreshes its history. */
  task: (projectKey: string, number: number) => [...taskKeys.detail(projectKey, number), 'activity'] as const,
};

/** One page of the workspace timeline (newest first). `cursor` comes from the previous page. */
export function fetchTimeline(filters: TimelineFilters, cursor: string | null, signal?: AbortSignal) {
  const params = new URLSearchParams();
  if (filters.user) params.set('user', filters.user);
  if (filters.type) params.set('type', filters.type);
  if (filters.project) params.set('project', filters.project);
  if (filters.limit) params.set('limit', String(filters.limit));
  if (cursor) params.set('cursor', cursor);
  const qs = params.toString();
  return api(`/api/activity${qs ? `?${qs}` : ''}`, { schema: activityPageResponse, ...(signal ? { signal } : {}) });
}

export const fetchTaskHistory = (projectKey: string, number: number, signal?: AbortSignal) =>
  api(`/api/projects/${encodeURIComponent(projectKey)}/tasks/${number}/activity`, { schema: taskHistoryResponse, ...(signal ? { signal } : {}) });

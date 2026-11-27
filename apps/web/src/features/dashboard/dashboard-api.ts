import { dashboardResponse } from '@taskflow/core';
import { api } from '../../lib/http';
import { taskKeys } from '../tasks/tasks-api';

export const dashboardKeys = {
  /** Under the task-list key: any task change (dialog, board, new task) refreshes the dashboard too. */
  project: (projectKey: string) => [...taskKeys.list(projectKey), 'dashboard'] as const,
};

export const fetchDashboard = (projectKey: string, signal?: AbortSignal) =>
  api(`/api/projects/${encodeURIComponent(projectKey)}/dashboard`, { schema: dashboardResponse, ...(signal ? { signal } : {}) });

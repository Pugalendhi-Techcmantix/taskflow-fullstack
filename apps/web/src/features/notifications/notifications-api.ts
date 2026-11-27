import { notificationsResponse, unreadResponse } from '@taskflow/core';
import { api } from '../../lib/http';

export const notificationKeys = { list: ['notifications'] as const };

export function fetchNotifications(cursor: string | null, signal?: AbortSignal) {
  const qs = cursor ? `?cursor=${encodeURIComponent(cursor)}` : '';
  return api(`/api/notifications${qs}`, { schema: notificationsResponse, ...(signal ? { signal } : {}) });
}
export const markNotificationRead = (id: string) => api(`/api/notifications/${id}/read`, { method: 'POST', schema: unreadResponse });
export const markAllNotificationsRead = () => api('/api/notifications/read-all', { method: 'POST', schema: unreadResponse });

import { useEffect, useEffectEvent } from 'react';
import { useLocation, useSearchParams } from 'react-router';
import { useQueryClient, type InfiniteData } from '@tanstack/react-query';
import { TASK_STATUS_LABELS, taskStatusSchema, type NotificationMessage, type NotificationsPage, type ProjectChangedMessage } from '@taskflow/core';
import { toast } from '../../app/toast';
import { startRealtime } from '../../lib/realtime';
import { activityKeys } from '../activity/activity-api';
import { useSession } from '../auth/session';
import { lastProject, projectKeys } from '../projects/projects-api';
import { sprintKeys } from '../sprints/sprints-api';
import { taskKeys } from '../tasks/tasks-api';
import { notificationKeys } from './notifications-api';

/** A short line for someone else's change, or null when it isn't worth interrupting for. */
export function liveToastText({ actor, event: e }: ProjectChangedMessage): string | null {
  const who = actor?.name ?? 'Someone';
  switch (e.action) {
    case 'task.created':
      return `${who} created ${e.task.key}`;
    case 'task.moved':
      return `${who} moved ${e.task.key} → ${TASK_STATUS_LABELS[e.to]}`;
    case 'task.changed': {
      const to = e.field === 'status' ? taskStatusSchema.safeParse(e.to) : null;
      return to?.success ? `${who} moved ${e.task.key} → ${TASK_STATUS_LABELS[to.data]}` : `${who} updated ${e.task.key}`;
    }
    case 'task.renamed':
    case 'task.description_updated':
    case 'subtask.added':
    case 'subtask.completed':
    case 'subtask.reopened':
    case 'subtask.renamed':
    case 'subtask.removed':
      return `${who} updated ${e.task.key}`;
    case 'task.deleted':
      return `${who} deleted ${e.task.key}`;
    case 'comment.added':
      return `${who} commented on ${e.task.key}`;
    case 'sprint.started':
      return `${who} started ${e.sprint.name}`;
    case 'sprint.completed':
      return `${who} completed ${e.sprint.name}`;
    default:
      return null;
  }
}

/** One toast per person and task every few seconds, so autosaving or a burst of edits doesn't flood the screen. */
const TOAST_GAP_MS = 5000;
const lastToastAt = new Map<string, number>();
function throttled(key: string): boolean {
  const now = Date.now();
  if (now - (lastToastAt.get(key) ?? 0) < TOAST_GAP_MS) return true;
  lastToastAt.set(key, now);
  return false;
}

/** The project the user is looking at: /projects/:key/…, or the dashboard's project. */
function useViewingProject(): string | null {
  const { pathname } = useLocation();
  const [params] = useSearchParams();
  const fromPath = /^\/projects\/([^/]+)/.exec(pathname)?.[1];
  if (fromPath) return fromPath.toUpperCase();
  if (pathname === '/') return params.get('project')?.toUpperCase() ?? lastProject();
  return null;
}

/**
 * Keeps the signed-in app live (Module 9): opens the Socket.IO connection, refreshes whatever shows a
 * changed project, adds new notifications to the bell, and refetches everything after a reconnect.
 */
export function useLiveUpdates() {
  const qc = useQueryClient();
  const session = useSession();
  const viewing = useViewingProject();
  const me = session.status === 'authenticated' ? session.user.id : null;

  const onProjectChanged = useEffectEvent((m: ProjectChangedMessage) => {
    // Every task query of the project (table pages, board, planning, task dialogs, dashboard) sits under this key.
    void qc.invalidateQueries({ queryKey: taskKeys.list(m.projectKey) });
    void qc.invalidateQueries({ queryKey: sprintKeys.list(m.projectKey) });
    void qc.invalidateQueries({ queryKey: projectKeys.all });
    void qc.invalidateQueries({ queryKey: activityKeys.all });
    if (!m.actor || m.actor.id === me || viewing !== m.projectKey) return;
    const text = liveToastText(m);
    const subject = 'task' in m.event ? m.event.task.key : m.projectKey;
    if (text && !throttled(`${m.actor.id}:${subject}`)) toast(text, 'live');
  });

  const onNotification = useEffectEvent((m: NotificationMessage) => {
    const cached = qc.getQueryData<InfiniteData<NotificationsPage, string | null>>(notificationKeys.list);
    const [first, ...rest] = cached?.pages ?? [];
    if (!cached || !first) {
      void qc.invalidateQueries({ queryKey: notificationKeys.list });
      return;
    }
    qc.setQueryData<InfiniteData<NotificationsPage, string | null>>(notificationKeys.list, {
      ...cached,
      pages: [{ ...first, unread: m.unread, notifications: [m.notification, ...first.notifications] }, ...rest],
    });
  });

  // Anything could have changed while the connection was down.
  const onReconnected = useEffectEvent(() => void qc.invalidateQueries());

  useEffect(() => {
    if (!me) return;
    return startRealtime({
      onProjectChanged: (m) => onProjectChanged(m),
      onNotification: (m) => onNotification(m),
      onReconnected: () => onReconnected(),
    });
  }, [me]);
}

import type { ReactNode } from 'react';
import { useNavigate } from 'react-router';
import { useInfiniteQuery, useMutation, useQueryClient, type InfiniteData } from '@tanstack/react-query';
import { TASK_STATUS_LABELS, type Notification, type NotificationData, type NotificationsPage } from '@taskflow/core';
import { Avatar } from '../../app/Avatar';
import { LoadError, SkeletonRows, errorMessage } from '../../app/feedback';
import { Icon } from '../../app/icons';
import { toast } from '../../app/toast';
import { timeAgo } from '../../lib/dates';
import { fetchNotifications, markAllNotificationsRead, markNotificationRead, notificationKeys } from './notifications-api';

const MENU_ID = 'notif-menu';
const noCursor = (): string | null => null;
type Pages = InfiniteData<NotificationsPage, string | null>;

/** What the notification says (prototype wording). */
function describe(actor: string, d: NotificationData): ReactNode {
  switch (d.kind) {
    case 'assigned':
      return <><b>{actor}</b> assigned <b>{d.task.key}</b> to you</>;
    case 'mentioned':
      return <><b>{actor}</b> mentioned you on <b>{d.task.key}</b></>;
    case 'status_changed':
      return <><b>{actor}</b> moved <b>{d.task.key}</b> to {TASK_STATUS_LABELS[d.to]}</>;
    case 'sprint_started':
      return <><b>{d.sprint.name}</b> has started — {d.tasks} tasks, {d.points} points</>;
    case 'sprint_completed':
      return <><b>{d.sprint.name}</b> was completed — {d.done} of {d.total} tasks done</>;
  }
}

/** Where a notification leads: the task (its dialog), or the project's sprints. */
function targetOf(n: Notification): string | null {
  if (n.task && n.project) return `/projects/${n.project.key}/tasks?task=${n.task.key}`;
  if (n.project) return `/projects/${n.project.key}/sprints`;
  return null;
}

/** Applies a change to the cached pages; returns the previous cache for rollback. */
function usePatchPages() {
  const qc = useQueryClient();
  return (update: (pages: Pages) => Pages) => {
    const previous = qc.getQueryData<Pages>(notificationKeys.list);
    if (previous) qc.setQueryData<Pages>(notificationKeys.list, update(previous));
    return () => qc.setQueryData(notificationKeys.list, previous);
  };
}

/** Top-bar bell (prototype): unread count, a dropdown list, mark one or all as read. Updates live. */
export function NotificationBell() {
  const navigate = useNavigate();
  const patch = usePatchPages();
  const list = useInfiniteQuery({
    queryKey: notificationKeys.list,
    queryFn: ({ pageParam, signal }) => fetchNotifications(pageParam, signal),
    initialPageParam: noCursor(),
    getNextPageParam: (last) => last.nextCursor,
  });
  const unread = list.data?.pages[0]?.unread ?? 0;
  const items = list.data?.pages.flatMap((p) => p.notifications) ?? [];

  /** Optimistic: the item turns read and the count drops at once; both come back if the server refuses. */
  const markRead = useMutation({
    mutationFn: (id: string) => markNotificationRead(id),
    onMutate: (id) => ({
      rollback: patch((data) => ({
        ...data,
        pages: data.pages.map((p, i) => ({
          ...p,
          unread: i === 0 ? Math.max(0, p.unread - 1) : p.unread,
          notifications: p.notifications.map((n) => (n.id === id ? { ...n, read: true } : n)),
        })),
      })),
    }),
    onError: (err, _id, ctx) => {
      ctx?.rollback();
      toast(errorMessage(err), 'error');
    },
  });
  const markAll = useMutation({
    mutationFn: markAllNotificationsRead,
    onMutate: () => ({
      rollback: patch((data) => ({
        ...data,
        pages: data.pages.map((p) => ({ ...p, unread: 0, notifications: p.notifications.map((n) => ({ ...n, read: true })) })),
      })),
    }),
    onError: (err, _v, ctx) => {
      ctx?.rollback();
      toast(errorMessage(err), 'error');
    },
  });

  const open = (n: Notification) => {
    if (!n.read) markRead.mutate(n.id);
    const to = targetOf(n);
    if (to) void navigate(to);
  };

  return (
    <>
      <button className="icon-btn bell" popoverTarget={MENU_ID} aria-label={unread ? `Notifications, ${unread} unread` : 'Notifications'} title="Notifications">
        <Icon name="bell" size={20} />
        {/* A new key restarts the pulse whenever the count changes. */}
        {unread > 0 && <span key={unread} className="nbadge pulse" aria-hidden="true">{unread > 99 ? '99+' : unread}</span>}
      </button>
      <div id={MENU_ID} popover="auto" className="dropdown notif-dd" aria-label="Notifications">
        <div className="dd-head">
          <b>Notifications</b>
          {unread > 0 && <button type="button" className="link-btn" onClick={() => markAll.mutate()}>Mark all as read</button>}
        </div>
        <div className="dd-body">
          {list.status === 'pending' && <div className="notif-pad"><SkeletonRows rows={3} label="Loading notifications" /></div>}
          {list.status === 'error' && !list.data && <div className="notif-pad"><LoadError error={list.error} onRetry={() => void list.refetch()} /></div>}
          {list.data && items.length === 0 && <div className="empty-state notif-empty">You're all caught up</div>}
          {items.length > 0 && (
            <ul className="notif-list">
              {items.map((n) => (
                <li key={n.id}>
                  <button type="button" className={`notif ${n.read ? '' : 'unread'}`} popoverTarget={MENU_ID} popoverTargetAction="hide" onClick={() => open(n)}>
                    {n.actor ? <Avatar id={n.actor.id} name={n.actor.name} size="sm" /> : <span className="avatar sm more" aria-hidden="true">?</span>}
                    <span className="notif-body">
                      <span className="t">{describe(n.actor?.name ?? 'Someone', n.data)}</span>
                      <time className="time" dateTime={n.createdAt}>{timeAgo(n.createdAt)}</time>
                    </span>
                    {!n.read && <span className="visually-hidden">(unread)</span>}
                  </button>
                </li>
              ))}
            </ul>
          )}
          {list.hasNextPage && (
            <div className="notif-more">
              <button type="button" className="btn sm" disabled={list.isFetchingNextPage} onClick={() => void list.fetchNextPage()}>
                {list.isFetchingNextPage ? 'Loading…' : 'Show older'}
              </button>
            </div>
          )}
        </div>
      </div>
    </>
  );
}

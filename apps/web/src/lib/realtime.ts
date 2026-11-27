import { useSyncExternalStore } from 'react';
import { io, type Socket } from 'socket.io-client';
import { REALTIME, notificationMessage, projectChangedMessage, type NotificationMessage, type ProjectChangedMessage } from '@taskflow/core';
import { getAccessToken, refreshSession } from './http';

/**
 * - `connecting`: first connection after sign-in
 * - `connected`: live
 * - `reconnecting`: the connection dropped; Socket.IO keeps retrying
 * - `offline`: not started (signed out)
 */
export type RealtimeStatus = 'connecting' | 'connected' | 'reconnecting' | 'offline';

let status: RealtimeStatus = 'offline';
const listeners = new Set<() => void>();
function setStatus(next: RealtimeStatus) {
  if (next === status) return;
  status = next;
  for (const l of listeners) l();
}

/** The connection status, for the "Reconnecting…" indicator (a browser subscription, not an effect). */
export function useRealtimeStatus(): RealtimeStatus {
  return useSyncExternalStore(
    (onChange) => {
      listeners.add(onChange);
      return () => listeners.delete(onChange);
    },
    () => status,
  );
}

export type RealtimeHandlers = {
  onProjectChanged: (message: ProjectChangedMessage) => void;
  onNotification: (message: NotificationMessage) => void;
  /** The connection came back after a drop: anything may have been missed. */
  onReconnected: () => void;
};

/**
 * Opens the real-time connection (same origin, proxied to the API in dev). Messages are checked with Zod
 * like API responses. Returns a function that closes it.
 */
export function startRealtime(handlers: RealtimeHandlers): () => void {
  let wasConnected = false;
  let closed = false;
  const socket: Socket = io({
    path: '/socket.io',
    transports: ['websocket'],
    // Read on every (re)connect, so a refreshed token is used.
    auth: (cb) => cb({ token: getAccessToken() ?? '' }),
  });
  setStatus('connecting');

  socket.on('connect', () => {
    setStatus('connected');
    if (wasConnected) handlers.onReconnected();
    wasConnected = true;
  });
  socket.on('disconnect', (reason) => {
    // The server or network dropped us: Socket.IO reconnects by itself.
    if (!closed) setStatus(reason === 'io server disconnect' ? 'offline' : 'reconnecting');
    if (reason === 'io server disconnect' && !closed) socket.connect();
  });
  socket.on('connect_error', (err) => {
    setStatus(wasConnected ? 'reconnecting' : 'connecting');
    // Expired access token: refresh it once, then try again (Socket.IO doesn't retry refused handshakes).
    if (err.message === 'unauthorized') {
      void refreshSession().then((session) => {
        if (session && !closed) socket.connect();
      });
    }
  });

  socket.on(REALTIME.projectChanged, (raw: unknown) => {
    const message = projectChangedMessage.safeParse(raw);
    if (message.success) handlers.onProjectChanged(message.data);
  });
  socket.on(REALTIME.notification, (raw: unknown) => {
    const message = notificationMessage.safeParse(raw);
    if (message.success) handlers.onNotification(message.data);
  });

  return () => {
    closed = true;
    socket.disconnect();
    setStatus('offline');
  };
}

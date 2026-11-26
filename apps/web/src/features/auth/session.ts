import { useSyncExternalStore } from 'react';
import {
  authResponse,
  sessionUser,
  type AuthResponse,
  type LoginInput,
  type PermissionKey,
  type PublicUser,
  type RegisterInput,
} from '@taskflow/core';
import { z } from 'zod';
import { api, refreshSession, setAccessToken, setSessionExpiredHandler } from '../../lib/http';
import { queryClient } from '../../lib/query';

/** Who is signed in. One explicit state at a time — never a mix of booleans. */
export type SessionState =
  | { status: 'loading' }
  | { status: 'unavailable'; message: string }
  | { status: 'anonymous' }
  | { status: 'authenticated'; user: PublicUser; permissions: PermissionKey[] };

/* ---------- a tiny external store, read with useSyncExternalStore ---------- */

let state: SessionState = { status: 'loading' };
const listeners = new Set<() => void>();

function setState(next: SessionState) {
  state = next;
  for (const listener of listeners) listener();
}
const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};
const getSnapshot = () => state;

export function useSession(): SessionState {
  return useSyncExternalStore(subscribe, getSnapshot);
}

const NO_PERMISSIONS: readonly PermissionKey[] = [];

/** `const can = useCan(); can('task:move')` — hides or disables UI. The API enforces the same rules. */
export function useCan(): (permission: PermissionKey) => boolean {
  const session = useSession();
  const granted = session.status === 'authenticated' ? session.permissions : NO_PERMISSIONS;
  return (permission) => granted.includes(permission);
}

/** Back to signed-out: forget the token and every cached server response. */
function endSession() {
  setAccessToken(null);
  queryClient.clear();
  setState({ status: 'anonymous' });
}

setSessionExpiredHandler(endSession);

/* ---------- actions ---------- */

/** Stores a fresh session returned by login, register, refresh or invite-accept. */
export function startSession(session: AuthResponse): void {
  setAccessToken(session.accessToken);
  setState({ status: 'authenticated', user: session.user, permissions: session.permissions });
}

/** On page load: use the refresh cookie (if any) to sign back in silently. */
export async function restoreSession(): Promise<void> {
  setState({ status: 'loading' });
  try {
    const session = await refreshSession();
    if (session) startSession(session);
    else setState({ status: 'anonymous' });
  } catch (err) {
    setState({ status: 'unavailable', message: err instanceof Error ? err.message : 'Something went wrong.' });
  }
}

/** Re-reads the signed-in user's role and permissions (after they may have changed). */
export async function reloadSessionUser(): Promise<void> {
  if (state.status !== 'authenticated') return;
  const me = await api('/api/auth/me', { schema: sessionUser });
  setState({ status: 'authenticated', user: me.user, permissions: me.permissions });
}

export async function signIn(input: LoginInput): Promise<void> {
  startSession(await api('/api/auth/login', { method: 'POST', body: input, schema: authResponse }));
}

export async function signUp(input: RegisterInput): Promise<void> {
  startSession(await api('/api/auth/register', { method: 'POST', body: input, schema: authResponse }));
}

export async function signOut(): Promise<void> {
  try {
    await api('/api/auth/logout', { method: 'POST', schema: z.null() });
  } finally {
    // Even if the server is unreachable, this tab forgets the session.
    endSession();
  }
}

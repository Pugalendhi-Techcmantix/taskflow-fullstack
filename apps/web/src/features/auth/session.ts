import { useSyncExternalStore } from 'react';
import { authResponse, type LoginInput, type PublicUser, type RegisterInput } from '@taskflow/core';
import { z } from 'zod';
import { api, refreshSession, setAccessToken, setSessionExpiredHandler } from '../../lib/http';

/** Who is signed in. One explicit state at a time — never a mix of booleans. */
export type SessionState =
  | { status: 'loading' }
  | { status: 'unavailable'; message: string }
  | { status: 'anonymous' }
  | { status: 'authenticated'; user: PublicUser };

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

setSessionExpiredHandler(() => setState({ status: 'anonymous' }));

/* ---------- actions ---------- */

/** On page load: use the refresh cookie (if any) to sign back in silently. */
export async function restoreSession(): Promise<void> {
  setState({ status: 'loading' });
  try {
    const session = await refreshSession();
    setState(session ? { status: 'authenticated', user: session.user } : { status: 'anonymous' });
  } catch (err) {
    setState({ status: 'unavailable', message: err instanceof Error ? err.message : 'Something went wrong.' });
  }
}

export async function signIn(input: LoginInput): Promise<void> {
  const session = await api('/api/auth/login', { method: 'POST', body: input, schema: authResponse });
  setAccessToken(session.accessToken);
  setState({ status: 'authenticated', user: session.user });
}

export async function signUp(input: RegisterInput): Promise<void> {
  const session = await api('/api/auth/register', { method: 'POST', body: input, schema: authResponse });
  setAccessToken(session.accessToken);
  setState({ status: 'authenticated', user: session.user });
}

export async function signOut(): Promise<void> {
  try {
    await api('/api/auth/logout', { method: 'POST', schema: z.null() });
  } finally {
    // Even if the server is unreachable, this tab forgets the session.
    setAccessToken(null);
    setState({ status: 'anonymous' });
  }
}

import { apiErrorBody, authResponse, type AuthResponse } from '@taskflow/core';
import type { z } from 'zod';

/** Any failed API call. `fields` maps form field names to messages for inline errors. */
export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly fields: Record<string, string>;

  constructor(status: number, code: string, message: string, fields: Record<string, string> = {}) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.fields = fields;
  }
}

/* ---------- access token: memory only (never localStorage) ---------- */

let accessToken: string | null = null;
export const setAccessToken = (token: string | null) => {
  accessToken = token;
};

/** Called when a refresh fails, so the UI can return to the sign-in page. */
let onSessionExpired: () => void = () => {};
export const setSessionExpiredHandler = (fn: () => void) => {
  onSessionExpired = fn;
};

/* ---------- response handling ---------- */

function parseJson(text: string): unknown {
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

async function readResponse<T>(res: Response, schema: z.ZodType<T>): Promise<T> {
  const json = parseJson(await res.text());
  if (!res.ok) {
    const err = apiErrorBody.safeParse(json);
    if (err.success) throw new ApiError(res.status, err.data.error.code, err.data.error.message, err.data.error.fields);
    throw new ApiError(
      res.status,
      'HTTP_ERROR',
      res.status >= 500 ? 'The server had a problem. Please try again.' : `Request failed (${res.status})`,
    );
  }
  // Responses are validated too: the UI never trusts the shape of external data.
  const parsed = schema.safeParse(json);
  if (!parsed.success) throw new ApiError(res.status, 'BAD_RESPONSE', 'The server sent an unexpected response.');
  return parsed.data;
}

async function send(path: string, init: RequestInit): Promise<Response> {
  try {
    return await fetch(path, { ...init, credentials: 'same-origin' });
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') throw err;
    throw new ApiError(0, 'NETWORK_ERROR', "Can't reach the server. Check your connection and try again.");
  }
}

/* ---------- refresh: single-flight, so ten parallel 401s trigger one refresh ---------- */

let refreshing: Promise<AuthResponse | null> | null = null;

/** Exchanges the httpOnly refresh cookie for a new access token. Resolves null when signed out. */
export function refreshSession(): Promise<AuthResponse | null> {
  refreshing ??= (async () => {
    try {
      const res = await send('/api/auth/refresh', { method: 'POST' });
      if (res.status === 401) {
        accessToken = null;
        return null;
      }
      const session = await readResponse(res, authResponse);
      accessToken = session.accessToken;
      return session;
    } finally {
      refreshing = null;
    }
  })();
  return refreshing;
}

/* ---------- the one function every feature uses to call the API ---------- */

type Method = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

export type RequestOptions<T> = {
  method?: Method;
  body?: unknown;
  /** Zod schema the response must match. */
  schema: z.ZodType<T>;
  signal?: AbortSignal;
};

export async function api<T>(path: string, options: RequestOptions<T>): Promise<T> {
  const { method = 'GET', body, schema, signal } = options;
  const attempt = () => {
    const headers: Record<string, string> = {};
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
    return send(path, {
      method,
      headers,
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
      ...(signal ? { signal } : {}),
    });
  };

  let res = await attempt();
  if (res.status === 401 && accessToken !== null) {
    // Access token expired: refresh once, then retry the original request.
    const session = await refreshSession();
    if (!session) {
      onSessionExpired();
      throw new ApiError(401, 'UNAUTHORIZED', 'Your session has ended. Please sign in again.');
    }
    res = await attempt();
  }
  return readResponse(res, schema);
}

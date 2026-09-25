/** Small fetch wrapper with bearer auth, silent refresh and normalized errors. */

/** Base URL of the API including the /api prefix — used for direct downloads. */
export const API_URL = (import.meta.env.VITE_API_URL ?? 'http://localhost:4000/api').replace(/\/+$/, '');
const API_ORIGIN = API_URL.replace(/\/api$/, '');

const TOKEN_KEY = 'ds_access_token';
const CSRF_KEY = 'ds_csrf_token';
const REFRESH_COOKIE_NAME = 'ds_refresh';

export function getToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function getCsrfToken(): string | null {
  try {
    return localStorage.getItem(CSRF_KEY);
  } catch {
    return null;
  }
}

export function setTokens(accessToken: string | null, csrfToken?: string | null): void {
  try {
    if (accessToken) localStorage.setItem(TOKEN_KEY, accessToken);
    else localStorage.removeItem(TOKEN_KEY);
    if (csrfToken !== undefined) {
      if (csrfToken) localStorage.setItem(CSRF_KEY, csrfToken);
      else localStorage.removeItem(CSRF_KEY);
    }
  } catch {
    // Storage (private mode / quota) must never break auth or blank the app.
  }
}

/** Clears every client-side auth hint (access + CSRF companion). */
export function clearAuthStorage(): void {
  setTokens(null, null);
}

/** True when the browser may still hold the httpOnly refresh cookie. */
export function hasRefreshCookie(): boolean {
  try {
    return document.cookie.split(';').some((part) => part.trim().startsWith(`${REFRESH_COOKIE_NAME}=`));
  } catch {
    return false;
  }
}

/** Single-flight guard: concurrent 401s share one refresh round-trip. */
let refreshPromise: Promise<boolean> | null = null;

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly message: string;
  readonly details?: Array<{ path: string; message: string }>;

  constructor(status: number, code: string, message: string, details?: Array<{ path: string; message: string }>) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.message = message;
    this.details = details;
  }
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  body?: unknown;
  formData?: FormData;
  signal?: AbortSignal;
  retry?: boolean;
}

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = 'GET', body, formData, signal, retry = true } = options;

  const headers: Record<string, string> = {};
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  const csrf = getCsrfToken();
  if (method !== 'GET' && csrf) headers['x-csrf-token'] = csrf;

  let payload: BodyInit | undefined;
  if (formData) payload = formData;
  else if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
    payload = JSON.stringify(body);
  }

  const res = await fetch(`${API_URL}${path}`, {
    method,
    headers,
    credentials: 'include',
    body: payload,
    signal,
  });

  // A 401 means the access token is missing/expired — always attempt the
  // refresh-cookie recovery first (even when there is no token in storage,
  // e.g. cleared storage but a live cookie, or an expired in-memory token).
  // Only a refresh the *server refuses* ends the session; network failures
  // surface as their real error so the UI can retry instead of signing out.
  if (res.status === 401 && retry) {
    const refreshed = await refreshSession();
    if (refreshed) {
      window.dispatchEvent(new Event('ds:token-refreshed'));
      return request<T>(path, { ...options, retry: false });
    }
    // Abort-signal cancellations must not be mistaken for an expired session.
    if (signal?.aborted) throw new ApiError(0, 'ABORTED', 'Request cancelled.');
    // A missing token with no refresh cookie at all means "never signed in"
    // (not an expiry): surface the real 401 without a global sign-out event.
    if (!getToken() && !hasRefreshCookie() && !getCsrfToken()) {
      const text = await res.text().catch(() => '');
      let data: unknown = null;
      try {
        data = text ? JSON.parse(text) : null;
      } catch {
        data = null;
      }
      const err = (data as { error?: { code?: string; message?: string } } | null)?.error;
      throw new ApiError(res.status, err?.code ?? 'UNAUTHORIZED', err?.message ?? 'Please sign in.');
    }
    clearAuthStorage();
    window.dispatchEvent(new Event('ds:session-expired'));
    throw new ApiError(401, 'SESSION_EXPIRED', 'Your session expired. Please sign in again.');
  }

  if (res.status === 204) return undefined as T;
  const text = await res.text();
  let data: unknown = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = null;
  }

  if (!res.ok) {
    const err = (data as { error?: { code?: string; message?: string; details?: [] } } | null)?.error;
    throw new ApiError(
      res.status,
      err?.code ?? 'REQUEST_FAILED',
      err?.message ?? 'Something went wrong. Please try again.',
      err?.details,
    );
  }
  return data as T;
}

/** Exchanges the refresh cookie for a fresh access token (single-flight). */
export async function refreshSession(): Promise<boolean> {
  if (refreshPromise) return refreshPromise;
  refreshPromise = (async () => {
    try {
      const csrf = getCsrfToken();
      const res = await fetch(`${API_URL}/auth/refresh`, {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          ...(csrf ? { 'x-csrf-token': csrf } : {}),
        },
      });
      if (!res.ok) {
        // Distinguish "server refused" (401/403 -> session genuinely gone)
        // from transient failures (network/offline/5xx -> keep the user).
        if (res.status === 401 || res.status === 403) {
          clearAuthStorage();
          return false;
        }
        return false;
      }
      const data = (await res.json()) as { accessToken?: string; csrfToken?: string };
      if (!data.accessToken) return false;
      setTokens(data.accessToken, data.csrfToken ?? null);
      return true;
    } catch {
      return false;
    } finally {
      refreshPromise = null;
    }
  })();
  return refreshPromise;
}

export function mediaUrl(value: string | null | undefined): string | null {
  if (!value) return null;
  if (/^(https?:\/\/|data:|blob:)/i.test(value)) return value;
  return `${API_ORIGIN}${value.startsWith('/') ? '' : '/'}${value}`;
}

export function qs(params: Record<string, string | number | boolean | undefined | null>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== '') search.set(key, String(value));
  }
  const text = search.toString();
  return text ? `?${text}` : '';
}

export const api = {
  get: <T>(path: string, signal?: AbortSignal) => request<T>(path, { signal }),
  post: <T>(path: string, body?: unknown) => request<T>(path, { method: 'POST', body }),
  patch: <T>(path: string, body?: unknown) => request<T>(path, { method: 'PATCH', body }),
  del: <T>(path: string) => request<T>(path, { method: 'DELETE' }),
  upload: <T>(path: string, formData: FormData) => request<T>(path, { method: 'POST', formData }),
};

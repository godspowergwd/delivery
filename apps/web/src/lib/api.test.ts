import { afterEach, describe, expect, it, vi } from 'vitest';
import { api, getToken, refreshSession, setTokens } from './api';

function installAuthGlobals() {
  const values = new Map<string, string>();
  const storage = {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key),
  };
  const events = new EventTarget();
  vi.stubGlobal('localStorage', storage);
  vi.stubGlobal('document', { cookie: '' });
  vi.stubGlobal('window', events);
  return { values, events, storage };
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('authenticated API client', () => {
  it('persists one access token and detects unavailable storage', () => {
    const { storage } = installAuthGlobals();
    expect(setTokens('driver-access', 'csrf-value')).toBe(true);
    expect(getToken()).toBe('driver-access');

    vi.stubGlobal('localStorage', {
      ...storage,
      setItem: () => { throw new Error('storage unavailable'); },
    });
    expect(setTokens('next-token', 'csrf-value')).toBe(false);
  });

  it('attaches the stored bearer token to authenticated requests', async () => {
    installAuthGlobals();
    setTokens('driver-access', 'csrf-value');
    const requests: RequestInit[] = [];
    vi.stubGlobal('fetch', vi.fn(async (_input: unknown, init?: RequestInit) => {
      requests.push(init ?? {});
      return new Response('{}', { status: 200 });
    }));

    await api.get('/driver/summary');

    expect(requests[0]?.headers).toEqual({ Authorization: 'Bearer driver-access' });
  });

  it('refreshes once and retries with the refreshed bearer token', async () => {
    const { events } = installAuthGlobals();
    setTokens('old-access', 'csrf-value');
    const requests: Array<{ url: string; headers: HeadersInit | undefined }> = [];
    let protectedRequests = 0;
    vi.stubGlobal('fetch', vi.fn(async (input: unknown, init?: RequestInit) => {
      const url = String(input);
      requests.push({ url, headers: init?.headers });
      if (url.endsWith('/auth/refresh')) {
        return new Response(JSON.stringify({ accessToken: 'new-access', csrfToken: 'new-csrf' }), { status: 200 });
      }
      protectedRequests += 1;
      return new Response('{}', { status: protectedRequests === 1 ? 401 : 200 });
    }));
    let tokenRefreshed = false;
    events.addEventListener('ds:token-refreshed', () => { tokenRefreshed = true; });

    await api.get('/driver/summary');

    expect(requests.map((request) => (request.headers as Record<string, string> | undefined)?.Authorization)).toEqual([
      'Bearer old-access',
      undefined,
      'Bearer new-access',
    ]);
    expect(getToken()).toBe('new-access');
    expect(tokenRefreshed).toBe(true);
  });

  it('gets the CSRF token before refresh when local storage has no header value', async () => {
    installAuthGlobals();
    setTokens('expired-access', null);
    const calls: Array<{ url: string; credentials?: RequestCredentials; csrf?: string }> = [];
    vi.stubGlobal('fetch', vi.fn(async (input: unknown, init?: RequestInit) => {
      const url = String(input);
      const headers = init?.headers as Record<string, string> | undefined;
      calls.push({ url, credentials: init?.credentials, csrf: headers?.['x-csrf-token'] });
      if (url.endsWith('/auth/csrf')) {
        return new Response(JSON.stringify({ csrfToken: 'cookie-csrf' }), { status: 200 });
      }
      return new Response(JSON.stringify({ accessToken: 'new-access', csrfToken: 'next-csrf' }), { status: 200 });
    }));

    await expect(refreshSession()).resolves.toBe(true);
    expect(calls.map((call) => call.url.split('/').pop())).toEqual(['csrf', 'refresh']);
    expect(calls.every((call) => call.credentials === 'include')).toBe(true);
    expect(calls[1]?.csrf).toBe('cookie-csrf');
  });

  it('shares one refresh request across concurrent callers', async () => {
    installAuthGlobals();
    setTokens('expired-access', 'csrf-value');
    let refreshCalls = 0;
    vi.stubGlobal('fetch', vi.fn(async () => {
      refreshCalls += 1;
      await Promise.resolve();
      return new Response(JSON.stringify({ accessToken: 'new-access', csrfToken: 'new-csrf' }), { status: 200 });
    }));

    await expect(Promise.all([refreshSession(), refreshSession(), refreshSession()])).resolves.toEqual([
      true,
      true,
      true,
    ]);
    expect(refreshCalls).toBe(1);
  });

  it('reuses a token refreshed by another tab while waiting for the shared lock', async () => {
    installAuthGlobals();
    setTokens('expired-access', 'csrf-value');
    vi.stubGlobal('navigator', {
      locks: {
        request: async (_name: string, callback: () => Promise<boolean>) => {
          setTokens('rotated-in-another-tab', 'rotated-csrf');
          return callback();
        },
      },
    });
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    await expect(refreshSession()).resolves.toBe(true);
    expect(getToken()).toBe('rotated-in-another-tab');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('resynchronizes a stale CSRF cookie and retries refresh once', async () => {
    installAuthGlobals();
    setTokens('current-access', 'stale-csrf');
    const refreshHeaders: Array<Record<string, string>> = [];
    const credentials: Array<RequestCredentials | undefined> = [];
    let refreshCalls = 0;
    vi.stubGlobal('fetch', vi.fn(async (input: unknown, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith('/auth/csrf')) {
        credentials.push(init?.credentials);
        return new Response(JSON.stringify({ csrfToken: 'cookie-csrf' }), { status: 200 });
      }
      if (url.endsWith('/auth/refresh')) {
        refreshCalls += 1;
        credentials.push(init?.credentials);
        refreshHeaders.push(init?.headers as Record<string, string>);
        if (refreshCalls === 1) return new Response('{}', { status: 403 });
        return new Response(JSON.stringify({ accessToken: 'renewed-access', csrfToken: 'next-csrf' }), { status: 200 });
      }
      throw new Error(`Unexpected request: ${url}`);
    }));

    await expect(refreshSession()).resolves.toBe(true);
    expect(refreshCalls).toBe(2);
    expect(refreshHeaders.map((headers) => headers['x-csrf-token'])).toEqual(['stale-csrf', 'cookie-csrf']);
    expect(credentials).toEqual(['include', 'include', 'include']);
    expect(getToken()).toBe('renewed-access');
  });

  it('preserves the session when CSRF resynchronization itself is blocked', async () => {
    installAuthGlobals();
    setTokens('current-access', 'stale-csrf');
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 403 })));

    await expect(refreshSession()).rejects.toMatchObject({ code: 'CSRF_SYNC_FAILED' });
    expect(getToken()).toBe('current-access');
  });

  it('redirects protected requests with no token instead of exposing the missing-token error', async () => {
    const { events } = installAuthGlobals();
    vi.stubGlobal('fetch', vi.fn(async (input: unknown) =>
      String(input).endsWith('/auth/refresh')
        ? new Response('{}', { status: 401 })
        : new Response(JSON.stringify({ error: { code: 'UNAUTHORIZED', message: 'Missing authentication token.' } }), { status: 401 }),
    ));
    let sessionExpired = false;
    events.addEventListener('ds:session-expired', () => { sessionExpired = true; });

    await expect(api.get('/driver/summary')).rejects.toMatchObject({
      code: 'SESSION_EXPIRED',
      message: 'Your session expired. Please sign in again.',
    });
    expect(sessionExpired).toBe(true);
  });
});
import { describe, expect, it } from 'vitest';
import { corsOptions, csrfGuard } from './security';
import { corsOrigins, isAllowedOrigin } from '../config/env';

describe('authentication request security', () => {
  it('allows configured origins with credentials and rejects unconfigured Worker origins', async () => {
    const configuredOrigin = corsOrigins[0];
    expect(configuredOrigin).toBeTruthy();
    expect(isAllowedOrigin(configuredOrigin)).toBe(true);
    expect(isAllowedOrigin('https://another-account.workers.dev')).toBe(false);
    expect(corsOptions.credentials).toBe(true);

    const decision = await new Promise<{ error: Error | null; allow?: boolean }>((resolve) => {
      corsOptions.origin(configuredOrigin, (error, allow) => resolve({ error, allow }));
    });
    expect(decision).toEqual({ error: null, allow: true });

    const denied = await new Promise<{ error: Error | null; allow?: boolean }>((resolve) => {
      corsOptions.origin('https://another-account.workers.dev', (error, allow) => resolve({ error, allow }));
    });
    expect(denied).toEqual({ error: null, allow: false });
  });

  it('identifies a refresh CSRF mismatch without treating it as an expired session', () => {
    let received: unknown;
    csrfGuard(
      {
        method: 'POST',
        path: '/refresh',
        headers: { 'x-csrf-token': 'stale-token' },
        cookies: { ds_refresh: 'opaque-refresh', ds_csrf: 'current-token' },
      } as never,
      {} as never,
      (error?: unknown) => { received = error; },
    );

    expect(received).toMatchObject({ statusCode: 403, code: 'CSRF_MISMATCH' });
  });

  it('requires CSRF bootstrap when the refresh cookie exists without its companion', () => {
    let received: unknown;
    csrfGuard(
      {
        method: 'POST',
        path: '/refresh',
        headers: {},
        cookies: { ds_refresh: 'opaque-refresh' },
      } as never,
      {} as never,
      (error?: unknown) => { received = error; },
    );

    expect(received).toMatchObject({ statusCode: 403, code: 'CSRF_MISMATCH' });
  });

  it('passes an absent refresh cookie through so the endpoint can return 401', () => {
    let received: unknown;
    csrfGuard(
      { method: 'POST', path: '/refresh', headers: {}, cookies: {} } as never,
      {} as never,
      (error?: unknown) => { received = error; },
    );

    expect(received).toBeUndefined();
  });
});
import { describe, expect, it } from 'vitest';
import { corsOptions, csrfGuard, securityHeaders } from './security';
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

  it('emits a strict API content-security policy plus a deny-by-default permissions policy', () => {
    expect(securityHeaders.length).toBe(2);
    const headers: Record<string, string> = {};
    const helmetLayer = securityHeaders[0];
    const responseStub = {
      setHeader: (name: string, value: string) => { headers[name.toLowerCase()] = value; },
      removeHeader: (name: string) => { delete headers[name.toLowerCase()]; },
    };
    helmetLayer(
      { method: 'GET', headers: {}, url: '/api/products' } as never,
      responseStub as never,
      () => undefined,
    );
    expect(headers['content-security-policy']).toContain("default-src 'none'");
    expect(headers['content-security-policy']).toContain("frame-ancestors 'none'");
    expect(headers['x-frame-options']).toBe('DENY');
    expect(headers['referrer-policy']).toBe('strict-origin-when-cross-origin');

    const policyLayer = securityHeaders[1];
    const policyHeaders: Record<string, string> = {};
    policyLayer(
      {} as never,
      { setHeader: (name: string, value: string) => { policyHeaders[name.toLowerCase()] = value; } } as never,
      () => undefined,
    );
    expect(policyHeaders['permissions-policy']).toContain('geolocation=()');
  });
});
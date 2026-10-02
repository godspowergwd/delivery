import { describe, expect, it } from 'vitest';
import {
  isIsolatedLoadTestDatabaseUrl,
  isLoopbackDatabaseUrl,
  isLoopbackHostname,
} from '@delivery/shared';

describe('load-test database safety', () => {
  it.each([
    'localhost',
    'localhost.',
    '127.0.0.1',
    '127.12.34.56',
    '127.1',
    '2130706433',
    '0x7f000001',
    '::1',
    '0:0:0:0:0:0:0:1',
    '::ffff:127.0.0.1',
    '::ffff:7f00:1',
  ])('recognizes loopback hostname %s', (hostname) => {
    expect(isLoopbackHostname(hostname)).toBe(true);
  });

  it.each(['example.com', '192.168.1.10', '::2', 'localhost.example.com'])('rejects non-loopback hostname %s', (hostname) => {
    expect(isLoopbackHostname(hostname)).toBe(false);
  });

  it('requires both loopback and a dedicated test database name', () => {
    expect(isLoopbackDatabaseUrl('postgresql://user:pass@127.0.0.1:5433/delivery_loadtest')).toBe(true);
    expect(isLoopbackDatabaseUrl('postgresql://user:pass@localhost/delivery_loadtest?host=127.0.0.1')).toBe(true);
    expect(isLoopbackDatabaseUrl('postgresql://user:pass@localhost/delivery_loadtest?host=remote.example.com')).toBe(false);
    expect(isLoopbackDatabaseUrl('postgresql://user:pass@localhost/delivery_loadtest?hostaddr=203.0.113.9')).toBe(false);
    expect(isLoopbackDatabaseUrl('postgresql://user:pass@localhost/delivery_loadtest?service=production')).toBe(false);
    expect(isIsolatedLoadTestDatabaseUrl('postgresql://user:pass@[::1]:5433/delivery_loadtest')).toBe(true);
    expect(isLoopbackDatabaseUrl('postgresql://user:pass@db.example.com/delivery_loadtest')).toBe(false);
    expect(isIsolatedLoadTestDatabaseUrl('postgresql://user:pass@localhost/delivery_system')).toBe(false);
    expect(isIsolatedLoadTestDatabaseUrl('postgresql://user:pass@localhost/delivery_test')).toBe(true);
    expect(isIsolatedLoadTestDatabaseUrl(undefined)).toBe(false);
  });
});
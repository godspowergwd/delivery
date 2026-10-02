import { describe, expect, it } from 'vitest';
import { createKeyedIntervalLimit } from './event-rate-limit';

describe('keyed websocket event limit', () => {
  it('allows the normal six-second location cadence', () => {
    let now = 0;
    const limit = createKeyedIntervalLimit(1_000, () => now);
    expect(limit.accept('driver-a')).toBe(true);
    now += 6_000;
    expect(limit.accept('driver-a')).toBe(true);
  });

  it('blocks high-frequency updates per driver but keeps other drivers independent', () => {
    let now = 10_000;
    const limit = createKeyedIntervalLimit(1_000, () => now);
    expect(limit.accept('driver-a')).toBe(true);
    now += 10;
    expect(limit.accept('driver-a')).toBe(false);
    expect(limit.accept('driver-b')).toBe(true);
    now += 990;
    expect(limit.accept('driver-a')).toBe(true);
  });

  it('forgets an offline driver limit entry', () => {
    let now = 100;
    const limit = createKeyedIntervalLimit(1_000, () => now);
    expect(limit.accept('driver-a')).toBe(true);
    now += 100;
    expect(limit.accept('driver-a')).toBe(false);
    limit.forget('driver-a');
    expect(limit.accept('driver-a')).toBe(true);
  });
});
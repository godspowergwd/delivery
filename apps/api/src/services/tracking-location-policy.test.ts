import { describe, expect, it } from 'vitest';
import { isFreshDriverLocation, shouldPersistDriverLocation } from './tracking.service';

const baseInput = {
  latitude: 5.5774,
  longitude: -0.3104,
  accuracy: 10,
  heading: 0,
  speed: 0,
};

function previous(at: number, overrides: { latitude?: number; longitude?: number; isOnline?: boolean } = {}) {
  const latitude = overrides.latitude ?? baseInput.latitude;
  const longitude = overrides.longitude ?? baseInput.longitude;
  return {
    at,
    lat: latitude,
    lng: longitude,
    row: {
      driverId: 'driver-1',
      latitude,
      longitude,
      accuracy: 10,
      heading: 0,
      speed: 0,
      isOnline: overrides.isOnline ?? true,
      recordedAt: new Date(at),
      updatedAt: new Date(at),
    },
  };
}

describe('driver location persistence policy', () => {
  it('rejects stale or implausibly future GPS timestamps', () => {
    const now = 100_000;
    expect(isFreshDriverLocation(new Date(now - 120_000), now)).toBe(true);
    expect(isFreshDriverLocation(new Date(now - 120_001), now)).toBe(false);
    expect(isFreshDriverLocation(new Date(now + 30_000), now)).toBe(true);
    expect(isFreshDriverLocation(new Date(now + 30_001), now)).toBe(false);
  });

  it('persists the first fix and an offline-to-online reconnect', () => {
    expect(shouldPersistDriverLocation(undefined, baseInput, 0)).toBe(true);
    expect(shouldPersistDriverLocation(previous(0, { isOnline: false }), baseInput, 1_000)).toBe(true);
  });

  it('keeps normal six-second client updates live without persisting each fix', () => {
    const prior = previous(0);
    const moving = { ...baseInput, latitude: baseInput.latitude + 0.0002 };
    expect(shouldPersistDriverLocation(prior, moving, 6_000)).toBe(false);
    expect(shouldPersistDriverLocation(prior, moving, 12_000)).toBe(false);
    expect(shouldPersistDriverLocation(prior, moving, 18_000)).toBe(true);
  });

  it('skips repeated coordinates and small movement until the freshness heartbeat', () => {
    const prior = previous(0);
    expect(shouldPersistDriverLocation(prior, baseInput, 15_000)).toBe(false);
    expect(
      shouldPersistDriverLocation(prior, { ...baseInput, latitude: baseInput.latitude + 0.00005 }, 30_000),
    ).toBe(false);
    expect(shouldPersistDriverLocation(prior, baseInput, 60_000)).toBe(true);
  });

  it('persists meaningful movement only after the minimum interval', () => {
    const prior = previous(0);
    const moved = { ...baseInput, latitude: baseInput.latitude + 0.00012 };
    expect(shouldPersistDriverLocation(prior, moved, 14_999)).toBe(false);
    expect(shouldPersistDriverLocation(prior, moved, 15_000)).toBe(true);
  });
});
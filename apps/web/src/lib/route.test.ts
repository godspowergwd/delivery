import { describe, expect, it } from 'vitest';
import { calculateRouteProgress, isAutomaticRerouteDue, type RoadRoute } from './route';

const route: RoadRoute = {
  coordinates: [[-0.31, 5.57], [-0.30, 5.57], [-0.30, 5.58]],
  distanceKm: 2.2,
  durationMin: 12,
  legs: [{
    distanceKm: 2.2,
    durationMin: 12,
    steps: [
      {
        instruction: 'Continue on Mallam Road',
        distanceKm: 1.1,
        durationMin: 6,
        location: [-0.31, 5.57],
        distanceFromStartKm: 0,
      },
      {
        instruction: 'Turn right onto Gbawe Road',
        distanceKm: 1.1,
        durationMin: 6,
        location: [-0.30, 5.57],
        distanceFromStartKm: 1.1,
      },
    ],
  }],
  road: true,
  provider: 'mapbox',
  steps: [
    {
      instruction: 'Continue on Mallam Road',
      distanceKm: 1.1,
      durationMin: 6,
      location: [-0.31, 5.57],
      distanceFromStartKm: 0,
    },
    {
      instruction: 'Turn right onto Gbawe Road',
      distanceKm: 1.1,
      durationMin: 6,
      location: [-0.30, 5.57],
      distanceFromStartKm: 1.1,
    },
  ],
};

describe('Mapbox route progress', () => {
  it('snaps the driver to route geometry and selects the next maneuver', () => {
    const progress = calculateRouteProgress(route, { lat: 5.57, lng: -0.305 });

    expect(progress.distanceFromStartKm).toBeGreaterThan(0.4);
    expect(progress.distanceFromStartKm).toBeLessThan(0.7);
    expect(progress.remainingDistanceKm).toBeGreaterThan(1.5);
    expect(progress.offRouteMeters).toBeLessThan(2);
    expect(progress.nextStep?.instruction).toBe('Turn right onto Gbawe Road');
  });

  it('measures a meaningful deviation instead of treating it as route progress', () => {
    const progress = calculateRouteProgress(route, { lat: 5.58, lng: -0.31 });

    expect(progress.offRouteMeters).toBeGreaterThan(500);
    expect(progress.remainingDurationMin).toBeGreaterThanOrEqual(0);
  });

  it('waits for repeated meaningful deviations and a cooldown before rerouting', () => {
    expect(isAutomaticRerouteDue(76, 1, 30_000)).toBe(false);
    expect(isAutomaticRerouteDue(75, 3, 30_000)).toBe(false);
    expect(isAutomaticRerouteDue(100, 2, 14_999)).toBe(false);
    expect(isAutomaticRerouteDue(100, 2, 15_000)).toBe(true);
  });
});
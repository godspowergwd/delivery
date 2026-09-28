import { describe, expect, it } from 'vitest';
import { buildManeuverAnnouncement, shouldSpeakManeuver } from './navigation-voice';

const step = {
  instruction: 'Turn left onto Gbawe Road',
  distanceKm: 0.1,
  durationMin: 1,
  location: [-0.31, 5.57] as [number, number],
  distanceFromStartKm: 1,
};

describe('voice maneuver announcements', () => {
  it('speaks real maneuver text and current distance inside the announce window', () => {
    expect(buildManeuverAnnouncement(step, 0.12)).toEqual({
      key: 'Turn left onto Gbawe Road|-0.31,5.57',
      text: 'Turn left onto Gbawe Road in 120 meters.',
    });
  });

  it('does not announce too early or without valid step data', () => {
    expect(buildManeuverAnnouncement(step, 0.251)).toBeNull();
    expect(buildManeuverAnnouncement(null, 0.1)).toBeNull();
    expect(buildManeuverAnnouncement(step, null)).toBeNull();
  });

  it('speaks each maneuver once and allows a different next maneuver', () => {
    const current = buildManeuverAnnouncement(step, 0.1);
    expect(shouldSpeakManeuver(current, null)).toBe(true);
    expect(shouldSpeakManeuver(current, current?.key ?? null)).toBe(false);
    expect(shouldSpeakManeuver({ key: 'Turn right|-0.30,5.57', text: 'Turn right in 100 meters.' }, current?.key ?? null)).toBe(true);
  });
});
import { describe, expect, it } from 'vitest';
import { compassHeadingFromReading } from './device-heading';

describe('device compass heading', () => {
  it('uses the iOS compass heading when available', () => {
    expect(compassHeadingFromReading({ alpha: 20, absolute: false, webkitCompassHeading: 275 })).toBe(275);
  });

  it('converts an absolute alpha reading to compass degrees', () => {
    expect(compassHeadingFromReading({ alpha: 270, absolute: true })).toBe(90);
    expect(compassHeadingFromReading({ alpha: 0, absolute: true })).toBe(0);
  });

  it('does not treat relative orientation as a compass heading', () => {
    expect(compassHeadingFromReading({ alpha: 90, absolute: false })).toBeNull();
    expect(compassHeadingFromReading({ alpha: null, absolute: true })).toBeNull();
  });
});
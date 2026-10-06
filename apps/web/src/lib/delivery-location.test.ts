import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  isValidDeliveryCoordinates,
  isConfirmedDeliveryLocation,
  readConfirmedDeliveryLocation,
  saveConfirmedDeliveryLocation,
  type ConfirmedDeliveryLocation,
} from './delivery-location';

const gpsLocation: ConfirmedDeliveryLocation = {
  latitude: 5.57741,
  longitude: -0.31041,
  originalLatitude: 5.57741,
  originalLongitude: -0.31041,
  address: 'Mallam Junction, Accra, Ghana',
  label: 'Mallam Junction',
  source: 'gps',
  confirmedAt: '2026-09-27T12:00:00.000Z',
};

afterEach(() => vi.unstubAllGlobals());

describe('confirmed delivery location', () => {
  it('requires finite, in-range, non-zero coordinates for delivery', () => {
    expect(isValidDeliveryCoordinates(5.57741, -0.31041)).toBe(true);
    expect(isValidDeliveryCoordinates(91, -0.31041)).toBe(false);
    expect(isValidDeliveryCoordinates(5.57741, 181)).toBe(false);
    expect(isValidDeliveryCoordinates(0, -0.31041)).toBe(false);
    expect(isValidDeliveryCoordinates(5.57741, 0)).toBe(false);
    expect(isValidDeliveryCoordinates(null, -0.31041)).toBe(false);
  });

  it('keeps GPS capture coordinates separate from the navigation destination', () => {
    expect(isConfirmedDeliveryLocation({
      ...gpsLocation,
      latitude: 5.5775,
      longitude: -0.3105,
    })).toBe(true);
  });

  it('accepts searched locations without an original GPS position', () => {
    expect(isConfirmedDeliveryLocation({
      ...gpsLocation,
      source: 'search',
      originalLatitude: null,
      originalLongitude: null,
    })).toBe(true);
  });

  it('rejects invalid coordinates, incomplete original pairs, and unknown sources', () => {
    expect(isConfirmedDeliveryLocation({ ...gpsLocation, latitude: 0, longitude: 0 })).toBe(false);
    expect(isConfirmedDeliveryLocation({ ...gpsLocation, originalLongitude: null })).toBe(false);
    expect(isConfirmedDeliveryLocation({ ...gpsLocation, source: 'address' })).toBe(false);
  });

  it('persists and restores one confirmed destination per customer', () => {
    const values = new Map<string, string>();
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
      removeItem: (key: string) => values.delete(key),
    });

    expect(saveConfirmedDeliveryLocation('customer-1', gpsLocation)).toBe(true);
    expect(readConfirmedDeliveryLocation('customer-1')).toEqual(gpsLocation);
    expect(readConfirmedDeliveryLocation('customer-2')).toBeNull();
  });
});

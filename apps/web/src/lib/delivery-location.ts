export type DeliveryLocationSource = 'gps' | 'search';

export interface ConfirmedDeliveryLocation {
  latitude: number;
  longitude: number;
  originalLatitude: number | null;
  originalLongitude: number | null;
  address: string;
  label: string;
  source: DeliveryLocationSource;
  confirmedAt: string;
}

const STORAGE_PREFIX = 'ds_confirmed_delivery_location_v1:';

function isCoordinatePair(latitude: unknown, longitude: unknown): boolean {
  return typeof latitude === 'number' &&
    typeof longitude === 'number' &&
    Number.isFinite(latitude) &&
    Number.isFinite(longitude) &&
    latitude >= -90 && latitude <= 90 &&
    longitude >= -180 && longitude <= 180 &&
    (latitude !== 0 || longitude !== 0);
}

export function isConfirmedDeliveryLocation(value: unknown): value is ConfirmedDeliveryLocation {
  if (typeof value !== 'object' || value === null) return false;
  const location = value as Partial<ConfirmedDeliveryLocation>;
  if (
    !isCoordinatePair(location.latitude, location.longitude) ||
    typeof location.address !== 'string' || !location.address.trim() ||
    typeof location.label !== 'string' || !location.label.trim() ||
    (location.source !== 'gps' && location.source !== 'search') ||
    typeof location.confirmedAt !== 'string' || !Number.isFinite(Date.parse(location.confirmedAt))
  ) {
    return false;
  }
  const hasOriginalLatitude = location.originalLatitude !== null && location.originalLatitude !== undefined;
  const hasOriginalLongitude = location.originalLongitude !== null && location.originalLongitude !== undefined;
  if (hasOriginalLatitude !== hasOriginalLongitude) return false;
  if (hasOriginalLatitude && !isCoordinatePair(location.originalLatitude, location.originalLongitude)) return false;
  return location.source !== 'gps' || hasOriginalLatitude;
}

function storageKey(userId: string): string {
  return `${STORAGE_PREFIX}${userId}`;
}

export function readConfirmedDeliveryLocation(userId: string | null | undefined): ConfirmedDeliveryLocation | null {
  if (!userId || typeof localStorage === 'undefined') return null;
  try {
    const stored = localStorage.getItem(storageKey(userId));
    if (!stored) return null;
    const parsed: unknown = JSON.parse(stored);
    return isConfirmedDeliveryLocation(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function saveConfirmedDeliveryLocation(
  userId: string | null | undefined,
  location: ConfirmedDeliveryLocation,
): boolean {
  if (!userId || !isConfirmedDeliveryLocation(location)) return false;
  try {
    localStorage.setItem(storageKey(userId), JSON.stringify(location));
    return true;
  } catch {
    return false;
  }
}

export function clearConfirmedDeliveryLocation(userId: string | null | undefined): void {
  if (!userId || typeof localStorage === 'undefined') return;
  try {
    localStorage.removeItem(storageKey(userId));
  } catch {
    // Storage failures must not crash checkout; confirmation remains in memory.
  }
}

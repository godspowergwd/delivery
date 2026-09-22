import type { LatLng } from './geo';
import type { OrderStatus } from './order-status';

/**
 * Live delivery tracking contracts.
 *
 * A driver's position is always produced by that driver's own device GPS and is
 * only ever exposed to: the driver, the customer of the active order, and the
 * administrators running the operation.
 */

/** How a tracked coordinate was obtained. */
export type CoordinateSource = 'gps' | 'estimated';

/** A driver's most recent device position. */
export interface DriverLocationDTO {
  driverId: string;
  driverName: string;
  latitude: number;
  longitude: number;
  /** Accuracy radius in metres as reported by the device. */
  accuracy: number | null;
  /** Heading in degrees, when the device reports it. */
  heading: number | null;
  /** Speed in metres per second, when the device reports it. */
  speed: number | null;
  isOnline: boolean;
  /** When the *device* recorded the fix. */
  recordedAt: string;
  /** When the server received it. */
  receivedAt: string;
}

/** A point the map draws: either captured by GPS or estimated from the address. */
export interface TrackingPoint {
  latitude: number;
  longitude: number;
  source: CoordinateSource;
  label: string;
}

/** Everything a live tracking screen needs, in one payload. */
export interface OrderTrackingDTO {
  orderId: string;
  orderNumber: string;
  status: OrderStatus;
  /** Customer destination: captured GPS when available, otherwise estimated. */
  destination: TrackingPoint;
  /** Where the order is prepared / collected. */
  restaurant: TrackingPoint;
  /** The assigned driver, or null while the order waits for a driver. */
  driver: {
    id: string;
    name: string;
    phone: string | null;
    location: DriverLocationDTO | null;
  } | null;
  /** True while the order is in a state the customer can watch on the map. */
  isLive: boolean;
  /** Straight-line distance from the driver to the destination, in km. */
  driverToDestinationKm: number | null;
  generatedAt: string;
}

/** Order states during which the customer can watch the driver move. */
export const TRACKING_ACTIVE_STATUSES: OrderStatus[] = ['READY', 'OUT_FOR_DELIVERY'];

/** A position older than this is shown as "last seen" instead of "live". */
export const LOCATION_STALE_MS = 90_000;

export function isLocationStale(recordedAt: string | null | undefined, now = Date.now()): boolean {
  if (!recordedAt) return true;
  const timestamp = new Date(recordedAt).getTime();
  if (Number.isNaN(timestamp)) return true;
  return now - timestamp > LOCATION_STALE_MS;
}

export function toLatLng(point: { latitude: number; longitude: number }): LatLng {
  return { lat: point.latitude, lng: point.longitude };
}

/** Payload a driver device publishes; validated again on the server. */
export interface DriverLocationInput {
  latitude: number;
  longitude: number;
  accuracy?: number | null;
  heading?: number | null;
  speed?: number | null;
  /** ISO timestamp from the device; the server falls back to its own clock. */
  recordedAt?: string | null;
}

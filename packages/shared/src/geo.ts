/**
 * Geographic primitives shared by the API and the web app.
 *
 * Waakye App delivers inside Malam / Gbawe, Accra, Ghana. MALAM_CENTER is the
 * warehouse focus for every map before a device has reported its position —
 * it is an *initial view*, never a substitute for real GPS data.
 */

export interface LatLng {
  lat: number;
  lng: number;
}

/** Mallam (Mallam Interchange), Greater Accra — the business home area. */
export const MALAM_CENTER: LatLng = { lat: 5.571264, lng: -0.284093 };

/** Central Accra, used as the fallback focus for the wider city. */
export const ACCRA_CENTER: LatLng = { lat: 5.6037, lng: -0.187 };

/** Neighbourhoods we deliver to, used for map framing and copy only. */
export const DELIVERY_ZONE = 'Malam / Gbawe, Accra';

/** Local delivery zoom: streets and landmarks visible, no continent. */
export const DEFAULT_MAP_ZOOM = 14;

/** Zoom used when following a moving driver. */
export const FOLLOW_MAP_ZOOM = 16;

const EARTH_KM = 6371;

function toRadians(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

function toDegrees(radians: number): number {
  return (radians * 180) / Math.PI;
}

export function isValidLatitude(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= -90 && value <= 90;
}

export function isValidLongitude(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= -180 && value <= 180;
}

export function isValidLatLng(value: { lat?: unknown; lng?: unknown } | null | undefined): boolean {
  return Boolean(value) && isValidLatitude(value?.lat) && isValidLongitude(value?.lng);
}

/** Haversine distance in kilometres. */
export function distanceKm(from: LatLng, to: LatLng): number {
  const dLat = toRadians(to.lat - from.lat);
  const dLng = toRadians(to.lng - from.lng);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRadians(from.lat)) * Math.cos(toRadians(to.lat)) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
  return 2 * EARTH_KM * Math.asin(Math.sqrt(a));
}

/** Compass bearing (degrees) from one point to another; rotates the driver marker. */
export function bearingDegrees(from: LatLng, to: LatLng): number {
  const dLng = toRadians(to.lng - from.lng);
  const y = Math.sin(dLng) * Math.cos(toRadians(to.lat));
  const x =
    Math.cos(toRadians(from.lat)) * Math.sin(toRadians(to.lat)) -
    Math.sin(toRadians(from.lat)) * Math.cos(toRadians(to.lat)) * Math.cos(dLng);
  return (toDegrees(Math.atan2(y, x)) + 360) % 360;
}

/** "850 m" / "3.4 km" — never "0.0 km". */
export function formatDistance(distanceKilometres: number): string {
  if (!Number.isFinite(distanceKilometres) || distanceKilometres <= 0) return '0 m';
  if (distanceKilometres < 1) return `${Math.max(10, Math.round(distanceKilometres * 1000))} m`;
  return `${distanceKilometres.toFixed(1)} km`;
}

/** ETA text for a remaining distance at city speed (~22 km/h). */
export function etaText(distanceKilometres: number, speedKmh = 22): string {
  if (!Number.isFinite(distanceKilometres) || distanceKilometres <= 0) return 'Arriving';
  const minutes = Math.max(1, Math.round((distanceKilometres / Math.max(1, speedKmh)) * 60));
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest === 0 ? `${hours} hr` : `${hours} hr ${rest} min`;
}

/** Coarse movement bucket copied onto every stored position ("speed" clue). */
export type MovementMode = 'stationary' | 'walking' | 'driving';

export function movementMode(speedMetresPerSecond: number | null | undefined): MovementMode {
  const speed = Number.isFinite(speedMetresPerSecond as number) ? (speedMetresPerSecond as number) : 0;
  if (speed < 0.7) return 'stationary';
  if (speed < 3) return 'walking';
  return 'driving';
}

/**
 * A suggestion returned by the address search endpoint.
 * Consumers show the label in the dropdown and store latitude/longitude
 * with the order when the customer confirms.
 */
export interface AddressSuggestion {
  label: string;
  address: string;
  latitude: number;
  longitude: number;
  placeId: string;
  type: string;
}

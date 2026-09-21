/**
 * Shared live-map foundation (MapLibre GL + keyless public tiles).
 *
 * The backend has no GPS coordinates or tracking endpoint, so this module
 * provides the map style, OSRM road routing (with offline fallback) and
 * deterministic simulated driver movement. When real GPS fields land, only
 * the position source needs swapping.
 */

export interface LatLng {
  lat: number;
  lng: number;
}

/** Default centre of the ONYX delivery zone (Accra, Osu). */
export const ACCRA_CENTER: LatLng = { lat: 5.555, lng: -0.1963 };

/** Kitchen anchor used when an order has no coordinates yet. */
export const KITCHEN_ANCHOR: LatLng = { lat: 5.6037, lng: -0.187 };

const MAP_STYLE_URL = 'https://tiles.openfreemap.org/styles/liberty';
const OSRM_ROUTE_URL = 'https://router.project-osrm.org/route/v1/driving';

function toFixed6(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
}

/** Deterministic pseudo-geocode: any address string -> a stable Accra point. */
export function geocodeAddress(address: string | null | undefined, area?: string | null): LatLng {
  const text = `${address ?? ''} ${area ?? ''}`.trim().toLowerCase();
  if (!text) return { ...KITCHEN_ANCHOR };
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  const spread = (seed: number): number => {
    const value = Math.sin(seed * 127.1 + 311.7) * 43758.5453;
    return value - Math.floor(value);
  };
  return {
    lat: toFixed6(KITCHEN_ANCHOR.lat + (spread(hash) - 0.5) * 0.064),
    lng: toFixed6(KITCHEN_ANCHOR.lng + (spread(hash ^ 0x9e3779b9) - 0.5) * 0.064),
  };
}

/** Haversine distance in kilometres. */
export function distanceKm(from: LatLng, to: LatLng): number {
  const earthKm = 6371;
  const toRad = (degrees: number): number => (degrees * Math.PI) / 180;
  const dLat = toRad(to.lat - from.lat);
  const dLng = toRad(to.lng - from.lng);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(from.lat)) * Math.cos(toRad(to.lat)) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
  return 2 * earthKm * Math.asin(Math.sqrt(a));
}

/** ETA text for a remaining distance at city speed (~22 km/h). */
export function etaText(distanceKilometres: number, speedKmh = 22): string {
  const minutes = Math.max(1, Math.round((distanceKilometres / speedKmh) * 60));
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest === 0 ? `${hours} hr` : `${hours} hr ${rest} min`;
}

export function formatDistance(distanceKilometres: number): string {
  if (distanceKilometres < 1) return `${Math.max(50, Math.round(distanceKilometres * 1000))} m`;
  return `${distanceKilometres.toFixed(1)} km`;
}

export function mapStyleUrl(): string {
  return MAP_STYLE_URL;
}
export interface RoadRoute {
  coordinates: Array<[number, number]>;
  distanceKm: number;
  durationMin: number;
  road: boolean;
}

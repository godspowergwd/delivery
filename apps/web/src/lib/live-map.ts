/**
 * Live-map foundation: Mapbox GL style + shared geo maths.
 *
 * All distance / ETA / bearing maths lives in `@delivery/shared` so the API and
 * the app always agree. This module only adds what is web specific: the tile
 * style URL and the address *estimate* used when an order has no GPS capture.
 */
import {
  ACCRA_CENTER,
  DEFAULT_MAP_ZOOM,
  MALAM_CENTER,
  bearingDegrees,
  distanceKm,
  etaText,
  formatDistance,
  type LatLng,
} from '@delivery/shared';
export {
  ACCRA_CENTER,
  DEFAULT_MAP_ZOOM,
  MALAM_CENTER,
  bearingDegrees,
  distanceKm,
  etaText,
  formatDistance,
  type LatLng,
};
/**
 * Initial geographic focus: Mallam, Greater Accra. Real device GPS always wins
 * once the browser grants permission — this is a view centre, never a position.
 */
export const KITCHEN_ANCHOR: LatLng = { ...MALAM_CENTER };
/**
 * Basemap styles now come from the single map configuration module
 * (`lib/map-config.ts`), which supports Mapbox / MapTiler / keyless
 * OpenFreeMap with an automatic fallback style.
 */
import { mapAttributionText, mapFallbackStyleUrl, MAP_PROVIDER, mapStyleUrl } from './map-config';
export { mapAttributionText, mapFallbackStyleUrl, MAP_PROVIDER, mapStyleUrl };
function toFixed6(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
}
/**
 * Deterministic *estimate* for a typed address, used only to preview a delivery
 * area before the customer shares their GPS. It is never presented as a live
 * position: every consumer shows the "approx." hint next to it.
 */
export function estimateAddressCoordinates(
  address: string | null | undefined,
  area?: string | null,
): LatLng {
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
    lat: toFixed6(KITCHEN_ANCHOR.lat + (spread(hash) - 0.5) * 0.06),
    lng: toFixed6(KITCHEN_ANCHOR.lng + (spread(hash ^ 0x9e3779b9) - 0.5) * 0.06),
  };
}
export interface RoadRoute {
  coordinates: Array<[number, number]>;
  distanceKm: number;
  durationMin: number;
  road: boolean;
}

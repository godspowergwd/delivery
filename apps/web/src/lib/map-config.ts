/**
 * Map configuration — the single source of truth for the basemap.
 *
 * Provider priority (first configured wins):
 *   1. Mapbox GL styles  (VITE_MAPBOX_TOKEN)      — production-grade, branded.
 *   2. MapTiler styles   (VITE_MAPTILER_KEY)      — production-grade alternative.
 *   3. OpenFreeMap       (no key)                 — keyless default so the app is
 *      always a real interactive vector map, in dev and in deployments without
 *      a provider account.
 *
 * Security: only *public* browser tokens belong here (they are part of the
 * style URL by design). Private server secrets never live in the frontend.
 */

export type MapProvider = 'mapbox' | 'maptiler' | 'openfreemap';

const MAPBOX_TOKEN = (import.meta.env.VITE_MAPBOX_TOKEN as string | undefined)?.trim() || null;
const MAPTILER_KEY = (import.meta.env.VITE_MAPTILER_KEY as string | undefined)?.trim() || null;

export const MAP_PROVIDER: MapProvider = MAPBOX_TOKEN
  ? 'mapbox'
  : MAPTILER_KEY
    ? 'maptiler'
    : 'openfreemap';

/** Human-readable provider name (diagnostics + the map fallback card). */
export const MAP_PROVIDER_LABEL: Record<MapProvider, string> = {
  mapbox: 'Mapbox',
  maptiler: 'MapTiler',
  openfreemap: 'OpenFreeMap',
};

/**
 * Primary basemap style: road-forward, POI-rich and readable under a moving
 * marker — the look modern delivery apps use.
 */
export function mapStyleUrl(): string {
  if (MAP_PROVIDER === 'mapbox') {
    return `https://api.mapbox.com/styles/v1/mapbox/navigation-day-v1?access_token=${MAPBOX_TOKEN}`;
  }
  if (MAP_PROVIDER === 'maptiler') {
    return `https://api.maptiler.com/maps/streets-v2/style.json?key=${MAPTILER_KEY}`;
  }
  return 'https://tiles.openfreemap.org/styles/bright';
}

/**
 * Keyless fallback style. If the configured provider is unreachable (offline
 * host, blocked domain, expired key) the map switches to this instead of
 * showing an empty canvas.
 */
export function mapFallbackStyleUrl(): string {
  if (MAP_PROVIDER === 'openfreemap') return 'https://tiles.openfreemap.org/styles/positron';
  return 'https://tiles.openfreemap.org/styles/bright';
}

/**
 * The public Mapbox token the GL engine authenticates `mapbox://` resources
 * with (null when the app runs keyless on OpenFreeMap). Public browser tokens
 * only — this value ships to the client by design.
 */
export function mapboxAccessToken(): string | null {
  return MAPBOX_TOKEN;
}


/** Attribution line shown under the map when the provider requires one. */
export function mapAttributionText(): string {
  return `© ${MAP_PROVIDER_LABEL[MAP_PROVIDER]} · OpenStreetMap contributors`;
}
/**
 * Mapbox GL engine loader.
 *
 * The renderer is imported lazily (and exactly once) so the map bundle never
 * blocks first paint or the PWA install: screens pull it in only when they
 * actually mount a map.
 *
 * The basemap itself is keyless by default (OpenFreeMap vector tiles, see
 * `map-config.ts`). A public `VITE_MAPBOX_TOKEN` is only needed when the app
 * is configured to use the Mapbox-hosted style — it authenticates the
 * `mapbox://` URLs inside that style (tiles, glyphs, sprites), nothing else.
 */

import { mapboxAccessToken } from './map-config';

export type MapModule = typeof import('mapbox-gl');
/** The bundle's default export carries every runtime member (Map, Marker, …). */
export type MapboxGL = MapModule['default'];
/** Instance types for the lazily-imported engine (type-only, fully erased). */
export type GLMap = InstanceType<MapboxGL['Map']>;
export type GLMarker = InstanceType<MapboxGL['Marker']>;

let enginePromise: Promise<MapboxGL> | null = null;

/** Loads Mapbox GL JS plus its stylesheet; the promise is cached per session. */
export function loadMapGL(): Promise<MapboxGL> {
  if (!enginePromise) {
    enginePromise = (async () => {
      await import('mapbox-gl/dist/mapbox-gl.css');
      const module = await import('mapbox-gl');
      // CommonJS interop: the module namespace exposes the bundle as `default`.
      const mapboxgl = (module as { default?: MapboxGL }).default ?? (module as unknown as MapboxGL);
      const token = mapboxAccessToken();
      if (token) mapboxgl.accessToken = token;
      return mapboxgl;
    })();
    // A failed load (offline first paint) must be retryable on the next mount.
    void enginePromise.catch(() => {
      enginePromise = null;
    });
  }
  return enginePromise;
}

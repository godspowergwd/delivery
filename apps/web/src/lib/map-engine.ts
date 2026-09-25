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

/* -------------------------------------------------------------------------------------------
 * Style compatibility
 *
 * The keyless OpenFreeMap styles (bright / positron / liberty) are written for MapLibre's
 * tolerant expression evaluation, while Mapbox GL JS v3 type-checks strictly. Two concrete
 * mismatches surface as a console error per tile, per feature:
 *
 *   1. `["<=", ["get","ref_length"], 6]` — the compiler asserts the property is a number,
 *      so every feature that lacks `ref_length` throws
 *      `The expression ["get","ref_length"] evaluated to null but was expected to be of type number`
 *      (three highway-shield layers do this on every tile).
 *   2. The styles' sprite omits several icon names their own POI layers request
 *      (`recycling`, `office`, `gate`, `swimming_pool`, `sports_centre`), so every tile logs
 *      `Image "…" could not be loaded`.
 *
 * Both are neutralised below without changing what renders.
 * ---------------------------------------------------------------------------------------- */

/** Comparison operators whose missing-property read Mapbox turns into a hard error. */
const NUMERIC_OPS = new Set(['<', '<=', '>', '>=', '==']);
/** Sentinel that fails `<` / `<=` / `==` gates (a failed evaluation also matched nothing). */
const MISSING_HIGHER = 999999999;
/** Sentinel that fails `>` / `>=` gates. */
const MISSING_LOWER = -999999999;

function sentinelFor(op: string): number {
  return op === '>' || op === '>=' ? MISSING_LOWER : MISSING_HIGHER;
}

/** `["get", K]` — or the asserted `["number", ["get", K]]` the compiler hands back. */
function propertyRead(node: unknown): string | null {
  if (!Array.isArray(node) || node.length !== 2) return null;
  if (node[0] === 'get' && typeof node[1] === 'string') return node[1];
  if (node[0] === 'number') return propertyRead(node[1]);
  return null;
}

/**
 * Makes numeric property comparisons in a (filter) expression null-safe by
 * replacing the raw read with `["coalesce", ["get", KEY], <sentinel>]`:
 *
 *   missing property -> sentinel -> the gate rejects the feature, exactly like
 *   the failed evaluation did, but without throwing.
 *
 * Only `<,<=,>,>=,==` against a numeric literal are touched (`!=`, string
 * comparisons and everything else keep their current behaviour). The input is
 * never mutated: unchanged branches are shared so callers can detect a rewrite
 * by reference identity (`patched !== original`).
 */
export function relaxNumericFilters(value: unknown): unknown {
  if (!Array.isArray(value)) return value;
  const op = value[0];
  if (typeof op === 'string' && NUMERIC_OPS.has(op) && value.length === 3 && typeof value[2] === 'number') {
    // Legacy filter form: `["<=", "ref_length", 6]`.
    if (typeof value[1] === 'string') {
      return [op, ['coalesce', ['get', value[1]], sentinelFor(op)], value[2]];
    }
    // Expression form (and the asserted form, should it ever be serialized back).
    const key = propertyRead(value[1]);
    if (key) return [op, ['coalesce', ['get', key], sentinelFor(op)], value[2]];
  }
  let changed = false;
  const next = value.map((child) => {
    const patched = relaxNumericFilters(child);
    if (patched !== child) changed = true;
    return patched;
  });
  return changed ? next : value;
}

/**
 * Rewrites the strict numeric filters of a *loaded* style in place (via
 * `setFilter`). Call it from `style.load`: that event fires before the first
 * tile request is dispatched, so the tile worker never sees the strict form.
 * Returns how many filters were rewritten.
 */
export function relaxStyleFilters(map: GLMap): number {
  let spec: { layers?: unknown[] };
  try {
    spec = map.getStyle() as unknown as { layers?: unknown[] };
  } catch {
    return 0;
  }
  let rewritten = 0;
  for (const entry of spec.layers ?? []) {
    const layer = entry as { id?: unknown; filter?: unknown };
    if (typeof layer.id !== 'string' || !Array.isArray(layer.filter)) continue;
    const patched = relaxNumericFilters(layer.filter);
    if (patched === layer.filter) continue;
    try {
      map.setFilter(layer.id, patched as Parameters<GLMap['setFilter']>[1]);
      rewritten += 1;
    } catch {
      // A filter Mapbox rejects must never break the surrounding style.
    }
  }
  return rewritten;
}

/**
 * `styleimagemissing` listener: registers a fully transparent 1×1 pixel under
 * the missing id. Nothing was drawn for these icons before either — but without
 * a listener Mapbox logs an error for every tile that references one.
 */
export function handleMissingStyleImage(map: GLMap, event: unknown): void {
  const id = typeof event === 'string' ? event : (event as { id?: unknown } | null)?.id;
  if (typeof id !== 'string' || id.length === 0 || map.hasImage(id)) return;
  map.addImage(id, { width: 1, height: 1, data: new Uint8Array(4) });
}

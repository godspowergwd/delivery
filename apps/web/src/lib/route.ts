import { distanceKm, type LatLng, type RoadRoute } from './live-map';
import { mapboxAccessToken } from './map-config';

export type { RoadRoute };

const OSRM_ROUTE_URL = 'https://router.project-osrm.org/route/v1/driving';
const ROUTE_FETCH_TIMEOUT_MS = 9_000;

/** The public token the Directions API request uses (null = Mapbox routing off). */
const directionsToken = mapboxAccessToken();

function straightLineRoute(from: LatLng, to: LatLng, steps = 24): RoadRoute {
  const coordinates: Array<[number, number]> = [];
  for (let index = 0; index <= steps; index += 1) {
    const t = index / steps;
    coordinates.push([from.lng + (to.lng - from.lng) * t, from.lat + (to.lat - from.lat) * t]);
  }
  const distance = distanceKm(from, to);
  return {
    coordinates,
    distanceKm: distance,
    durationMin: Math.max(1, Math.round((distance / 22) * 60)),
    road: false,
    provider: 'straight',
  };
}

interface DirectionsRoutePayload {
  geometry?: { coordinates?: Array<[number, number]> };
  distance?: number;
  duration?: number;
}

function roadRouteFromPayload(
  route: DirectionsRoutePayload | undefined,
  from: LatLng,
  provider: RoadRoute['provider'],
): RoadRoute {
  const coordinates = route?.geometry?.coordinates;
  if (!coordinates || coordinates.length < 2) throw new Error('empty route');
  return {
    coordinates,
    distanceKm: (route?.distance ?? distanceKm(from, from) * 1000) / 1000,
    durationMin: Math.max(1, Math.round((route?.duration ?? 0) / 60)),
    road: true,
    provider,
  };
}

function fetchJsonWithTimeout(url: string, signal: AbortSignal | undefined): Promise<Response> {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), ROUTE_FETCH_TIMEOUT_MS);
  const onAbort = (): void => controller.abort();
  signal?.addEventListener('abort', onAbort, { once: true });
  return fetch(url, { signal: controller.signal }).finally(() => {
    window.clearTimeout(timer);
    signal?.removeEventListener('abort', onAbort);
  });
}

/**
 * Real road route for the delivery leg.
 *
 * Provider order (first success wins; failures fall through silently):
 *   1. Mapbox Directions API — only when `VITE_MAPBOX_TOKEN` is configured.
 *   2. OSRM demo server (keyless, shared quota — used as the live fallback).
 *   3. A straight line between the two real GPS points (never invented pins).
 */
export async function fetchRoadRoute(from: LatLng, to: LatLng, signal?: AbortSignal): Promise<RoadRoute> {
  // 1. Mapbox Directions API — the production router. `geometries=geojson`
  //    keeps coordinates in [lng, lat] order, exactly what the GeoJSON source
  //    below renders, and `overview=full` returns the whole leg (not just the
  //    next manoeuvre). Skipped entirely without a token — never call the API
  //    with an empty key, that only burns quota for a guaranteed 401.
  if (directionsToken) {
    try {
      const url =
        `https://api.mapbox.com/directions/v5/mapbox/driving/${from.lng},${from.lat};${to.lng},${to.lat}` +
        `?geometries=geojson&overview=full&access_token=${directionsToken}`;
      const response = await fetchJsonWithTimeout(url, signal);
      if (!response.ok) throw new Error(`Mapbox directions ${response.status}`);
      const data = (await response.json()) as { routes?: DirectionsRoutePayload[] };
      if (import.meta.env.DEV) {
        window.console.debug('[route] mapbox directions response', {
          routes: data.routes?.length ?? 0,
          firstPointCount: data.routes?.[0]?.geometry?.coordinates?.length ?? 0,
        });
      }
      return roadRouteFromPayload(data.routes?.[0], from, 'mapbox');
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') throw error;
      window.console.warn('[route] mapbox directions failed, falling back to OSRM', error);
    }
  }

  // 2. OSRM demo server (keyless fallback — same [lng, lat] GeoJSON contract).
  try {
    const url =
      `${OSRM_ROUTE_URL}/${from.lng},${from.lat};${to.lng},${to.lat}` +
      '?overview=full&geometries=geojson&annotations=false';
    const response = await fetchJsonWithTimeout(url, signal);
    if (!response.ok) throw new Error(`OSRM ${response.status}`);
    const data = (await response.json()) as { routes?: DirectionsRoutePayload[] };
    if (import.meta.env.DEV) {
      window.console.debug('[route] osrm response', {
        routes: data.routes?.length ?? 0,
        firstPointCount: data.routes?.[0]?.geometry?.coordinates?.length ?? 0,
      });
    }
    return roadRouteFromPayload(data.routes?.[0], from, 'osrm');
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error;
    window.console.warn('[route] osrm failed, falling back to a straight leg', error);
  }

  // 3. Straight leg between the two real fixes — drawn, never hidden.
  return straightLineRoute(from, to);
}

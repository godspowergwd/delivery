import { AppError } from '../lib/errors';
import { logger } from '../lib/logger';
import { mapboxMockEnabled } from '../config/env';

const MAPBOX_API = 'https://api.mapbox.com';
const MAPBOX_TIMEOUT_MS = 8_000;

export interface MapboxAddressSuggestion {
  label: string;
  address: string;
  latitude: number;
  longitude: number;
  placeId: string;
  type: string;
}

export interface MapboxRoadRoute {
  coordinates: Array<[number, number]>;
  distanceKm: number;
  durationMin: number;
  legs: Array<{
    distanceKm: number;
    durationMin: number;
    steps: MapboxRouteStep[];
  }>;
  steps: Array<{
    instruction: string;
    distanceKm: number;
    durationMin: number;
    location: [number, number];
    distanceFromStartKm: number;
  }>;
  road: true;
  provider: 'mapbox';
}

export interface MapboxRouteStep {
  instruction: string;
  distanceKm: number;
  durationMin: number;
  location: [number, number];
  distanceFromStartKm: number;
}

interface MapboxFeature {
  id?: string;
  text?: string;
  place_name?: string;
  center?: [number, number];
  place_type?: string[];
}

interface MapboxRoute {
  geometry?: { coordinates?: Array<[number, number]> };
  distance?: number;
  duration?: number;
  legs?: Array<{
    distance?: number;
    duration?: number;
    steps?: Array<{
      distance?: number;
      duration?: number;
      maneuver?: { instruction?: string; location?: [number, number] };
    }>;
  }>;
}

let missingTokenLogged = false;

/**
 * Mock map mode (development and test only).
 *
 * The mock flag is read from the configuration, which itself refuses to enable
 * it when NODE_ENV=production, so a load test can simulate hundreds of map
 * lookups without spending a single unit of Mapbox quota and a production
 * deployment can never accidentally answer from synthetic data.
 */
function mockEnabled(): boolean {
  return mapboxMockEnabled;
}

/** Deterministic synthetic address for a coordinate, used only by mock mode. */
function mockAddress(latitude: number, longitude: number): MapboxAddressSuggestion {
  const round = (value: number): number => Math.round(value * 1e6) / 1e6;
  const label = `Mock address ${Math.abs(Math.round(latitude * 1000))}-${Math.abs(Math.round(longitude * 1000))}`;
  return {
    label,
    address: `${label}, Mallam, Accra, Ghana`,
    latitude: round(latitude),
    longitude: round(longitude),
    placeId: `mock:${round(longitude)},${round(latitude)}`,
    type: 'address',
  };
}

/** Synthetic road route between two points, used only by mock mode. */
function mockRoute(
  from: { latitude: number; longitude: number },
  to: { latitude: number; longitude: number },
): MapboxRoadRoute {
  const coordinates: Array<[number, number]> = [
    [from.longitude, from.latitude],
    [
      (from.longitude + to.longitude) / 2,
      (from.latitude + to.latitude) / 2,
    ],
    [to.longitude, to.latitude],
  ];
  const distanceKm = Math.max(
    0.2,
    distanceBetweenKm(from.latitude, from.longitude, to.latitude, to.longitude),
  );
  const durationMin = Math.max(1, Math.round((distanceKm / 30) * 60));
  const steps: MapboxRouteStep[] = [
    {
      instruction: 'Head towards the delivery address (mock route)',
      distanceKm,
      durationMin,
      location: [from.longitude, from.latitude],
      distanceFromStartKm: 0,
    },
  ];
  return {
    coordinates,
    distanceKm,
    durationMin,
    legs: [{ distanceKm, durationMin, steps }],
    steps,
    road: true,
    provider: 'mapbox',
  };
}

function distanceBetweenKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const earth = 6_371;
  const toRad = (degrees: number): number => (degrees * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * earth * Math.asin(Math.sqrt(a));
}

function accessToken(): string {
  const token = process.env.MAPBOX_ACCESS_TOKEN?.trim() || process.env.MAPBOX_TOKEN?.trim();
  if (!token) {
    if (!missingTokenLogged) {
      missingTokenLogged = true;
      logger.error('[mapbox] server access token is missing', {
        expectedVariables: ['MAPBOX_ACCESS_TOKEN', 'MAPBOX_TOKEN'],
      });
    }
    throw new AppError(503, 'MAPBOX_TOKEN_MISSING', 'Mapbox routing is not configured on the server.');
  }
  return token;
}

async function fetchMapbox(url: URL, operation: string): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), MAPBOX_TIMEOUT_MS);
  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) {
      logger.error('[mapbox] upstream request failed', {
        operation,
        status: response.status,
        requestId: response.headers?.get?.('x-request-id') ?? null,
      });
      throw new AppError(502, 'MAPBOX_UPSTREAM_ERROR', 'Mapbox is temporarily unable to provide directions.');
    }
    return response;
  } catch (error) {
    if (error instanceof AppError) throw error;
    logger.error('[mapbox] upstream request could not complete', {
      operation,
      timedOut: controller.signal.aborted,
      errorType: error instanceof Error ? error.name : 'UnknownError',
    });
    throw new AppError(
      controller.signal.aborted ? 504 : 502,
      controller.signal.aborted ? 'MAPBOX_TIMEOUT' : 'MAPBOX_NETWORK_ERROR',
      controller.signal.aborted
        ? 'Mapbox directions timed out. Please try again.'
        : 'Mapbox directions are temporarily unreachable.',
    );
  } finally {
    clearTimeout(timer);
  }
}

async function readMapboxJson<T>(response: Response, operation: string): Promise<T> {
  try {
    return (await response.json()) as T;
  } catch (error) {
    logger.error('[mapbox] upstream returned invalid JSON', {
      operation,
      errorType: error instanceof Error ? error.name : 'UnknownError',
    });
    throw new AppError(502, 'MAPBOX_INVALID_RESPONSE', 'Mapbox returned an unreadable directions response.');
  }
}

export async function searchMapboxAddresses(query: string): Promise<MapboxAddressSuggestion[]> {
  const clean = query.trim();
  if (clean.length < 3) return [];

  if (mockEnabled()) {
    // Deterministic, Ghana-valid coordinates: plenty for load testing without
    // ever leaving the delivery region the app filters on.
    let hash = 2166136261;
    for (let index = 0; index < clean.length; index += 1) {
      hash ^= clean.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
    const unit = (hash >>> 0) / 4_294_967_295; // 0..1
    return Array.from({ length: 5 }, (_value, index) =>
      mockAddress(5.53 + unit * 0.1 + index * 0.003, -0.37 + unit * 0.08 + index * 0.003),
    );
  }

  const url = new URL(`${MAPBOX_API}/geocoding/v5/mapbox.places/${encodeURIComponent(clean)}.json`);
  url.searchParams.set('access_token', accessToken());
  url.searchParams.set('autocomplete', 'true');
  url.searchParams.set('country', 'GH');
  url.searchParams.set('limit', '6');
  url.searchParams.set('proximity', '-0.284093,5.571264');
  url.searchParams.set('types', 'address,poi,place,neighborhood,locality');

  const response = await fetchMapbox(url, 'geocoding search');
  const payload = await readMapboxJson<{ features?: MapboxFeature[] }>(response, 'geocoding search');
  return (payload.features ?? []).flatMap((feature) => {
    const [longitude, latitude] = feature.center ?? [];
    const address = feature.place_name?.trim();
    if (
      typeof longitude !== 'number' ||
      typeof latitude !== 'number' ||
      !Number.isFinite(longitude) ||
      !Number.isFinite(latitude) ||
      !address
    ) {
      return [];
    }
    return [{
      label: feature.text?.trim() || address,
      address,
      latitude,
      longitude,
      placeId: feature.id || `${longitude},${latitude}`,
      type: feature.place_type?.[0] || 'place',
    }];
  });
}

export async function reverseMapboxAddress(
  latitude: number,
  longitude: number,
): Promise<MapboxAddressSuggestion> {
  if (mockEnabled()) return mockAddress(latitude, longitude);

  const url = new URL(
    `${MAPBOX_API}/geocoding/v5/mapbox.places/${longitude},${latitude}.json`,
  );
  url.searchParams.set('access_token', accessToken());
  url.searchParams.set('country', 'GH');
  url.searchParams.set('limit', '1');

  const response = await fetchMapbox(url, 'reverse geocoding');
  const payload = await readMapboxJson<{ features?: MapboxFeature[] }>(response, 'reverse geocoding');
  const feature = payload.features?.[0];
  const address = feature?.place_name?.trim();
  if (!feature || !address) {
    throw new AppError(404, 'ADDRESS_NOT_FOUND', 'No readable address was found for this location.');
  }
  return {
    label: feature.text?.trim() || address,
    address,
    latitude,
    longitude,
    placeId: feature.id || `${longitude},${latitude}`,
    type: feature.place_type?.[0] || 'address',
  };
}

export async function getMapboxRoadRoute(
  from: { latitude: number; longitude: number },
  to: { latitude: number; longitude: number },
): Promise<MapboxRoadRoute> {
  if (mockEnabled()) return mockRoute(from, to);

  const url = new URL(
    `${MAPBOX_API}/directions/v5/mapbox/driving/${from.longitude},${from.latitude};${to.longitude},${to.latitude}`,
  );
  url.searchParams.set('access_token', accessToken());
  url.searchParams.set('geometries', 'geojson');
  url.searchParams.set('overview', 'full');
  url.searchParams.set('steps', 'true');

  const response = await fetchMapbox(url, 'driving directions');
  const payload = await readMapboxJson<{ routes?: MapboxRoute[] }>(response, 'driving directions');
  const route = payload.routes?.[0];
  const coordinates = route?.geometry?.coordinates;
  if (
    !route || !Array.isArray(coordinates) ||
    coordinates.length < 2 ||
    coordinates.some((coordinate) =>
      !Array.isArray(coordinate) || coordinate.length < 2 ||
      !Number.isFinite(coordinate[0]) || !Number.isFinite(coordinate[1]) ||
      coordinate[0] < -180 || coordinate[0] > 180 || coordinate[1] < -90 || coordinate[1] > 90)
  ) {
    throw new AppError(404, 'NO_ROUTE', 'No drivable route was found for these locations.');
  }
  if (
    typeof route.distance !== 'number' || !Number.isFinite(route.distance) || route.distance <= 0 ||
    typeof route.duration !== 'number' || !Number.isFinite(route.duration) || route.duration < 0
  ) {
    throw new AppError(502, 'INVALID_ROUTE', 'Mapbox returned incomplete route details.');
  }
  let distanceFromStartKm = 0;
  const legs = (route.legs ?? []).map((leg) => {
    let legDistanceKm = 0;
    let legDurationMin = 0;
    const steps: MapboxRouteStep[] = (leg.steps ?? []).flatMap((step) => {
      const instruction = step.maneuver?.instruction?.trim();
      const location = step.maneuver?.location;
      const distance = step.distance;
      const duration = step.duration;
      if (
        !instruction || !location || location.length !== 2 ||
        !Number.isFinite(location[0]) || !Number.isFinite(location[1]) ||
        typeof distance !== 'number' || !Number.isFinite(distance) ||
        typeof duration !== 'number' || !Number.isFinite(duration)
      ) return [];
      const normalized = {
        instruction,
        distanceKm: Math.max(0, distance) / 1_000,
        durationMin: Math.max(0, duration) / 60,
        location,
        distanceFromStartKm: distanceFromStartKm + legDistanceKm,
      };
      legDistanceKm += normalized.distanceKm;
      legDurationMin += normalized.durationMin;
      return [normalized];
    });
    const distanceKm = typeof leg.distance === 'number' && Number.isFinite(leg.distance)
      ? Math.max(0, leg.distance) / 1_000
      : legDistanceKm;
    const durationMin = typeof leg.duration === 'number' && Number.isFinite(leg.duration)
      ? Math.max(0, leg.duration) / 60
      : legDurationMin;
    distanceFromStartKm += distanceKm;
    return { distanceKm, durationMin, steps };
  });
  const steps = legs.flatMap((leg) => leg.steps);
  return {
    coordinates,
    distanceKm: route.distance / 1_000,
    durationMin: Math.max(1, Math.round(route.duration / 60)),
    legs,
    steps,
    road: true,
    provider: 'mapbox',
  };
}
import { AppError } from '../lib/errors';
import { logger } from '../lib/logger';

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
      message: error instanceof Error ? error.message : String(error),
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
      message: error instanceof Error ? error.message : String(error),
    });
    throw new AppError(502, 'MAPBOX_INVALID_RESPONSE', 'Mapbox returned an unreadable directions response.');
  }
}

export async function searchMapboxAddresses(query: string): Promise<MapboxAddressSuggestion[]> {
  const clean = query.trim();
  if (clean.length < 3) return [];

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
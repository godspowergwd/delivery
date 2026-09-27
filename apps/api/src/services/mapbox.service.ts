import { AppError } from '../lib/errors';

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
    steps?: Array<{
      distance?: number;
      duration?: number;
      maneuver?: { instruction?: string; location?: [number, number] };
    }>;
  }>;
}

function accessToken(): string {
  const token = process.env.MAPBOX_ACCESS_TOKEN?.trim() || process.env.MAPBOX_TOKEN?.trim();
  if (!token) {
    throw new AppError(503, 'MAPBOX_UNAVAILABLE', 'Map search and routing are not configured.');
  }
  return token;
}

async function fetchMapbox(url: URL): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), MAPBOX_TIMEOUT_MS);
  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) {
      throw new AppError(502, 'MAPBOX_UNAVAILABLE', 'Map search or routing is temporarily unavailable.');
    }
    return response;
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new AppError(502, 'MAPBOX_UNAVAILABLE', 'Map search or routing is temporarily unavailable.');
  } finally {
    clearTimeout(timer);
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

  const response = await fetchMapbox(url);
  const payload = (await response.json()) as { features?: MapboxFeature[] };
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

  const response = await fetchMapbox(url);
  const payload = (await response.json()) as { features?: MapboxFeature[] };
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

  const response = await fetchMapbox(url);
  const payload = (await response.json()) as { routes?: MapboxRoute[] };
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
  const steps = (route.legs?.[0]?.steps ?? []).flatMap((step) => {
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
      distanceFromStartKm,
    };
    distanceFromStartKm += normalized.distanceKm;
    return [normalized];
  });
  return {
    coordinates,
    distanceKm: route.distance / 1_000,
    durationMin: Math.max(1, Math.round(route.duration / 60)),
    steps,
    road: true,
    provider: 'mapbox',
  };
}
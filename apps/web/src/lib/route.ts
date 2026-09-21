import { distanceKm, type LatLng, type RoadRoute } from './live-map';

export type { RoadRoute };

const OSRM_ROUTE_URL = 'https://router.project-osrm.org/route/v1/driving';

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
  };
}

/** Real road route from OSRM, with a straight-line fallback when offline. */
export async function fetchRoadRoute(from: LatLng, to: LatLng, signal?: AbortSignal): Promise<RoadRoute> {
  try {
    const url =
      `${OSRM_ROUTE_URL}/${from.lng},${from.lat};${to.lng},${to.lat}` +
      '?overview=full&geometries=geojson&annotations=false';
    const response = await fetch(url, { signal });
    if (!response.ok) throw new Error(`OSRM ${response.status}`);
    const data = (await response.json()) as {
      routes?: Array<{ geometry?: { coordinates?: Array<[number, number]> }; distance?: number; duration?: number }>;
    };
    const route = data.routes?.[0];
    const coordinates = route?.geometry?.coordinates;
    if (!coordinates || coordinates.length < 2) throw new Error('empty route');
    return {
      coordinates,
      distanceKm: (route?.distance ?? distanceKm(from, to) * 1000) / 1000,
      durationMin: Math.max(1, Math.round((route?.duration ?? 0) / 60)),
      road: true,
    };
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error;
    return straightLineRoute(from, to);
  }
}

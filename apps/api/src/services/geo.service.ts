import { prisma } from '../lib/prisma';
import { MALAM_CENTER, type LatLng } from '@delivery/shared';
import { badRequest, notFound } from '../lib/errors';

const MAX_GEO_RESULTS = 6;
const NOMINATIM_USER_AGENT = 'DeliverySystemApp/1.0 (food delivery platform; contact: support@deliverysystem.app)';
const NOMINATIM_BASE = 'https://nominatim.openstreetmap.org';

export interface GeoSearchResult {
  displayName: string;
  address: {
    road?: string;
    house_number?: string;
    neighbourhood?: string;
    suburb?: string;
    village?: string;
    town?: string;
    city?: string;
    state?: string;
    country?: string;
    postcode?: string;
    county?: string;
  };
  placeId: string;
  lat: number;
  lng: number;
  type: string;
}

export interface AddressSuggestion {
  label: string;
  address: string;
  latitude: number;
  longitude: number;
  placeId: string;
  type: string;
}

/**
 * Search for address suggestions using Nominatim.
 * Rate-limited internally; respects Nominatim usage policy.
 */
export async function searchGeo(query: string): Promise<AddressSuggestion[]> {
  if (query.trim().length < 3) return [];

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8_000);

  try {
    const url = new URL(`${NOMINATIM_BASE}/search`);
    url.searchParams.set('q', query.trim());
    url.searchParams.set('format', 'json');
    url.searchParams.set('limit', String(MAX_GEO_RESULTS));
    url.searchParams.set('addressdetails', '1');
    url.searchParams.set('extratags', '1');

    const response = await fetch(url.toString(), {
      signal: controller.signal,
      headers: {
        'User-Agent': NOMINATIM_USER_AGENT,
        'Accept-Language': 'en',
      },
    });

    if (!response.ok) throw new Error(`Nominatim returned ${response.status}`);

    const results = (await response.json()) as Array<{
      display_name: string;
      place_id: string;
      lat: string;
      lon: string;
      type: string;
      address: Record<string, string | undefined>;
    }>;

    clearTimeout(timeout);
    return deduplicateAndFilter(results);
  } catch (error) {
    clearTimeout(timeout);
    if (error instanceof Error && error.name === 'AbortError') return [];
    console.error('Geo search failed:', error);
    return [];
  }
}

function deduplicateAndFilter(results: Array<{
  display_name: string;
  place_id: string;
  lat: string;
  lon: string;
  type: string;
  address: Record<string, string | undefined>;
}>): AddressSuggestion[] {
  const seen = new Set<string>();
  const filtered: GeoSearchResult[] = [];

  const relevantTypes = new Set([
    'house', 'residential', 'building', 'road', 'neighbourhood', 'suburb',
    'city', 'town', 'village', 'administrative', 'farm', 'hamlet',
  ]);

  for (const r of results) {
    if (seen.has(r.place_id)) continue;
    seen.add(r.place_id);

    const lat = parseFloat(r.lat);
    const lng = parseFloat(r.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
    if (!relevantTypes.has(r.type)) continue;

    filtered.push({
      displayName: r.display_name,
      address: r.address as GeoSearchResult['address'],
      placeId: r.place_id,
      lat,
      lng,
      type: r.type,
    });
  }

  filtered.sort((a, b) => {
    const order = ['city', 'town', 'suburb', 'neighbourhood', 'village', 'hamlet', 'administrative', 'road', 'house', 'building', 'residential', 'farm'];
    return order.indexOf(a.type) - order.indexOf(b.type);
  });

  return filtered.slice(0, MAX_GEO_RESULTS).map(geoResultToSuggestion);
}

function geoResultToSuggestion(result: GeoSearchResult): AddressSuggestion {
  const parts: string[] = [];
  if (result.address.house_number) parts.push(result.address.house_number);
  if (result.address.road) parts.push(result.address.road);
  if (result.address.neighbourhood) parts.push(result.address.neighbourhood);
  if (result.address.suburb) parts.push(result.address.suburb);
  if (result.address.village) parts.push(result.address.village);
  if (result.address.city) parts.push(result.address.city);
  if (result.address.town) parts.push(result.address.town);
  if (result.address.state) parts.push(result.address.state);
  if (result.address.country && result.address.country !== 'Ghana') parts.push(result.address.country);

  const address = parts.join(', ') || result.displayName;

  return {
    label: address.split(',')[0]?.trim() || result.displayName.split(',')[0]?.trim() || 'Unknown',
    address,
    latitude: result.lat,
    longitude: result.lng,
    placeId: result.placeId,
    type: result.type,
  };
}

/**
 * Haversine distance in kilometres between two coordinates.
 */
export function haversineDistance(from: LatLng, to: LatLng): number {
  const R = 6371;
  const dLat = toRad(to.lat - from.lat);
  const dLng = toRad(to.lng - from.lng);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(from.lat)) * Math.cos(toRad(to.lat)) *
    Math.sin(dLng / 2) * Math.sin(dLng / 2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function toRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

/**
 * Check if a delivery location is within the service area.
 * Uses a simple radius check from the kitchen anchor.
 */
export function isWithinDeliveryZone(
  latitude: number,
  longitude: number,
  kitchenLat: number = MALAM_CENTER.lat,
  kitchenLng: number = MALAM_CENTER.lng,
  maxRadiusKm: number = 15,
): { within: boolean; distanceKm: number; message: string | null } {
  const distance = haversineDistance(
    { lat: kitchenLat, lng: kitchenLng },
    { lat: latitude, lng: longitude },
  );

  if (distance <= maxRadiusKm) {
    return { within: true, distanceKm: distance, message: null };
  }

  return {
    within: false,
    distanceKm: distance,
    message: `This location is ${distance.toFixed(1)} km from our kitchen — outside our current delivery area (max ${maxRadiusKm} km).`,
  };
}

import { api } from './api';

export type PlaceSource = 'mapbox' | 'gps' | 'saved';

export interface PlaceSuggestion {
  id: string;
  label: string;
  address: string;
  lat: number;
  lng: number;
  source: PlaceSource;
  kind: 'landmark' | 'street' | 'area' | 'gps';
}

interface MapboxSuggestion {
  label: string;
  address: string;
  latitude: number;
  longitude: number;
  placeId: string;
  type: string;
}

const CACHE_TTL_MS = 5 * 60_000;
const GHANA_BOUNDS = { south: 4.5, north: 11.5, west: -3.5, east: 1.5 };
const cache = new Map<string, { at: number; results: PlaceSuggestion[] }>();

function isGhanaCoordinate(lat: number, lng: number): boolean {
  return Number.isFinite(lat) && Number.isFinite(lng) &&
    lat >= GHANA_BOUNDS.south && lat <= GHANA_BOUNDS.north &&
    lng >= GHANA_BOUNDS.west && lng <= GHANA_BOUNDS.east;
}

async function mapboxMatches(query: string, signal?: AbortSignal): Promise<PlaceSuggestion[]> {
  const data = await api.get<{ suggestions: MapboxSuggestion[] }>(
    `/geo/search?q=${encodeURIComponent(query)}`,
    signal,
  );
  return (data.suggestions ?? []).flatMap((suggestion) => {
    if (!isGhanaCoordinate(suggestion.latitude, suggestion.longitude)) return [];
    const address = suggestion.address.trim();
    if (!address) return [];
    return [{
      id: `mapbox:${suggestion.placeId || address}`,
      label: suggestion.label.trim() || address,
      address,
      lat: suggestion.latitude,
      lng: suggestion.longitude,
      source: 'mapbox' as const,
      kind: suggestion.type === 'poi'
        ? 'landmark' as const
        : suggestion.type === 'street' || suggestion.type === 'road' || suggestion.type === 'address'
          ? 'street' as const
          : 'area' as const,
    }];
  });
}

export async function currentLocationPlace(position: { lat: number; lng: number }): Promise<PlaceSuggestion> {
  if (!isGhanaCoordinate(position.lat, position.lng)) {
    throw new Error('The current location is outside the delivery region.');
  }
  const { suggestion } = await api.get<{ suggestion: MapboxSuggestion }>(
    `/geo/reverse?latitude=${position.lat}&longitude=${position.lng}`,
  );
  if (!suggestion.address.trim()) throw new Error('No readable address was found for this location.');
  return {
    id: 'gps:current',
    label: suggestion.label.trim() || 'Current location',
    address: suggestion.address.trim(),
    lat: position.lat,
    lng: position.lng,
    source: 'gps',
    kind: 'gps',
  };
}

export async function suggestPlaces(query: string, signal?: AbortSignal): Promise<PlaceSuggestion[]> {
  const clean = query.trim();
  if (clean.length < 3) return [];

  const key = clean.toLocaleLowerCase();
  const cached = cache.get(key);
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) return cached.results;

  try {
    const results = await mapboxMatches(clean, signal);
    const unique = new Map<string, PlaceSuggestion>();
    for (const result of results) {
      unique.set(`${result.address}|${result.lat.toFixed(5)}|${result.lng.toFixed(5)}`, result);
    }
    const suggestions = [...unique.values()].slice(0, 6);
    cache.set(key, { at: Date.now(), results: suggestions });
    return suggestions;
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error;
    console.error('[geocode] Mapbox search failed:', error);
    return [];
  }
}

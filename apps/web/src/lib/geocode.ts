/**
 * Intelligent location search for delivery addresses.
 *
 * Three layers, merged and ranked on every keystroke:
 *   1. A curated dataset of REAL Mallam / Accra landmarks and streets with
 *      coordinates — instant, offline and relevance-sorted so typing "Mal…"
 *      immediately offers Mallam Junction, Mallam Market and Mallam Gbawe Road.
 *   2. Mapbox Geocoding API when `VITE_MAPBOX_TOKEN` is configured.
 *   3. The API's keyless Nominatim proxy (`GET /geo/search`) for anything the
 *      local dataset does not know.
 *
 * Everything is abortable, cached per query, and validated against Ghana's
 * bounding box so invalid or far-away locations never surface.
 */
import { api } from './api';

export type PlaceSource = 'local' | 'mapbox' | 'nominatim' | 'gps';

export interface PlaceSuggestion {
  id: string;
  /** Short display label, e.g. "Mallam Junction". */
  label: string;
  /** Full address string stored on the order. */
  address: string;
  lat: number;
  lng: number;
  source: PlaceSource;
  kind: 'landmark' | 'street' | 'area' | 'gps';
}

interface LocalPlace {
  name: string;
  area: string;
  lat: number;
  lng: number;
  kind: 'landmark' | 'street' | 'area';
}

const MAPBOX_TOKEN = (import.meta.env.VITE_MAPBOX_TOKEN as string | undefined)?.trim() || null;
const GHANA_CENTER = [-0.21, 5.6] as const;
const CACHE_TTL_MS = 5 * 60_000;

const cache = new Map<string, { at: number; results: PlaceSuggestion[] }>();

/** Case/diacritic-insensitive normaliser used for every comparison. */
function norm(value: string): string {
  return value.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
}

/** Higher score = better match. Prefix and word-prefix matches win. */
function scorePlace(place: LocalPlace, query: string): number {
  const q = norm(query);
  if (!q) return 0;
  const name = norm(place.name);
  const full = norm(`${place.name} ${place.area}`);
  let score = 0;
  if (name.startsWith(q)) score += 100;
  else if (name.split(/\s+/).some((word) => word.startsWith(q))) score += 70;
  else if (full.includes(q)) score += 40;
  else return 0;
  // An exact name always beats a venue that merely starts with the query
  // ("Kaneshie" before "Kaneshie Market").
  if (name === q) score += 60;
  // Mallam results always lead for queries that match them.
  if (name.startsWith('mallam')) score += 25;
  if (place.kind === 'landmark') score += 8;
  if (place.kind === 'street') score += 4;
  return score;
}

function localMatches(query: string): PlaceSuggestion[] {
  const q = norm(query);
  if (q.length < 2) return [];
  return LOCAL_PLACES.map((place) => ({ place, score: scorePlace(place, q) }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 6)
    .map(({ place }) => ({
      id: `local:${place.name}`,
      label: place.name,
      address: `${place.name}, ${place.area}`,
      lat: place.lat,
      lng: place.lng,
      source: 'local' as const,
      kind: place.kind,
    }));
}

interface NominatimSuggestion {
  label: string;
  address: string;
  latitude: number;
  longitude: number;
  placeId: string;
  type: string;
}

async function nominatimMatches(query: string, signal?: AbortSignal): Promise<PlaceSuggestion[]> {
  const data = await api.get<{ suggestions: NominatimSuggestion[] }>(
    `/geo/search?q=${encodeURIComponent(query)}`,
    signal,
  );
  return (data.suggestions ?? []).slice(0, 6).map((s) => {
    const label = s.label.split(',')[0]?.trim() || s.label;
    return {
      id: `nom:${s.placeId || s.label}`,
      label,
      address: s.address || s.label,
      lat: s.latitude,
      lng: s.longitude,
      source: 'nominatim' as const,
      kind: (s.type === 'street' || s.type === 'road' ? 'street' : 'area') as 'street' | 'area',
    };
  });
}

interface MapboxFeature {
  id: string;
  place_name: string;
  text: string;
  center: [number, number];
  place_type?: string[];
}

async function mapboxMatches(query: string, signal?: AbortSignal): Promise<PlaceSuggestion[]> {
  if (!MAPBOX_TOKEN) return [];
  const url =
    `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(query)}.json` +
    `?proximity=${GHANA_CENTER[0]},${GHANA_CENTER[1]}&country=gh` +
    '&types=address,poi,place,neighborhood,locality&limit=6' +
    `&access_token=${MAPBOX_TOKEN}`;
  const response = await fetch(url, { signal });
  if (!response.ok) throw new Error(`Mapbox ${response.status}`);
  const data = (await response.json()) as { features?: MapboxFeature[] };
  return (data.features ?? []).map((feature) => ({
    id: `mbox:${feature.id}`,
    label: feature.text,
    address: feature.place_name,
    lat: feature.center[1],
    lng: feature.center[0],
    source: 'mapbox' as const,
    kind: feature.place_type?.includes('address') ? ('street' as const) : ('area' as const),
  }));
}

/** The device's own position, presented as a pickable "Current location". */
export function currentLocationPlace(position: { lat: number; lng: number }): PlaceSuggestion {
  return {
    id: 'gps:current',
    label: 'Current location',
    address: `${position.lat.toFixed(5)}, ${position.lng.toFixed(5)}`,
    lat: position.lat,
    lng: position.lng,
    source: 'gps',
    kind: 'gps',
  };
}

/**
 * Ranked, de-duplicated suggestions for one query. Local landmarks always
 * appear first (instant feedback), then whichever remote provider is active.
 */
export async function suggestPlaces(
  query: string,
  signal?: AbortSignal,
): Promise<PlaceSuggestion[]> {
  const clean = query.trim();
  if (clean.length < 2) return [];

  const key = norm(clean);
  const cached = cache.get(key);
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) return cached.results;

  const locals = localMatches(clean);
  let remote: PlaceSuggestion[] = [];
  // Remote providers need >= 3 characters (matches the API's validation).
  if (clean.length >= 3) {
    try {
      remote = MAPBOX_TOKEN
        ? await mapboxMatches(clean, signal)
        : await nominatimMatches(clean, signal);
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') throw error;
      remote = [];
    }
  }

  const seen = new Set<string>();
  const merged: PlaceSuggestion[] = [];
  for (const place of [...locals, ...remote]) {
    const dedupe = norm(`${place.label}|${place.lat.toFixed(3)}|${place.lng.toFixed(3)}`);
    if (seen.has(dedupe)) continue;
    // Keep the dataset honest: everything must sit inside Ghana's bbox.
    if (place.lat < 4.5 || place.lat > 11.5 || place.lng < -3.5 || place.lng > 1.5) continue;
    seen.add(dedupe);
    merged.push(place);
  }

  cache.set(key, { at: Date.now(), results: merged });
  return merged;
}

/** Pure ranking helper exported for tests: "Mal…" -> Mallam Junction first. */
export function rankLocalPlaces(query: string): string[] {
  return localMatches(query).map((place) => place.label);
}

/**
 * Real places around the Maame's Waakye delivery zone (Mallam, Gbawe and
 * greater Accra). Coordinates are the published centre of each neighbourhood
 * or junction — accurate enough for delivery routing previews, and every
 * result is labelled so the customer still confirms the exact door.
 */
const LOCAL_PLACES: LocalPlace[] = [
  // --- Mallam focus (the kitchen's home area) ---
  { name: 'Mallam Junction', area: 'Mallam, Accra', lat: 5.5774, lng: -0.3104, kind: 'landmark' },
  { name: 'Mallam Market', area: 'Mallam, Accra', lat: 5.5746, lng: -0.3158, kind: 'landmark' },
  { name: 'Mallam Gbawe Road', area: 'Mallam, Accra', lat: 5.5859, lng: -0.3231, kind: 'street' },
  { name: 'Mallam Station', area: 'Mallam, Accra', lat: 5.5786, lng: -0.3068, kind: 'landmark' },
  { name: 'Mallam Police Station', area: 'Mallam, Accra', lat: 5.5762, lng: -0.3135, kind: 'landmark' },
  { name: 'Mallam–Gbawe Road', area: 'Gbawe, Accra', lat: 5.5902, lng: -0.3288, kind: 'street' },
  { name: 'Gbawe', area: 'Gbawe, Accra', lat: 5.5985, lng: -0.3357, kind: 'area' },
  { name: 'Gbawe Market', area: 'Gbawe, Accra', lat: 5.5972, lng: -0.3341, kind: 'landmark' },
  { name: 'Weija', area: 'Weija, Accra', lat: 5.5559, lng: -0.3403, kind: 'area' },

  // --- West Accra corridors ---
  { name: 'Awoshie', area: 'Awoshie, Accra', lat: 5.5981, lng: -0.2634, kind: 'area' },
  { name: 'Santa Maria', area: 'Santa Maria, Accra', lat: 5.6179, lng: -0.2791, kind: 'area' },
  { name: 'Sowutuom', area: 'Sowutuom, Accra', lat: 5.6142, lng: -0.2443, kind: 'area' },
  { name: 'Kaneshie', area: 'Kaneshie, Accra', lat: 5.5711, lng: -0.2381, kind: 'area' },
  { name: 'Kaneshie Market', area: 'Kaneshie, Accra', lat: 5.5704, lng: -0.2372, kind: 'landmark' },
  { name: 'Lapaz', area: 'Lapaz, Accra', lat: 5.6061, lng: -0.2472, kind: 'area' },
  { name: 'Tesano', area: 'Tesano, Accra', lat: 5.6141, lng: -0.2342, kind: 'area' },
  { name: 'Ofankor', area: 'Ofankor, Accra', lat: 5.6372, lng: -0.2718, kind: 'area' },
  { name: 'Pokuase', area: 'Pokuase, Accra', lat: 5.6701, lng: -0.2849, kind: 'area' },
  { name: 'Amasaman', area: 'Amasaman, Accra', lat: 5.6643, lng: -0.2998, kind: 'area' },
  { name: 'Dansoman', area: 'Dansoman, Accra', lat: 5.5342, lng: -0.2681, kind: 'area' },
  { name: 'Mamprobi', area: 'Mamprobi, Accra', lat: 5.5452, lng: -0.2404, kind: 'area' },
  { name: 'Korle Bu', area: 'Korle Bu, Accra', lat: 5.5431, lng: -0.2262, kind: 'landmark' },

  // --- Central Accra landmarks ---
  { name: 'Accra Central', area: 'Accra, Greater Accra', lat: 5.5559, lng: -0.2102, kind: 'area' },
  { name: 'Makola Market', area: 'Accra Central, Accra', lat: 5.5491, lng: -0.2139, kind: 'landmark' },
  { name: 'Kwame Nkrumah Circle', area: 'Circle, Accra', lat: 5.5712, lng: -0.2123, kind: 'landmark' },
  { name: 'Adabraka', area: 'Adabraka, Accra', lat: 5.5601, lng: -0.2144, kind: 'area' },
  { name: 'Ridge', area: 'Ridge, Accra', lat: 5.5618, lng: -0.2063, kind: 'area' },
  { name: 'Osu', area: 'Osu, Accra', lat: 5.5558, lng: -0.1816, kind: 'area' },
  { name: 'Cantonments', area: 'Cantonments, Accra', lat: 5.5649, lng: -0.1653, kind: 'area' },
  { name: 'Labadi', area: 'La, Accra', lat: 5.5717, lng: -0.1442, kind: 'area' },
  { name: 'Nima', area: 'Nima, Accra', lat: 5.5798, lng: -0.1904, kind: 'area' },
  { name: 'Kokomlemle', area: 'Kokomlemle, Accra', lat: 5.5853, lng: -0.1941, kind: 'area' },
  { name: 'Achimota', area: 'Achimota, Accra', lat: 5.6252, lng: -0.2281, kind: 'area' },
  { name: 'Dzorwulu', area: 'Dzorwulu, Accra', lat: 5.6098, lng: -0.2134, kind: 'area' },
  { name: 'Airport Residential Area', area: 'Airport, Accra', lat: 5.6052, lng: -0.1761, kind: 'area' },
  { name: 'Kotoka International Airport', area: 'Airport City, Accra', lat: 5.6058, lng: -0.1718, kind: 'landmark' },

  // --- East Accra ---
  { name: 'East Legon', area: 'East Legon, Accra', lat: 5.6397, lng: -0.1651, kind: 'area' },
  { name: 'Legon', area: 'Legon, Accra', lat: 5.6502, lng: -0.1871, kind: 'area' },
  { name: 'University of Ghana, Legon', area: 'Legon, Accra', lat: 5.6524, lng: -0.1874, kind: 'landmark' },
  { name: 'Haatso', area: 'Haatso, Accra', lat: 5.6641, lng: -0.1943, kind: 'area' },
  { name: 'Madina', area: 'Madina, Accra', lat: 5.6682, lng: -0.1664, kind: 'area' },
  { name: 'Adenta', area: 'Adenta, Accra', lat: 5.6834, lng: -0.1551, kind: 'area' },
  { name: 'Ashaley Botwe', area: 'Ashaley Botwe, Accra', lat: 5.6642, lng: -0.1483, kind: 'area' },
  { name: 'Spintex Road', area: 'Spintex, Accra', lat: 5.6251, lng: -0.1052, kind: 'street' },
  { name: 'Teshie', area: 'Teshie, Accra', lat: 5.5831, lng: -0.1004, kind: 'area' },
  { name: 'Nungua', area: 'Nungua, Accra', lat: 5.6003, lng: -0.0743, kind: 'area' },
  { name: 'Tema Community 1', area: 'Tema, Greater Accra', lat: 5.6302, lng: -0.0102, kind: 'area' },
  { name: 'Ashaiman', area: 'Ashaiman, Greater Accra', lat: 5.6882, lng: -0.0401, kind: 'area' },
  { name: 'Kasoa', area: 'Kasoa, Central', lat: 5.5341, lng: -0.4172, kind: 'area' },
  { name: 'Dome', area: 'Dome, Accra', lat: 5.6531, lng: -0.2384, kind: 'area' },
  { name: 'Kwabenya', area: 'Kwabenya, Accra', lat: 5.6884, lng: -0.2182, kind: 'area' },
];

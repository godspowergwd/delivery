/**
 * Device-local preferences that make the app feel personal without touching the
 * server: the chosen delivery location and the search history shown on the
 * search screen. Everything is defensive — a corrupt value can never break a
 * screen.
 */
const LOCATION_KEY = 'waakye_delivery_location_v1';
const RECENT_KEY = 'waakye_recent_searches_v1';
const RECENT_LIMIT = 8;

export interface SavedLocation {
  /** Human readable label, e.g. "Osu, Accra". */
  label: string;
  area?: string;
  lat?: number;
  lng?: number;
}

export interface RecentSearch {
  term: string;
  at: number;
}

/** Default centre of the Waakye App delivery zone (Malam / Gbawe, Accra). */
export const ACCRA_CENTER = { lat: 5.6037, lng: -0.187 };

export function loadDeliveryLocation(): SavedLocation | null {
  try {
    const raw = localStorage.getItem(LOCATION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as SavedLocation;
    return parsed && typeof parsed.label === 'string' && parsed.label.trim() ? parsed : null;
  } catch {
    return null;
  }
}

export function saveDeliveryLocation(location: SavedLocation | null): void {
  try {
    if (!location) localStorage.removeItem(LOCATION_KEY);
    else localStorage.setItem(LOCATION_KEY, JSON.stringify(location));
  } catch {
    // Storage can be unavailable in private mode; the app still works.
  }
}

export function loadRecentSearches(): RecentSearch[] {
  try {
    const raw = localStorage.getItem(RECENT_KEY);
    const parsed = raw ? (JSON.parse(raw) as RecentSearch[]) : [];
    return Array.isArray(parsed)
      ? parsed.filter((entry) => entry && typeof entry.term === 'string').slice(0, RECENT_LIMIT)
      : [];
  } catch {
    return [];
  }
}

/** Stores a term at the top of the history (case-insensitive, de-duplicated). */
export function pushRecentSearch(term: string): RecentSearch[] {
  const clean = term.trim();
  if (clean.length < 2) return loadRecentSearches();
  const next = [
    { term: clean, at: Date.now() },
    ...loadRecentSearches().filter((entry) => entry.term.toLowerCase() !== clean.toLowerCase()),
  ].slice(0, RECENT_LIMIT);
  try {
    localStorage.setItem(RECENT_KEY, JSON.stringify(next));
  } catch {
    // ignore
  }
  return next;
}

export function clearRecentSearches(): void {
  try {
    localStorage.removeItem(RECENT_KEY);
  } catch {
    // ignore
  }
}

/** Popular searches surfaced on an empty search screen (the focused waakye menu). */
export const TRENDING_SEARCHES = [
  'Waakye',
  'Waakye Special',
  'Jollof rice',
  'Fried rice',
  'Sobolo',
  'Chicken',
  'Fish',
  'Sides',
] as const;

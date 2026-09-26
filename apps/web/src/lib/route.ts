import { useEffect, useRef, useState } from 'react';
import { distanceKm, type LatLng, type RoadRoute } from './live-map';
import { api } from './api';

export type { RoadRoute };

interface DirectionsResponse {
  route: RoadRoute;
}

function isValidPoint(point: LatLng): boolean {
  return Number.isFinite(point.lat) && Number.isFinite(point.lng) &&
    point.lat >= -90 && point.lat <= 90 && point.lng >= -180 && point.lng <= 180;
}

/** Fetches a road route through the authenticated backend; the Mapbox key stays server-side. */
export async function fetchRoadRoute(from: LatLng, to: LatLng, signal?: AbortSignal): Promise<RoadRoute> {
  if (!isValidPoint(from) || !isValidPoint(to)) throw new Error('Route coordinates are invalid.');

  const query = new URLSearchParams({
    fromLatitude: String(from.lat),
    fromLongitude: String(from.lng),
    toLatitude: String(to.lat),
    toLongitude: String(to.lng),
  });
  const { route } = await api.get<DirectionsResponse>(`/geo/directions?${query}`, signal);
  if (
    route.provider !== 'mapbox' ||
    route.coordinates.length < 2 ||
    route.coordinates.some(([lng, lat]) => !Number.isFinite(lng) || !Number.isFinite(lat))
  ) {
    throw new Error('Mapbox did not return a valid road route.');
  }
  return route;
}

interface RouteRequest {
  at: number;
  lat: number;
  lng: number;
  target: string;
}

/** Shares route throttling between navigation screens without aborting on every GPS fix. */
export function useDeliveryRoute(
  from: LatLng | null,
  to: LatLng | null,
  enabled = true,
): { route: RoadRoute | null; error: string | null } {
  const [route, setRoute] = useState<RoadRoute | null>(null);
  const [error, setError] = useState<string | null>(null);
  const lastRequestRef = useRef<RouteRequest | null>(null);
  const activeRequestRef = useRef<{ id: number; controller: AbortController } | null>(null);
  const requestIdRef = useRef(0);

  useEffect(() => {
    if (!enabled || !from || !to || !isValidPoint(from) || !isValidPoint(to)) {
      activeRequestRef.current?.controller.abort();
      activeRequestRef.current = null;
      lastRequestRef.current = null;
      setRoute(null);
      setError(null);
      return;
    }

    const target = `${to.lat.toFixed(5)},${to.lng.toFixed(5)}`;
    const previous = lastRequestRef.current;
    const movedMetres = previous
      ? distanceKm({ lat: previous.lat, lng: previous.lng }, from) * 1000
      : Number.POSITIVE_INFINITY;
    const changedTarget = previous?.target !== target;
    const due = !previous || changedTarget || movedMetres >= 250 || Date.now() - previous.at >= 60_000;
    if (!due) return;

    activeRequestRef.current?.controller.abort();
    const controller = new AbortController();
    const requestId = ++requestIdRef.current;
    activeRequestRef.current = { id: requestId, controller };
    lastRequestRef.current = { at: Date.now(), lat: from.lat, lng: from.lng, target };
    if (changedTarget) setRoute(null);
    setError(null);

    void fetchRoadRoute(from, to, controller.signal)
      .then((next) => {
        if (activeRequestRef.current?.id !== requestId) return;
        setRoute(next);
      })
      .catch((reason: unknown) => {
        if (controller.signal.aborted) return;
        if (activeRequestRef.current?.id !== requestId) return;
        const message = reason instanceof Error ? reason.message : 'Road directions are temporarily unavailable.';
        setError(message);
        console.error('[route] Mapbox Directions request failed:', reason);
      });
  }, [enabled, from?.lat, from?.lng, to?.lat, to?.lng]);

  useEffect(() => () => activeRequestRef.current?.controller.abort(), []);

  return { route, error };
}

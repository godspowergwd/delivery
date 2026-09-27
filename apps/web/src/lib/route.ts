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
  target: string;
}

export interface RouteProgress {
  distanceFromStartKm: number;
  remainingDistanceKm: number;
  remainingDurationMin: number;
  offRouteMeters: number;
  nextStep: RoadRoute['steps'][number] | null;
}

export function isAutomaticRerouteDue(
  offRouteMeters: number,
  consecutiveOffRouteFixes: number,
  elapsedSinceRequestMs: number,
): boolean {
  return offRouteMeters > 75 && consecutiveOffRouteFixes >= 2 && elapsedSinceRequestMs >= 15_000;
}

export function calculateRouteProgress(route: RoadRoute, point: LatLng): RouteProgress {
  const latitudeScale = 111_320;
  const longitudeScale = latitudeScale * Math.cos((point.lat * Math.PI) / 180);
  let bestDistanceMeters = Number.POSITIVE_INFINITY;
  let bestProgressKm = 0;
  let cumulativeKm = 0;

  for (let index = 1; index < route.coordinates.length; index += 1) {
    const [fromLng, fromLat] = route.coordinates[index - 1];
    const [toLng, toLat] = route.coordinates[index];
    const fromX = (fromLng - point.lng) * longitudeScale;
    const fromY = (fromLat - point.lat) * latitudeScale;
    const toX = (toLng - point.lng) * longitudeScale;
    const toY = (toLat - point.lat) * latitudeScale;
    const dx = toX - fromX;
    const dy = toY - fromY;
    const lengthSquared = dx * dx + dy * dy;
    const fraction = lengthSquared > 0
      ? Math.max(0, Math.min(1, -(fromX * dx + fromY * dy) / lengthSquared))
      : 0;
    const crossTrackMeters = Math.hypot(fromX + fraction * dx, fromY + fraction * dy);
    const segmentKm = distanceKm(
      { lat: fromLat, lng: fromLng },
      { lat: toLat, lng: toLng },
    );
    if (crossTrackMeters < bestDistanceMeters) {
      bestDistanceMeters = crossTrackMeters;
      bestProgressKm = cumulativeKm + segmentKm * fraction;
    }
    cumulativeKm += segmentKm;
  }

  const totalDistanceKm = Math.max(route.distanceKm, cumulativeKm);
  const remainingDistanceKm = Math.max(0, totalDistanceKm - bestProgressKm);
  const nextStep = route.steps.find((step) => step.distanceFromStartKm > bestProgressKm + 0.025) ?? null;
  return {
    distanceFromStartKm: bestProgressKm,
    remainingDistanceKm,
    remainingDurationMin: route.distanceKm > 0
      ? route.durationMin * Math.max(0, route.distanceKm - bestProgressKm) / route.distanceKm
      : 0,
    offRouteMeters: bestDistanceMeters,
    nextStep,
  };
}

/** Shares route throttling between navigation screens without aborting on every GPS fix. */
export function useDeliveryRoute(
  from: LatLng | null,
  to: LatLng | null,
  enabled = true,
): { route: RoadRoute | null; error: string | null; loading: boolean } {
  const [route, setRoute] = useState<RoadRoute | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const lastRequestRef = useRef<RouteRequest | null>(null);
  const activeRequestRef = useRef<{ id: number; controller: AbortController } | null>(null);
  const routeRef = useRef<RoadRoute | null>(null);
  const offRouteFixesRef = useRef(0);
  const requestIdRef = useRef(0);

  useEffect(() => {
    if (!enabled || !from || !to || !isValidPoint(from) || !isValidPoint(to)) {
      activeRequestRef.current?.controller.abort();
      activeRequestRef.current = null;
      lastRequestRef.current = null;
      routeRef.current = null;
      offRouteFixesRef.current = 0;
      setLoading(false);
      setRoute(null);
      setError(null);
      return;
    }

    const target = `${to.lat.toFixed(5)},${to.lng.toFixed(5)}`;
    const previous = lastRequestRef.current;
    const changedTarget = previous?.target !== target;
    const progress = routeRef.current ? calculateRouteProgress(routeRef.current, from) : null;
    if (progress && progress.offRouteMeters > 75) offRouteFixesRef.current += 1;
    else offRouteFixesRef.current = 0;
    const now = Date.now();
    const cooledDown = !previous || now - previous.at >= 15_000;
    const needsInitialOrTargetRoute = !previous || changedTarget;
    const needsRetry = Boolean(!routeRef.current && !activeRequestRef.current && cooledDown);
    const needsReroute = Boolean(
      routeRef.current && progress &&
      isAutomaticRerouteDue(progress.offRouteMeters, offRouteFixesRef.current, now - (previous?.at ?? 0)),
    );
    const due = needsInitialOrTargetRoute || needsRetry || needsReroute;
    if (!due) return;

    if (activeRequestRef.current) return;
    const controller = new AbortController();
    const requestId = ++requestIdRef.current;
    activeRequestRef.current = { id: requestId, controller };
    lastRequestRef.current = { at: now, target };
    if (changedTarget) {
      routeRef.current = null;
      setRoute(null);
    }
    setLoading(true);
    setError(null);

    void fetchRoadRoute(from, to, controller.signal)
      .then((next) => {
        if (activeRequestRef.current?.id !== requestId) return;
        routeRef.current = next;
        offRouteFixesRef.current = 0;
        setRoute(next);
      })
      .catch((reason: unknown) => {
        if (controller.signal.aborted) return;
        if (activeRequestRef.current?.id !== requestId) return;
        const message = reason instanceof Error ? reason.message : 'Road directions are temporarily unavailable.';
        setError(message);
        console.error('[route] Mapbox Directions request failed:', reason);
      })
      .finally(() => {
        if (activeRequestRef.current?.id !== requestId) return;
        activeRequestRef.current = null;
        setLoading(false);
      });
  }, [enabled, from?.lat, from?.lng, to?.lat, to?.lng]);

  useEffect(() => () => activeRequestRef.current?.controller.abort(), []);

  return { route, error, loading };
}

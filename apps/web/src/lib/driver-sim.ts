import { useEffect, useRef, useState } from 'react';
import { distanceKm, type LatLng } from './live-map';

/**
 * Smooth simulated movement along a route polyline (constant speed,
 * requestAnimationFrame driven). Used until the backend streams real GPS.
 */
export function positionAlongRoute(coordinates: Array<[number, number]>, progress: number): LatLng {
  if (coordinates.length === 0) return { lat: 5.6037, lng: -0.187 };
  if (coordinates.length === 1) return { lat: coordinates[0][1], lng: coordinates[0][0] };
  const clamped = Math.min(1, Math.max(0, progress));
  const segments: number[] = [];
  let total = 0;
  for (let index = 1; index < coordinates.length; index += 1) {
    const length = distanceKm(
      { lat: coordinates[index - 1][1], lng: coordinates[index - 1][0] },
      { lat: coordinates[index][1], lng: coordinates[index][0] },
    );
    segments.push(length);
    total += length;
  }
  if (total <= 0) {
    const last = coordinates[coordinates.length - 1];
    return { lat: last[1], lng: last[0] };
  }
  let target = clamped * total;
  for (let index = 0; index < segments.length; index += 1) {
    if (target <= segments[index] || index === segments.length - 1) {
      const t = segments[index] === 0 ? 0 : target / segments[index];
      const from = coordinates[index];
      const to = coordinates[index + 1];
      return { lat: from[1] + (to[1] - from[1]) * t, lng: from[0] + (to[0] - from[0]) * t };
    }
    target -= segments[index];
  }
  const last = coordinates[coordinates.length - 1];
  return { lat: last[1], lng: last[0] };
}

/** Bearing in degrees between two points (rotates the driver marker). */
export function bearingDegrees(from: LatLng, to: LatLng): number {
  const toRad = (degrees: number): number => (degrees * Math.PI) / 180;
  const toDeg = (radians: number): number => (radians * 180) / Math.PI;
  const dLng = toRad(to.lng - from.lng);
  const y = Math.sin(dLng) * Math.cos(toRad(to.lat));
  const x =
    Math.cos(toRad(from.lat)) * Math.sin(toRad(to.lat)) -
    Math.sin(toRad(from.lat)) * Math.cos(toRad(to.lat)) * Math.cos(dLng);
  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}

/** Animates 0 -> 1 over durationMs, then holds at 1 (delivery leg). */
export function useAnimatedProgress(durationMs: number, active: boolean): number {
  const [progress, setProgress] = useState(0);
  const rafRef = useRef(0);
  const startRef = useRef(0);
  useEffect(() => {
    if (!active) {
      setProgress(0);
      return;
    }
    startRef.current = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - startRef.current) / durationMs);
      setProgress(t);
      if (t < 1) rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [active, durationMs]);
  return progress;
}

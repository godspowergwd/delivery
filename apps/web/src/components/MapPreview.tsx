import { useEffect, useRef } from 'react';
import { MALAM_CENTER } from '../lib/live-map';
import { useLiveMap } from './LiveMap';

export function MapPreview({
  lat,
  lng,
  address,
  className = 'h-44',
  label,
}: {
  lat: number | null;
  lng: number | null;
  address: string;
  className?: string;
  label?: string;
}) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const valid =
    typeof lat === 'number' &&
    typeof lng === 'number' &&
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    lat >= -90 && lat <= 90 &&
    lng >= -180 && lng <= 180 &&
    (lat !== 0 || lng !== 0);
  const center = valid ? { lat: lat as number, lng: lng as number } : MALAM_CENTER;
  const mapRef = useLiveMap(hostRef, {
    center,
    zoom: 14,
    interactive: false,
    navigation: false,
  });

  useEffect(() => {
    if (!valid) {
      mapRef.current.setDestination(null);
      return;
    }
    const point = { lat: lat as number, lng: lng as number };
    mapRef.current.setDestination(point);
    mapRef.current.focus(point, { zoom: 14, durationMs: 0 });
  }, [lat, lng, mapRef, valid]);

  return (
    <div className={`map-shell ${className}`} role="img" aria-label={label ?? `Map preview of ${address}`}>
      {!valid && (
        <p className="sr-only">Pick a delivery location from the suggestions to pin it on this map.</p>
      )}
      <div ref={hostRef} className="map-canvas" />
    </div>
  );
}

import { useEffect, useRef } from 'react';
import { mapStyleUrl } from '../lib/live-map';
import { loadMapGL, type GLMap } from '../lib/map-engine';

/** Branded placeholder — a failed preview never leaves a blank pane behind. */
const PREVIEW_FALLBACK = '<div class="map-fallback">Map preview needs WebGL</div>';


/**
 * Compact read-only map preview (checkout, home delivery area): a red pin on
 * real Accra roads at the *selected real coordinate*. The GL engine is
 * lazy-loaded, shares the same tiles/style as the live tracking map, and never
 * blocks first paint. A map failure renders a branded placeholder card —
 * never a blank screen.
 */
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
  const valid = typeof lat === 'number' && typeof lng === 'number';
  const centerLat = valid ? (lat as number) : 5.571264;
  const centerLng = valid ? (lng as number) : -0.284093;

  useEffect(() => {
    let cancelled = false;
    let cleanup: (() => void) | null = null;

    void loadMapGL()
      .then((mapboxgl) => {
        const host = hostRef.current;
        if (cancelled || !host) return;
        let map: GLMap | null = null;
        try {
          if (!mapboxgl.supported()) throw new Error('WebGL is unavailable');
          map = new mapboxgl.Map({
            container: host,
            style: mapStyleUrl(),
            center: [centerLng, centerLat],
            zoom: 14,
            interactive: false,
          });
          map.on('load', () => {
            if (!map) return;
            const markerNode = document.createElement('div');
            markerNode.className = 'map-marker map-marker-destination';
            markerNode.innerHTML =
              '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 21s-6-5.3-6-10a6 6 0 0 1 12 0c0 4.7-6 10-6 10z"/><circle cx="12" cy="11" r="2.4"/></svg>';
            new mapboxgl.Marker({ element: markerNode })
              .setLngLat([centerLng, centerLat])
              .addTo(map!);
          });
          cleanup = () => map?.remove();
        } catch {
          host.innerHTML = PREVIEW_FALLBACK;
        }
      })
      .catch(() => {
        const host = hostRef.current;
        if (host && !cancelled) {
          host.innerHTML = PREVIEW_FALLBACK;
        }
      });

    return () => {
      cancelled = true;
      cleanup?.();
    };
  }, [centerLat, centerLng]);

  return (
    <div className={`map-shell ${className}`} role="img" aria-label={label ?? `Map preview of ${address}`}>
      {!valid && (
        <p className="sr-only">Pick a delivery location from the suggestions to pin it on this map.</p>
      )}
      <div ref={hostRef} className="map-canvas" />
    </div>
  );
}

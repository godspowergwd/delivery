import { useEffect, useRef } from 'react';
import { mapStyleUrl } from '../lib/live-map';

type MapGL = typeof import('maplibre-gl');
type GLMap = InstanceType<MapGL['Map']>;

let mapglPromise: Promise<MapGL> | null = null;
function loadMapGL(): Promise<MapGL> {
  if (!mapglPromise) {
    mapglPromise = (async () => {
      await import('maplibre-gl/dist/maplibre-gl.css');
      return import('maplibre-gl');
    })();
  }
  return mapglPromise;
}

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
      .then((maplibregl) => {
        const host = hostRef.current;
        if (cancelled || !host) return;
        let map: GLMap | null = null;
        try {
          map = new maplibregl.Map({
            container: host,
            style: mapStyleUrl(),
            center: [centerLng, centerLat],
            zoom: 14,
            attributionControl: { compact: true },
            interactive: false,
          });
          map.on('load', () => {
            if (!map) return;
            const markerNode = document.createElement('div');
            markerNode.className = 'map-marker map-marker-destination';
            markerNode.innerHTML =
              '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 21s-6-5.3-6-10a6 6 0 0 1 12 0c0 4.7-6 10-6 10z"/><circle cx="12" cy="11" r="2.4"/></svg>';
            new maplibregl.Marker({ element: markerNode })
              .setLngLat([centerLng, centerLat])
              .addTo(map!);
          });
          cleanup = () => map?.remove();
        } catch {
          host.innerHTML =
            '<div style="display:grid;place-items:center;height:100%;color:#6a7383;font-size:13px;text-align:center;padding:16px">Map preview needs WebGL</div>';
        }
      })
      .catch(() => {
        const host = hostRef.current;
        if (host && !cancelled) {
          host.innerHTML =
            '<div style="display:grid;place-items:center;height:100%;color:#6a7383;font-size:13px;text-align:center;padding:16px">Map preview needs WebGL</div>';
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

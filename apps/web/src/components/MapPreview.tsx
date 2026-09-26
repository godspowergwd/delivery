import { useEffect, useRef } from 'react';
import { mapStyleUrl } from '../lib/live-map';
import { dropUncoveredIncidentLayers, handleMissingStyleImage, loadMapGL, relaxStyleFilters, type GLMap } from '../lib/map-engine';

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
            // Native SDK pin — the preview owns no marker DOM of its own.
            new mapboxgl.Marker({ color: '#D40000', draggable: false })
              .setLngLat([centerLng, centerLat])
              .addTo(map!);
          });
          // Same console-cleanliness fixes as the live map: null-safe numeric
          // filters before the first tile, transparent pixels for sprite gaps.
          const onStyleLoad = (): void => {
            relaxStyleFilters(map!);
            // Same console-cleanliness fix as the live map: the navigation
            // style's incidents tiles 404 over Ghana and only add noise.
            dropUncoveredIncidentLayers(map!);
          };
          const onMissingImage = (event: unknown): void => {
            handleMissingStyleImage(map!, event);
          };
          map.on('style.load', onStyleLoad);
          map.on('styleimagemissing', onMissingImage);
          cleanup = () => {
            map?.off('style.load', onStyleLoad);
            map?.off('styleimagemissing', onMissingImage);
            map?.remove();
          };
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

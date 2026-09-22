import { useEffect, useMemo, useRef } from 'react';
import { estimateAddressCoordinates, mapStyleUrl } from '../lib/live-map';
import * as maplibregl from 'maplibre-gl';

/**
 * Compact read-only map preview (checkout, profile): a pin on real Accra roads.
 * Share the same tiles/style as the live tracking map so the brand feels whole.
 */
export function MapPreview({
  address,
  area,
  className = 'h-44',
  label,
}: {
  address: string;
  area?: string | null;
  className?: string;
  label?: string;
}) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const position = useMemo(() => estimateAddressCoordinates(address, area), [address, area]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    let map: maplibregl.Map | null = null;
    try {
      map = new maplibregl.Map({
        container: host,
        style: mapStyleUrl(),
        center: [position.lng, position.lat],
        zoom: 14,
        attributionControl: { compact: true },
        interactive: false,
      });
      map.on('load', () => {
        const markerNode = document.createElement('div');
        markerNode.className = 'map-marker map-marker-kitchen';
        markerNode.innerHTML =
          '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 21s-6-5.3-6-10a6 6 0 0 1 12 0c0 4.7-6 10-6 10z"/><circle cx="12" cy="11" r="2.4"/></svg>';
        new maplibregl.Marker({ element: markerNode }).setLngLat([position.lng, position.lat]).addTo(map!);
      });
    } catch {
      host.innerHTML =
        '<div style="display:grid;place-items:center;height:100%;color:#6a7383;font-size:13px;text-align:center;padding:16px">Map preview needs WebGL</div>';
    }
    return () => {
      map?.remove();
    };
  }, [position.lat, position.lng]);

  return (
    <div className={`map-shell ${className}`} role="img" aria-label={label ?? `Map preview of ${address}`}>
      <div ref={hostRef} className="map-canvas" />
    </div>
  );
}

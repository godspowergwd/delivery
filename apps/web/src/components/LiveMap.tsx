import { useEffect, useRef } from 'react';
import * as maplibregl from 'maplibre-gl';
import { KITCHEN_ANCHOR, mapStyleUrl, type LatLng } from '../lib/live-map';

export interface LiveMapHandle {
  map: maplibregl.Map | null;
  setRoute(coordinates: Array<[number, number]>): void;
  setProgress(coordinates: Array<[number, number]>, progress: number): void;
  moveDriver(position: LatLng, bearing?: number): void;
  moveDestination(position: LatLng): void;
}

function markerNode(kind: 'driver' | 'pin'): HTMLElement {
  const node = document.createElement('div');
  node.className = kind === 'driver' ? 'map-marker map-marker-driver' : 'map-marker map-marker-kitchen';
  node.innerHTML =
    kind === 'driver'
      ? '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="5.5" cy="17.5" r="3"/><circle cx="18.5" cy="17.5" r="3"/><path d="M6.5 17.5h6l3-7h3"/><path d="M12.5 10.5 11 6h-2"/></svg>'
      : '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 21s-6-5.3-6-10a6 6 0 0 1 12 0c0 4.7-6 10-6 10z"/><circle cx="12" cy="11" r="2.4"/></svg>';
  return node;
}

/** Lazy MapLibre wrapper: map, blue route line, progress overlay, markers. */
export function useLiveMap(
  containerRef: React.RefObject<HTMLDivElement | null>,
  options?: { center?: LatLng; zoom?: number },
): React.MutableRefObject<LiveMapHandle> {
  const handleRef = useRef<LiveMapHandle>({
    map: null,
    setRoute: () => undefined,
    setProgress: () => undefined,
    moveDriver: () => undefined,
    moveDestination: () => undefined,
  });

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const center = options?.center ?? KITCHEN_ANCHOR;
    let map: maplibregl.Map | null = null;
    let driverMarker: maplibregl.Marker | null = null;
    let destinationMarker: maplibregl.Marker | null = null;
    let cancelled = false;
    void options;
    try {
      map = new maplibregl.Map({
        container,
        style: mapStyleUrl(),
        center: [center.lng, center.lat],
        zoom: 13,
        attributionControl: { compact: true },
      });
      map.addControl(new maplibregl.NavigationControl({ showCompass: true }), 'top-right');
    } catch {
      container.innerHTML =
        '<div style="display:grid;place-items:center;height:100%;padding:24px;text-align:center;color:#6a7383;font-size:14px">Live map needs WebGL — route details are listed below.</div>';
      return () => {
        cancelled = true;
      };
    }

    const mapInstance = map;
    handleRef.current.map = mapInstance;

    mapInstance.on('load', () => {
      if (cancelled) return;
      mapInstance.addSource('onyx-route', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
      });
      mapInstance.addSource('onyx-route-done', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
      });
      mapInstance.addLayer({
        id: 'onyx-route-base',
        type: 'line',
        source: 'onyx-route',
        paint: { 'line-color': '#93b8f5', 'line-width': 7, 'line-opacity': 0.5 },
      });
      mapInstance.addLayer({
        id: 'onyx-route-line',
        type: 'line',
        source: 'onyx-route',
        paint: { 'line-color': '#2456e6', 'line-width': 4.5, 'line-opacity': 0.95 },
      });
      mapInstance.addLayer({
        id: 'onyx-route-done',
        type: 'line',
        source: 'onyx-route-done',
        paint: { 'line-color': '#0b9663', 'line-width': 5, 'line-opacity': 0.95 },
      });
      driverMarker = new maplibregl.Marker({ element: markerNode('driver') })
        .setLngLat([center.lng, center.lat])
        .addTo(mapInstance);
    });

    const setSource = (id: string, coordinates: Array<[number, number]>) => {
      const source = mapInstance.getSource(id) as maplibregl.GeoJSONSource | undefined;
      if (!source) return;
      source.setData({
        type: 'Feature',
        properties: {},
        geometry: { type: 'LineString', coordinates },
      } as never);
    };

    handleRef.current.setRoute = (coordinates) => {
      if (!mapInstance.isStyleLoaded()) {
        mapInstance.once('load', () => handleRef.current.setRoute(coordinates));
        return;
      }
      setSource('onyx-route', coordinates);
      setSource('onyx-route-done', []);
      if (coordinates.length > 1) {
        const bounds = new maplibregl.LngLatBounds();
        for (const point of coordinates) bounds.extend(point);
        mapInstance.fitBounds(bounds, { padding: 56, maxZoom: 15, duration: 600 });
      }
    };

    handleRef.current.setProgress = (coordinates, progress) => {
      const count = Math.max(2, Math.floor(coordinates.length * Math.min(1, Math.max(0, progress))));
      setSource('onyx-route-done', coordinates.slice(0, count));
    };

    handleRef.current.moveDriver = (position) => {
      if (!driverMarker) {
        driverMarker = new maplibregl.Marker({ element: markerNode('driver') })
          .setLngLat([position.lng, position.lat])
          .addTo(mapInstance);
      } else {
        driverMarker.setLngLat([position.lng, position.lat]);
      }
    };

    handleRef.current.moveDestination = (position) => {
      if (!destinationMarker) {
        destinationMarker = new maplibregl.Marker({ element: markerNode('pin') })
          .setLngLat([position.lng, position.lat])
          .addTo(mapInstance);
      } else {
        destinationMarker.setLngLat([position.lng, position.lat]);
      }
    };

    return () => {
      cancelled = true;
      driverMarker?.remove();
      destinationMarker?.remove();
      mapInstance.remove();
      handleRef.current = {
        map: null,
        setRoute: () => undefined,
        setProgress: () => undefined,
        moveDriver: () => undefined,
        moveDestination: () => undefined,
      };
    };
  }, [containerRef]);

  return handleRef;
}

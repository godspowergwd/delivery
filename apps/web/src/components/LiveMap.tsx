import { useEffect, useRef, type ReactNode, type RefObject } from 'react';
import * as maplibregl from 'maplibre-gl';
import { DEFAULT_MAP_ZOOM, KITCHEN_ANCHOR, mapStyleUrl, type LatLng } from '../lib/live-map';

/**
 * MapLibre GL wrapper for the delivery maps.
 *
 * Everything drawn here comes from real data: the driver marker is the driver's
 * own device GPS, the destination is the coordinate captured at checkout and the
 * restaurant is the admin-configured kitchen anchor. The only motion that is not
 * a raw fix is the smoothing between two real fixes, so the marker glides
 * instead of jumping.
 */

export type MapMarkerKind = 'driver' | 'destination' | 'restaurant' | 'user';

export interface LiveMapHandle {
  getMap(): maplibregl.Map | null;
  /** Draws the delivery route (remaining leg). */
  setRoute(coordinates: Array<[number, number]>, options?: { fit?: boolean }): void;
  /** Paints the part of the route already covered, in green. */
  setProgress(coordinates: Array<[number, number]>): void;
  setDriver(point: LatLng | null, options?: { animate?: boolean; accuracyMetres?: number | null }): void;
  setDestination(point: LatLng | null): void;
  setRestaurant(point: LatLng | null): void;
  /** The device's own position ("you are here" marker). */
  setUser(point: LatLng | null, accuracyMetres?: number | null): void;
  focus(point: LatLng, options?: { zoom?: number; durationMs?: number; padding?: number }): void;
  fit(points: LatLng[], options?: { padding?: number; maxZoom?: number; durationMs?: number }): void;
  setFollow(follow: boolean): void;
  isFollowing(): boolean;
  /** Re-measures the canvas (needed when the container becomes full-screen). */
  resize(): void;
}

const ROUTE_SOURCE = 'onyx-route';
const DONE_SOURCE = 'onyx-route-done';

const MARKER_SVG: Record<MapMarkerKind, string> = {
  driver:
    '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><circle cx="5.5" cy="17.5" r="3"/><circle cx="18.5" cy="17.5" r="3"/><path d="M6.5 17.5h6l3-7h3"/><path d="M12.5 10.5 11 6h-2"/></svg>',
  destination:
    '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M12 21s7-6.2 7-11.2A7 7 0 1 0 5 9.8C5 14.8 12 21 12 21z"/><circle cx="12" cy="9.8" r="2.6"/></svg>',
  restaurant:
    '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M4 9.5 5.4 4h13.2L20 9.5"/><path d="M5.5 12v7a1 1 0 0 0 1 1h11a1 1 0 0 0 1-1v-7"/><path d="M10 20v-4.5h4V20"/></svg>',
  user:
    '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3.2"/><circle cx="12" cy="12" r="7.5"/></svg>',
};

function markerNode(kind: MapMarkerKind): HTMLElement {
  const node = document.createElement('div');
  node.className = `map-marker map-marker-${kind}`;
  node.innerHTML = MARKER_SVG[kind];
  return node;
}

function emptyCollection(): { type: 'FeatureCollection'; features: never[] } {
  return { type: 'FeatureCollection', features: [] };
}

function lineFeature(coordinates: Array<[number, number]>): { type: 'Feature'; properties: Record<string, never>; geometry: { type: 'LineString'; coordinates: Array<[number, number]> } } {
  return {
    type: 'Feature',
    properties: {},
    geometry: { type: 'LineString', coordinates },
  };
}

function distanceMeters(from: LatLng, to: LatLng): number {
  const earth = 6_371_000;
  const toRad = (degrees: number) => (degrees * Math.PI) / 180;
  const dLat = toRad(to.lat - from.lat);
  const dLng = toRad(to.lng - from.lng);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(from.lat)) * Math.cos(toRad(to.lat)) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
  return 2 * earth * Math.asin(Math.sqrt(a));
}

export interface UseLiveMapOptions {
  center?: LatLng;
  zoom?: number;
  interactive?: boolean;
  /** Notified when the user pans or zooms away from the followed position. */
  onUserInteract?: () => void;
}

/**
 * Creates the map once and exposes imperative, frame-efficient updates so a new
 * GPS fix never re-renders the React tree around it.
 */
export function useLiveMap(
  containerRef: RefObject<HTMLDivElement | null>,
  options: UseLiveMapOptions = {},
): RefObject<LiveMapHandle> {
  const handleRef = useRef<LiveMapHandle>(emptyHandle());
  const optionsRef = useRef(options);
  optionsRef.current = options;

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const center = optionsRef.current.center ?? KITCHEN_ANCHOR;
    const interactive = optionsRef.current.interactive ?? true;
    let cancelled = false;
    let map: maplibregl.Map | null = null;

    try {
      map = new maplibregl.Map({
        container,
        style: mapStyleUrl(),
        center: [center.lng, center.lat],
        zoom: optionsRef.current.zoom ?? DEFAULT_MAP_ZOOM,
        attributionControl: { compact: true },
        interactive,
        // Delivery focus: never a world view, never accidental rotation.
        maxZoom: 18,
        minZoom: 10,
      });
      if (interactive) {
        map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');
      }
    } catch {
      container.innerHTML =
        '<div class="map-fallback">Live map needs WebGL on this device — the delivery details are listed below.</div>';
      return () => {
        cancelled = true;
      };
    }

    const mapInstance = map;
    let following = false;
    let animationFrame = 0;
    let accuracyMarker: maplibregl.Marker | null = null;
    const markers: Partial<Record<MapMarkerKind, maplibregl.Marker>> = {};
    const targets: Partial<Record<MapMarkerKind, LatLng>> = {};
    const displayed: Partial<Record<MapMarkerKind, LatLng>> = {};

    const releaseFollow = () => {
      if (!following) return;
      following = false;
      optionsRef.current.onUserInteract?.();
    };
    mapInstance.on('dragstart', releaseFollow);
    mapInstance.on('zoomstart', (event: unknown) => {
      const original = (event as { originalEvent?: unknown } | undefined)?.originalEvent;
      if (original) releaseFollow();
    });
    // A dropped tile must never break tracking: markers keep updating regardless.
    mapInstance.on('error', () => undefined);

    const ensureRouteLayers = () => {
      if (mapInstance.getSource(ROUTE_SOURCE)) return;
      mapInstance.addSource(ROUTE_SOURCE, { type: 'geojson', data: emptyCollection() });
      mapInstance.addSource(DONE_SOURCE, { type: 'geojson', data: emptyCollection() });
      mapInstance.addLayer({
        id: 'onyx-route-casing',
        type: 'line',
        source: ROUTE_SOURCE,
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': '#ffffff', 'line-width': 11, 'line-opacity': 0.92 },
      });
      mapInstance.addLayer({
        id: 'onyx-route-line',
        type: 'line',
        source: ROUTE_SOURCE,
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': '#e30613', 'line-width': 6.5, 'line-opacity': 0.96 },
      });
      mapInstance.addLayer({
        id: 'onyx-route-done',
        type: 'line',
        source: DONE_SOURCE,
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': '#0b9663', 'line-width': 6.5, 'line-opacity': 0.96 },
      });
    };

    function setSourceData(id: string, coordinates: Array<[number, number]>): void {
      if (!mapInstance.isStyleLoaded()) return;
      const source = mapInstance.getSource(id) as maplibregl.GeoJSONSource | undefined;
      if (!source) return;
      source.setData(coordinates.length === 0 ? emptyCollection() : lineFeature(coordinates));
    }

    function placeMarker(kind: MapMarkerKind, point: LatLng, animate: boolean): void {
      targets[kind] = point;
      if (!mapInstance.isStyleLoaded()) return;
      const previous = displayed[kind];
      const existing = markers[kind];

      if (!existing) {
        markers[kind] = new maplibregl.Marker({
          element: markerNode(kind),
          anchor: kind === 'user' ? 'center' : 'bottom',
        })
          .setLngLat([point.lng, point.lat])
          .addTo(mapInstance);
        displayed[kind] = point;
        return;
      }

      if (!animate || !previous) {
        existing.setLngLat([point.lng, point.lat]);
        displayed[kind] = point;
        return;
      }

      // Glide between two real fixes — the path is the device's own tracking.
      const from = { ...previous };
      const startedAt = performance.now();
      const duration = 900;
      cancelAnimationFrame(animationFrame);
      const step = (now: number) => {
        const t = Math.min(1, (now - startedAt) / duration);
        const eased = t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
        const lat = from.lat + (point.lat - from.lat) * eased;
        const lng = from.lng + (point.lng - from.lng) * eased;
        markers[kind]?.setLngLat([lng, lat]);
        displayed[kind] = { lat, lng };
        if (t < 1 && !cancelled) animationFrame = requestAnimationFrame(step);
      };
      animationFrame = requestAnimationFrame(step);
    }

    function updateAccuracyHalo(point: LatLng, accuracyMetres: number | null): void {
      if (!accuracyMetres || accuracyMetres <= 0 || !mapInstance.isStyleLoaded()) {
        accuracyMarker?.remove();
        accuracyMarker = null;
        return;
      }
      const size = Math.min(260, Math.max(28, Math.round(accuracyMetres * 2)));
      if (!accuracyMarker) {
        const node = document.createElement('div');
        node.className = 'map-accuracy';
        node.style.width = `${size}px`;
        node.style.height = `${size}px`;
        accuracyMarker = new maplibregl.Marker({ element: node, anchor: 'center' })
          .setLngLat([point.lng, point.lat])
          .addTo(mapInstance);
        return;
      }
      const element = accuracyMarker.getElement();
      element.style.width = `${size}px`;
      element.style.height = `${size}px`;
      accuracyMarker.setLngLat([point.lng, point.lat]);
    }

    function followIfNeeded(): void {
      const driver = targets.driver;
      if (!following || !driver) return;
      const current = mapInstance.getCenter();
      const movedMetres = distanceMeters({ lat: current.lat, lng: current.lng }, driver);
      if (movedMetres < 6) return;
      mapInstance.easeTo({
        center: [driver.lng, driver.lat],
        duration: Math.min(1400, Math.max(450, movedMetres * 14)),
      });
    }

    mapInstance.on('load', () => {
      if (cancelled) return;
      ensureRouteLayers();
      for (const kind of Object.keys(targets) as MapMarkerKind[]) {
        const point = targets[kind];
        if (point) placeMarker(kind, point, false);
      }
    });


    handleRef.current = {
      getMap: () => mapInstance,
      setRoute: (coordinates, routeOptions) => {
        if (!mapInstance.isStyleLoaded()) {
          mapInstance.once('load', () => handleRef.current.setRoute(coordinates, routeOptions));
          return;
        }
        ensureRouteLayers();
        setSourceData(ROUTE_SOURCE, coordinates);
        setSourceData(DONE_SOURCE, []);
        if (routeOptions?.fit !== false && coordinates.length > 1) {
          const bounds = new maplibregl.LngLatBounds();
          for (const point of coordinates) bounds.extend(point);
          mapInstance.fitBounds(bounds, {
            padding: { top: 130, bottom: 250, left: 56, right: 56 },
            maxZoom: 15,
            duration: 700,
          });
        }
      },
      setProgress: (coordinates) => setSourceData(DONE_SOURCE, coordinates),
      setDriver: (point, driverOptions) => {
        if (!point) {
          markers.driver?.remove();
          delete markers.driver;
          delete displayed.driver;
          delete targets.driver;
          accuracyMarker?.remove();
          accuracyMarker = null;
          return;
        }
        placeMarker('driver', point, driverOptions?.animate ?? true);
        updateAccuracyHalo(point, driverOptions?.accuracyMetres ?? null);
        followIfNeeded();
      },
      setDestination: (point) => {
        if (!point) {
          markers.destination?.remove();
          delete markers.destination;
          return;
        }
        placeMarker('destination', point, false);
      },
      setRestaurant: (point) => {
        if (!point) {
          markers.restaurant?.remove();
          delete markers.restaurant;
          return;
        }
        placeMarker('restaurant', point, false);
      },
      setUser: (point, accuracyMetres) => {
        if (!point) {
          markers.user?.remove();
          delete markers.user;
          accuracyMarker?.remove();
          accuracyMarker = null;
          return;
        }
        placeMarker('user', point, true);
        updateAccuracyHalo(point, accuracyMetres ?? null);
      },
      focus: (point, camera) =>
        mapInstance.easeTo({
          center: [point.lng, point.lat],
          zoom: camera?.zoom ?? Math.max(mapInstance.getZoom(), 15),
          duration: camera?.durationMs ?? 700,
          padding: camera?.padding
            ? { top: camera.padding, bottom: camera.padding, left: camera.padding, right: camera.padding }
            : undefined,
        }),
      fit: (points, fitOptions) => {
        if (points.length === 0) return;
        const padding = fitOptions?.padding ?? 72;
        if (points.length === 1) {
          handleRef.current.focus(points[0], { durationMs: fitOptions?.durationMs ?? 600 });
          return;
        }
        const bounds = new maplibregl.LngLatBounds();
        for (const point of points) bounds.extend([point.lng, point.lat]);
        mapInstance.fitBounds(bounds, {
          padding: { top: padding, bottom: padding + 110, left: padding, right: padding },
          maxZoom: fitOptions?.maxZoom ?? 15,
          duration: fitOptions?.durationMs ?? 700,
        });
      },
      setFollow: (next) => {
        following = next;
        if (next) {
          handleRef.current.focus(targets.driver ?? center, {
            zoom: Math.max(mapInstance.getZoom(), 15.5),
            durationMs: 600,
          });
        }
      },
      isFollowing: () => following,
      resize: () => mapInstance.resize(),
    };

    return () => {
      cancelled = true;
      cancelAnimationFrame(animationFrame);
      for (const marker of Object.values(markers)) marker?.remove();
      accuracyMarker?.remove();
      mapInstance.remove();
      handleRef.current = emptyHandle();
    };
    // The map is created once per mounted container on purpose.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [containerRef]);

  return handleRef;
}

function emptyHandle(): LiveMapHandle {
  return {
    getMap: () => null,
    setRoute: () => undefined,
    setProgress: () => undefined,
    setDriver: () => undefined,
    setDestination: () => undefined,
    setRestaurant: () => undefined,
    setUser: () => undefined,
    focus: () => undefined,
    fit: () => undefined,
    setFollow: () => undefined,
    isFollowing: () => false,
    resize: () => undefined,
  };
}

/** Full-bleed map surface. Pass overlay controls as children. */
export function LiveMap({
  mapRef,
  className = '',
  ariaLabel = 'Delivery map',
  children,
}: {
  mapRef: RefObject<HTMLDivElement | null>;
  className?: string;
  ariaLabel?: string;
  children?: ReactNode;
}) {
  return (
    <div className={`map-shell map-fullscreen ${className}`} role="application" aria-label={ariaLabel}>
      <div ref={mapRef} className="map-canvas" />
      {children}
    </div>
  );
}

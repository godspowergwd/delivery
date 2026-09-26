import { useEffect, useRef, useState, type ReactNode, type RefObject } from 'react';
import { DEFAULT_MAP_ZOOM, KITCHEN_ANCHOR, mapFallbackStyleUrl, mapStyleUrl, type LatLng } from '../lib/live-map';
import {
  handleMissingStyleImage,
  loadMapGL,
  relaxStyleFilters,
  type GLMap,
  type GLMarker,
  type MapboxGL,
} from '../lib/map-engine';

/**
 * Mapbox GL wrapper for the delivery maps.
 *
 * The GL engine (Mapbox GL JS + keyless OpenFreeMap vector tiles by default,
 * or the Mapbox-hosted basemap when VITE_MAPBOX_TOKEN is configured) is loaded
 * lazily so the renderer never blocks first paint: maps download only when a
 * screen actually mounts one.
 *
 * Everything drawn here comes from real data: the driver marker is the
 * driver's own device GPS, the destination is the coordinate captured at
 * checkout and the restaurant is the admin-configured kitchen anchor. The only
 * motion that is not a raw fix is the smoothing between two real fixes, so the
 * marker glides instead of jumping.
 */

/**
 * Strict Mode mounts each screen twice (mount -> unmount -> mount). A second
 * `new Map(...)` on a container that still carries a renderer throws
 * ("Map container is already initialized"), so the live instance is remembered
 * per container: re-entry always tears the previous engine down first and no
 * container ever stacks two canvases.
 */
const activeMaps = new WeakMap<HTMLDivElement, GLMap>();

export type MapMarkerKind = 'driver' | 'destination' | 'restaurant' | 'user';

export interface LiveMapHandle {
  getMap(): GLMap | null;
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

/** Branded placeholder — a failed map never leaves a blank pane behind. */
function showFallback(container: HTMLElement, message: string): void {
  container.innerHTML = `<div class="map-fallback">${message}</div>`;
}

/** Camera inputs are only ever finite, real coordinates. */
function isUsablePoint(point: LatLng | null | undefined): point is LatLng {
  return Boolean(point) && Number.isFinite(point?.lat) && Number.isFinite(point?.lng);
}

/** Recovery card with a real retry action (never a page reload). */
function showRecovery(container: HTMLElement, message: string, onRetry: () => void): void {
  container.innerHTML =
    `<div class="map-fallback"><p>${message}</p><button type="button" data-map-retry>Retry map</button></div>`;
  container.querySelector('button[data-map-retry]')?.addEventListener('click', onRetry);
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
  /** Show Mapbox's built-in zoom control. Screens with their own floating
   *  controls (the driver map) pass false; defaults to `interactive`. */
  navigation?: boolean;
  /**
   * Engage camera-follow immediately: the driver map starts following its own
   * GPS fix, the customer screens keep both markers in view.
   */
  follow?: boolean;
  /**
   * `center` pins the followed driver marker to the middle of the map (driver
   * navigation); `bounds` moves the camera only when the driver or the
   * destination would leave the view (customer tracking). Defaults to `center`.
   */
  followMode?: 'center' | 'bounds';
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

  // Lazily pull the GL engine; the map mounts the moment it lands.
  const [mapgl, setMapgl] = useState<MapboxGL | null>(null);
  useEffect(() => {
    let cancelled = false;
    loadMapGL()
      .then((engine) => {
        if (!cancelled) setMapgl(engine);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const mapboxgl = mapgl;
    if (!mapboxgl) return;

    let cancelled = false;
    let timer = 0;
    let dispose: (() => void) | null = null;
    /** Assigned below; the indirection lets the retry card restart the map. */
    let start: () => void = () => undefined;
    /**
     * Self-healing budget, shared across every attempt so a permanently broken
     * renderer ends in the retry card instead of rebuilding forever.
     */
    let rebuilds = 0;

    /**
     * Full in-place restart — used by the retry button and by self-healing.
     * It drops the current renderer, clears any recovery content and starts a
     * fresh attempt on the same container (no page reload, no duplicate maps).
     * Returns `false` once the budget is spent.
     */
    const rebuild = (): boolean => {
      if (cancelled || rebuilds >= 3) return false;
      rebuilds += 1;
      dispose?.();
      dispose = null;
      // The old renderer's dispose flips the shared flag; the effect itself is
      // still mounted, so re-arm it before the fresh attempt.
      cancelled = false;
      const container = containerRef.current;
      if (container) container.innerHTML = '';
      start();
      return true;
    };

    /** User-driven retry: always allowed, and it resets the self-healing budget. */
    const retry = (): void => {
      rebuilds = 0;
      rebuild();
    };

    const initMap = (container: HTMLDivElement): (() => void) => {
      // A container that still carries a live renderer (Strict Mode re-entry or
      // a fast remount) is torn down first — `new Map` would otherwise throw.
      const stale = activeMaps.get(container);
      if (stale) {
        try {
          stale.remove();
        } catch {
          /* the previous renderer was already half-torn-down */
        }
        activeMaps.delete(container);
      }
      // Content from an earlier attempt (fallback/retry card) must not survive
      // underneath the new renderer.
      container.innerHTML = '';
      if (!mapboxgl.supported()) {
        showFallback(container, 'Live map needs WebGL on this device — the delivery details are listed below.');
        return () => undefined;
      }

      const center = optionsRef.current.center ?? KITCHEN_ANCHOR;
      const interactive = optionsRef.current.interactive ?? true;
      const showNavigation = optionsRef.current.navigation ?? interactive;

      let map: GLMap;
      try {
        map = new mapboxgl.Map({
          container,
          style: mapStyleUrl(),
          center: [center.lng, center.lat],
          zoom: optionsRef.current.zoom ?? DEFAULT_MAP_ZOOM,
          // Attribution stays visible but compact — the provider always gets
          // credit without a full-width bar over the delivery details.
          attributionControl: false,
          interactive,
          // Delivery focus: never a world view, never accidental rotation.
          maxZoom: 18,
          minZoom: 10,
        });
        map.addControl(new mapboxgl.AttributionControl({ compact: true }), 'bottom-right');
        if (showNavigation) {
          map.addControl(new mapboxgl.NavigationControl({ showCompass: false }), 'top-right');
        }
      } catch {
        showRecovery(
          container,
          'The live map could not start. Check your connection and try again.',
          retry,
        );
        return () => undefined;
      }

      const mapInstance = map;
      activeMaps.set(container, mapInstance);
      let following = optionsRef.current.follow ?? false;
      const followMode = (): 'center' | 'bounds' => optionsRef.current.followMode ?? 'center';
      let animationFrame = 0;
      let accuracyMarker: GLMarker | null = null;
      const markers: Partial<Record<MapMarkerKind, GLMarker>> = {};
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
      // Errors are handled in the resilience block below (style fallback etc.).
      // Tile hiccups stay quiet there: markers keep updating regardless.

      const ensureRouteLayers = () => {
        if (cancelled || mapInstance._removed) return;
        if (mapInstance.getSource(ROUTE_SOURCE) && mapInstance.getLayer('onyx-route-line')) return;
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

      // Arrow consts (not hoisted function declarations) so the non-null
      // `mapboxgl` narrowing from the guard above is preserved inside them.
      const setSourceData = (id: string, coordinates: Array<[number, number]>): void => {
        if (!mapInstance.isStyleLoaded()) return;
        const source = mapInstance.getSource(id) as import('mapbox-gl').GeoJSONSource | undefined;
        if (!source) return;
        source.setData(coordinates.length === 0 ? emptyCollection() : lineFeature(coordinates));
      };

      const placeMarker = (kind: MapMarkerKind, point: LatLng, animate: boolean): void => {
        if (!isUsablePoint(point)) return; // never place a marker on a broken coordinate
        targets[kind] = point;
        if (!mapInstance.isStyleLoaded()) return;
        const previous = displayed[kind];
        if (!previous || !animate || !markers[kind]) {
          markers[kind]?.remove();
          markers[kind] = new mapboxgl.Marker({
            element: markerNode(kind),
            anchor: kind === 'destination' || kind === 'restaurant' ? 'bottom' : 'center',
          })
            .setLngLat([point.lng, point.lat])
            .addTo(mapInstance);
          displayed[kind] = { ...point };
          return;
        }
        // Ease between two real fixes so the marker glides instead of jumping:
        // no invented positions, only interpolation between actual GPS samples.
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
      };

      const updateAccuracyHalo = (point: LatLng, accuracyMetres: number | null): void => {
        if (!isUsablePoint(point) || !accuracyMetres || accuracyMetres <= 0 || !mapInstance.isStyleLoaded()) {
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
          accuracyMarker = new mapboxgl.Marker({ element: node, anchor: 'center' })
            .setLngLat([point.lng, point.lat])
            .addTo(mapInstance);
          return;
        }
        const element = accuracyMarker.getElement();
        element.style.width = `${size}px`;
        element.style.height = `${size}px`;
        accuracyMarker.setLngLat([point.lng, point.lat]);
      };

      /**
       * True when both tracked markers sit comfortably inside the current view.
       * The 44px margin is deliberately smaller than the fit padding used below
       * (~56px), so a re-fit always pushes the markers back inside the margin —
       * the camera cannot ping-pong between two nearly identical fits.
       */
      const bothMarkersVisible = (driver: LatLng, destination: LatLng): boolean => {
        const bounds = mapInstance.getBounds();
        if (!bounds) return false;
        const container = mapInstance.getContainer();
        const minSide = Math.max(1, Math.min(container.clientWidth, container.clientHeight));
        const ratio = Math.min(0.14, 44 / minSide);
        const latMargin = (bounds.getNorth() - bounds.getSouth()) * ratio;
        const lngMargin = (bounds.getEast() - bounds.getWest()) * ratio;
        const within = (point: LatLng): boolean =>
          point.lat >= bounds.getSouth() + latMargin &&
          point.lat <= bounds.getNorth() - latMargin &&
          point.lng >= bounds.getWest() + lngMargin &&
          point.lng <= bounds.getEast() - lngMargin;
        return within(driver) && within(destination);
      };

      const followIfNeeded = (force = false): void => {
        const driver = targets.driver;
        if (!following || !isUsablePoint(driver) || !containerSized()) return;
        const destination = targets.destination;
        if (followMode() === 'bounds' && destination) {
          // Customer tracking: only move when a marker is about to leave the
          // view, then fit both — the courier and the drop-off stay visible.
          if (!force && bothMarkersVisible(driver, destination)) return;
          handleRef.current.fit([driver, destination], {
            padding: 56,
            maxZoom: 15,
            durationMs: force ? 600 : 700,
          });
          return;
        }
        const current = mapInstance.getCenter();
        const movedMetres = distanceMeters({ lat: current.lat, lng: current.lng }, driver);
        if (!Number.isFinite(movedMetres)) return;
        if (!force && movedMetres < 6) return;
        mapInstance.easeTo({
          center: [driver.lng, driver.lat],
          duration: force ? 600 : Math.min(1400, Math.max(450, movedMetres * 14)),
        });
      };

      // ---------------------------------------------------------------------
      // Resilience: the map must never stay white.
      //
      // Everything below watches the renderer's real state — canvas attached,
      // canvas matched to its container, style loaded, camera finite — and
      // repairs or rebuilds in place instead of leaving a blank pane behind.
      // ---------------------------------------------------------------------
      const canvas = mapInstance.getCanvas();
      const containerSized = (): boolean => container.clientWidth > 0 && container.clientHeight > 0;

      /** Zoom is always finite (a NaN transform paints nothing). */
      const safeZoom = (): number => {
        const zoom = mapInstance.getZoom();
        return Number.isFinite(zoom) ? zoom : optionsRef.current.zoom ?? DEFAULT_MAP_ZOOM;
      };

      /** Fit padding that can never swallow the viewport (that yields an infinite zoom). */
      const clampPadding = (
        top: number,
        bottom: number,
        side: number,
      ): { top: number; bottom: number; left: number; right: number } => {
        const height = Math.max(1, container.clientHeight);
        const width = Math.max(1, container.clientWidth);
        return {
          top: Math.min(top, Math.floor(height / 3)),
          bottom: Math.min(bottom, Math.floor(height / 3)),
          left: Math.min(side, Math.floor(width / 4)),
          right: Math.min(side, Math.floor(width / 4)),
        };
      };

      /**
       * Route + progress survive a style (re)load. A deferred first style and a
       * swapped-in fallback style both recreate empty sources, so the last known
       * geometry is re-applied on every style event instead of silently vanishing.
       */
      let pendingRoute: Array<[number, number]> | null = null;
      let pendingProgress: Array<[number, number]> = [];
      let appliedRoute: Array<[number, number]> | null = null;
      let appliedProgress: Array<[number, number]> = [];
      const applyRoute = (force = false): void => {
        if (!pendingRoute || !mapInstance.isStyleLoaded()) return;
        ensureRouteLayers();
        // Identity-guarded so repeated style events cannot feed themselves.
        if (force || appliedRoute !== pendingRoute) {
          setSourceData(ROUTE_SOURCE, pendingRoute);
          appliedRoute = pendingRoute;
        }
        if (force || appliedProgress !== pendingProgress) {
          setSourceData(DONE_SOURCE, pendingProgress.length > 1 ? pendingProgress : []);
          appliedProgress = pendingProgress;
        }
      };

      /** Keeps the drawing buffer matched to the real container box. */
      const syncCanvas = (): void => {
        if (cancelled || !containerSized()) return;
        const live = mapInstance.getCanvas();
        if (!live || !live.isConnected) return;
        if (live.clientWidth !== container.clientWidth || live.clientHeight !== container.clientHeight) {
          try {
            mapInstance.resize();
          } catch {
            /* the watchdog / context handlers own the recovery */
          }
        }
      };

      /** A broken camera (NaN zoom or centre) paints nothing: snap it back. */
      let cameraHeals = 0;
      const healCamera = (): void => {
        const centerNow = mapInstance.getCenter();
        const zoomNow = mapInstance.getZoom();
        if (Number.isFinite(zoomNow) && Number.isFinite(centerNow.lng) && Number.isFinite(centerNow.lat)) {
          cameraHeals = 0;
          return;
        }
        cameraHeals += 1;
        const anchor = isUsablePoint(targets.driver) ? targets.driver : center;
        try {
          // A jump that keeps failing means the renderer itself is gone.
          if (cameraHeals <= 2) {
            mapInstance.jumpTo({ center: [anchor.lng, anchor.lat], zoom: safeZoom(), bearing: 0, pitch: 0 });
          } else if (!rebuild()) {
            showRecovery(container, 'The live map stopped rendering on this device.', retry);
            return;
          }
        } catch {
          if (!rebuild()) showRecovery(container, 'The live map stopped rendering on this device.', retry);
          return;
        }
        syncCanvas();
      };

      // Style failures (offline first paint, blocked domain, revoked token):
      // switch to the keyless style once, then offer the retry card.
      //
      // `styleReady` flips as soon as the first style data lands. It is the only
      // safe trigger: `isStyleLoaded()` stays false until *all sources* (tiles
      // included) finish, so a transient tile hiccup must never swap the style.
      let styleReady = false;
      let triedFallbackStyle = false;
      const styleWatchdog = window.setTimeout(() => {
        if (cancelled || styleReady) return;
        if (!triedFallbackStyle) {
          triedFallbackStyle = true;
          try {
            mapInstance.setStyle(mapFallbackStyleUrl());
          } catch {
            showRecovery(container, 'The map style could not be loaded. Check your connection and retry.', retry);
          }
        }
      }, 12_000);

      const onMapError = (event: unknown): void => {
        // Tile hiccups are normal on a flaky network and stay quiet: they are
        // recoverable and the markers keep updating regardless. Only a style
        // that never produced any data is worth a real recovery.
        if (styleReady) return;
        const error = (event as { error?: { status?: number; message?: string } } | undefined)?.error;
        const message = typeof error?.message === 'string' ? error.message : '';
        // An explicit style/resource failure must name the style document, the
        // token, or an auth status — never a layer id from application code
        // (e.g. a `queryRenderedFeatures` on a not-yet-added layer, which the
        // engine re-fires as an `error` event).
        const looksLikeStyle =
          error?.status === 401 || error?.status === 403 || /style\.json|stylesheet|sprite|glyphs|token|unauthor/i.test(message);
        if (!looksLikeStyle) return;
        if (!triedFallbackStyle) {
          triedFallbackStyle = true;
          try {
            mapInstance.setStyle(mapFallbackStyleUrl());
          } catch {
            showRecovery(container, 'The map style could not be loaded. Check your connection and retry.', retry);
          }
          return;
        }
        showRecovery(container, 'The map style could not be loaded. Check your connection and retry.', retry);
      };
      mapInstance.on('error', onMapError);

      // A style swap (fallback provider) drops sources and layers: re-add them.
      // `getSource` answers from the new style document while the old layers
      // are still being torn down, so the check must cover the layer as well —
      // otherwise one swap registers the same layer id twice and the engine
      // throws `Layer with id "…" already exists`.
      const onStyleData = (): void => {
        if (cancelled || mapInstance._removed) return;
        styleReady = true;
        try {
          ensureRouteLayers();
        } catch {
          /* a torn-down transition re-applies `applyRoute` on the next event */
        }
      };
      mapInstance.on('styledata', onStyleData);

      // `style.load` fires for every style the map installs — the initial one and
      // each swapped-in fallback. The sources are empty at that point, so the
      // last known geometry is force-re-applied instead of silently vanishing.
      const onStyleLoad = (): void => {
        if (cancelled || mapInstance._removed) return;
        styleReady = true;
        window.clearTimeout(styleWatchdog);
        // Before the first tile request goes out: neutralise the style's strict
        // numeric filters (Mapbox v3 vs MapLibre-tolerant styles) so the worker
        // never logs `… evaluated to null but was expected to be of type number`.
        relaxStyleFilters(mapInstance);
        try {
          ensureRouteLayers();
        } catch {
          /* a torn-down transition re-applies `applyRoute` on the next event */
        }
        try {
          applyRoute(true);
        } catch {
          /* the geometry re-applies on the next style event */
        }
      };
      mapInstance.on('style.load', onStyleLoad);

      // Missing sprite images become a transparent pixel instead of an error
      // (`Image "recycling" could not be loaded`, once per tile).
      const onMissingImage = (event: unknown): void => handleMissingStyleImage(mapInstance, event);
      mapInstance.on('styleimagemissing', onMissingImage);

      // WebGL context loss: ask for a restore, and rebuild if it never comes.
      let rebuildTimer = 0;
      const onContextLost = (event: Event): void => {
        event.preventDefault();
        window.clearTimeout(rebuildTimer);
        rebuildTimer = window.setTimeout(() => {
          if (cancelled) return;
          if (!rebuild()) showRecovery(container, 'The live map stopped rendering on this device.', retry);
        }, 4_000);
      };
      const onContextRestored = (): void => {
        window.clearTimeout(rebuildTimer);
        try {
          mapInstance.resize();
          mapInstance.triggerRepaint();
        } catch {
          if (!rebuild()) showRecovery(container, 'The live map stopped rendering on this device.', retry);
        }
      };
      canvas.addEventListener('webglcontextlost', onContextLost, false);
      canvas.addEventListener('webglcontextrestored', onContextRestored, false);

      // Container box changes (sheet snaps, rotation, URL-bar shifts) are not
      // seen by the engine on its own — mirror them onto the canvas.
      let observer: ResizeObserver | null = null;
      if (typeof ResizeObserver !== 'undefined') {
        observer = new ResizeObserver(() => {
          healCamera();
          syncCanvas();
        });
        observer.observe(container);
      }

      // Watchdog: catches layouts that never resize (so the observer stays
      // silent) and the one failure the engine cannot report — a canvas that
      // got detached or zeroed. Self-heals in place; when the shared budget is
      // spent it hands over to the retry card instead of looping.
      const watchdog = window.setInterval(() => {
        if (cancelled || !containerSized()) return;
        const live = mapInstance.getCanvas();
        if (!live || !live.isConnected || live.width === 0 || live.height === 0) {
          window.console.warn('[map] renderer canvas went missing — rebuilding the map');
          if (!rebuild()) {
            window.clearInterval(watchdog);
            showRecovery(container, 'The live map stopped rendering on this device.', retry);
          }
          return;
        }
        healCamera();
        syncCanvas();
      }, 1_500);

      mapInstance.on('load', () => {
        if (cancelled) return;
        window.clearTimeout(styleWatchdog);
        ensureRouteLayers();
        applyRoute();
        for (const kind of Object.keys(targets) as MapMarkerKind[]) {
          const point = targets[kind];
          if (point) placeMarker(kind, point, false);
        }
        followIfNeeded();
        syncCanvas();
      });

      handleRef.current = {
        getMap: () => mapInstance,
        setRoute: (coordinates, routeOptions) => {
          pendingRoute = coordinates.length > 0 ? coordinates : null;
          // Not ready yet (style still loading, or swapped to another provider):
          // `applyRoute` re-applies this exact geometry on the next style event.
          if (!mapInstance.isStyleLoaded()) return;
          applyRoute();
          if (routeOptions?.fit !== false && coordinates.length > 1 && containerSized()) {
            const bounds = new mapboxgl.LngLatBounds();
            for (const point of coordinates) bounds.extend(point);
            mapInstance.fitBounds(bounds, {
              padding: clampPadding(130, 250, 56),
              maxZoom: 15,
              duration: 700,
            });
          }
        },
        setProgress: (coordinates) => {
          pendingProgress = coordinates;
          setSourceData(DONE_SOURCE, coordinates);
        },
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
            delete displayed.destination;
            delete targets.destination;
            return;
          }
          placeMarker('destination', point, false);
          // A destination that lands after the first fix still pulls the
          // customer camera back so both markers are visible together.
          followIfNeeded();
        },

        setRestaurant: (point) => {
          if (!point) {
            markers.restaurant?.remove();
            delete markers.restaurant;
            delete displayed.restaurant;
            delete targets.restaurant;
            return;
          }
          placeMarker('restaurant', point, false);
        },
        setUser: (point, accuracyMetres) => {
          if (!point) {
            markers.user?.remove();
            delete markers.user;
            delete displayed.user;
            delete targets.user;
            accuracyMarker?.remove();
            accuracyMarker = null;
            return;
          }
          placeMarker('user', point, true);
          updateAccuracyHalo(point, accuracyMetres ?? null);
        },
        focus: (point, camera) => {
          if (!isUsablePoint(point) || !containerSized()) return;
          mapInstance.easeTo({
            center: [point.lng, point.lat],
            zoom: camera?.zoom ?? Math.max(safeZoom(), 15),
            duration: camera?.durationMs ?? 700,
            padding: camera?.padding
              ? { top: camera.padding, bottom: camera.padding, left: camera.padding, right: camera.padding }
              : undefined,
          });
        },
        fit: (points, fitOptions) => {
          const usable = points.filter(isUsablePoint);
          if (usable.length === 0 || !containerSized()) return;
          const padding = fitOptions?.padding ?? 72;
          if (usable.length === 1) {
            handleRef.current.focus(usable[0], { durationMs: fitOptions?.durationMs ?? 600 });
            return;
          }
          const bounds = new mapboxgl.LngLatBounds();
          for (const point of usable) bounds.extend([point.lng, point.lat]);
          try {
            mapInstance.fitBounds(bounds, {
              padding: clampPadding(padding, padding + 110, padding),
              maxZoom: fitOptions?.maxZoom ?? 15,
              duration: fitOptions?.durationMs ?? 700,
            });
          } catch {
            /* never let a camera hiccup break the screen */
          }
        },
        setFollow: (next) => {
          following = next;
          if (!next) return;
          const driver = targets.driver;
          if (!isUsablePoint(driver)) {
            handleRef.current.focus(center, {
              zoom: Math.max(safeZoom(), 15.5),
              durationMs: 600,
            });
            return;
          }
          followIfNeeded(true);
        },
        isFollowing: () => following,
        resize: () => {
          // A 0×0 resize would break the camera; a stale box is healed instead.
          if (!containerSized()) return;
          try {
            mapInstance.resize();
          } catch {
            /* the watchdog owns the recovery */
          }
          healCamera();
          syncCanvas();
        },
      };

      return () => {
        cancelled = true;
        window.clearTimeout(styleWatchdog);
        window.clearTimeout(rebuildTimer);
        window.clearInterval(watchdog);
        observer?.disconnect();
        canvas.removeEventListener('webglcontextlost', onContextLost);
        canvas.removeEventListener('webglcontextrestored', onContextRestored);
        mapInstance.off('error', onMapError);
        mapInstance.off('styledata', onStyleData);
        mapInstance.off('style.load', onStyleLoad);
        mapInstance.off('styleimagemissing', onMissingImage);
        cancelAnimationFrame(animationFrame);
        for (const marker of Object.values(markers)) marker?.remove();
        accuracyMarker?.remove();
        if (activeMaps.get(container) === mapInstance) activeMaps.delete(container);
        try {
          mapInstance.remove();
        } catch {
          /* already removed */
        }
        handleRef.current = emptyHandle();
      };
    };

    /**
     * The container can mount later than this effect (the customer order card
     * renders the map only once the delivery is live) and can still be 0x0 on
     * the first frame. Wait for a real, measurable box before constructing: a
     * 0x0 renderer paints nothing and never recovers on its own.
     *
     * `start` is the single entry point for map creation, so a Strict Mode
     * re-entry, a retry tap and self-healing can never stack two renderers.
     */
    start = (): void => {
      if (cancelled || dispose) return;
      const container = containerRef.current;
      if (!container || container.clientWidth === 0 || container.clientHeight === 0) {
        timer = window.setTimeout(start, 120);
        return;
      }
      dispose = initMap(container);
    };
    start();

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      dispose?.();
    };
    // The map is created once per mounted container on purpose.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [containerRef, mapgl]);

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






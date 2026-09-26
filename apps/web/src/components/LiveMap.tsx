import { useEffect, useRef, useState, type ReactNode, type RefObject } from 'react';
import { DEFAULT_MAP_ZOOM, KITCHEN_ANCHOR, mapFallbackStyleUrl, mapStyleUrl, type LatLng } from '../lib/live-map';
import {
  dropUncoveredIncidentLayers,
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
  /**
   * Writes a route leg directly onto the map's GeoJSON sources. Replacing the
   * existing source data updates the same line in place — the handle never
   * creates duplicate sources or layers and never rebuilds the map itself, so
   * live GPS fixes move the route without a flash or reset.
   */
  setRoute(coordinates: Array<[number, number]>, options?: { fit?: boolean }): void;
  /** Paints the part of the route already covered, in green. */
  setProgress(coordinates: Array<[number, number]>): void;
  /**
   * Driver's live GPS pin (native SDK marker — no accuracy overlay).
   *
   * `heading` is the device-reported bearing in degrees clockwise from north
   * (`GeolocationCoordinates.heading`, carried through `DriverLocationDTO`). The
   * pin is created with `rotationAlignment: 'map'`, so the SDK keeps it pointing
   * along the real travel direction even while the map itself is rotated.
   */
  setDriver(
    point: LatLng | null,
    options?: { animate?: boolean; heading?: number | null },
  ): void;
  setDestination(point: LatLng | null): void;
  setRestaurant(point: LatLng | null): void;
  /** The device's own position (native SDK "you are here" pin, heading-aware). */
  setUser(point: LatLng | null, options?: { heading?: number | null }): void;
  focus(point: LatLng, options?: { zoom?: number; durationMs?: number; padding?: number }): void;
  fit(points: LatLng[], options?: { padding?: number; maxZoom?: number; durationMs?: number }): void;
  setFollow(follow: boolean): void;
  isFollowing(): boolean;
  /** Re-measures the canvas (needed when the container becomes full-screen). */
  resize(): void;
}

const ROUTE_SOURCE = 'onyx-route';
const DONE_SOURCE = 'onyx-route-done';

/**
 * Native SDK pin colors only — no custom marker DOM, no overlay layer.
 * Green marks live positions (driver + the device user); red marks the fixed
 * anchors (customer destination + restaurant/shop). The map SDK owns every
 * pin element and attaches it directly to the map instance.
 */
const NATIVE_MARKER_COLORS: Record<MapMarkerKind, string> = {
  driver: '#0b9663',
  destination: '#D40000',
  restaurant: '#D40000',
  user: '#0b9663',
};

/** Branded placeholder — a failed map never leaves a blank pane behind. */
function showFallback(container: HTMLElement, message: string): void {
  container.dataset.mapState = 'failed';
  container.innerHTML = `<div class="map-fallback">${message}</div>`;
}

/** Camera inputs are only ever finite, real coordinates. */
function isUsablePoint(point: LatLng | null | undefined): point is LatLng {
  return Boolean(point) && Number.isFinite(point?.lat) && Number.isFinite(point?.lng);
}

/** Recovery card with a real retry action (never a page reload). */
function showRecovery(container: HTMLElement, message: string, onRetry: () => void): void {
  container.dataset.mapState = 'failed';
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

/**
 * Kinds that carry a direction. Only moving devices rotate; the fixed anchors
 * (destination, restaurant) always stand upright.
 */
const ROTATING_KINDS: ReadonlySet<MapMarkerKind> = new Set(['driver', 'user']);

/** A device heading only counts when it is a real, finite 0–360° reading. */
function normaliseHeading(heading: number | null | undefined): number | null {
  if (typeof heading !== 'number' || !Number.isFinite(heading)) return null;
  return ((heading % 360) + 360) % 360;
}

/** The signed shortest turn from `from` to `to` — always within ±180°. */
function headingDelta(from: number, to: number): number {
  return ((to - from + 540) % 360) - 180;
}

/**
 * The glyph for a moving device. Mapbox's default pin is a teardrop anchored at
 * its tip, so rotating it by a bearing tilts the whole pin sideways and reads as
 * broken. This chip keeps a stable circular body and puts the chevron inside it:
 * the SDK's rotation only ever turns the pointer, never the badge.
 */
function createHeadingElement(color: string): HTMLElement {
  const element = document.createElement('div');
  element.className = 'map-heading-marker';
  element.setAttribute('aria-hidden', 'true');
  element.innerHTML =
    '<svg width="34" height="34" viewBox="0 0 34 34" xmlns="http://www.w3.org/2000/svg">' +
    `<circle cx="17" cy="17" r="15" fill="#ffffff" stroke="${color}" stroke-width="2.5"/>` +
    `<path d="M17 7.5 23.5 24 17 19.9 10.5 24Z" fill="${color}"/>` +
    '</svg>';
  return element;
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
    const rebuild = (reason: string): boolean => {
      if (cancelled || rebuilds >= 3) return false;
      rebuilds += 1;
      // A rebuild is a real repair, never routine: state the cause so the
      // console answers "the map vanished" instead of hiding why.
      window.console.warn(`[map] rebuilding the renderer — ${reason}`);
      dispose?.();
      dispose = null;
      // The old renderer's dispose flips the shared flag; the effect itself is
      // still mounted, so re-arm it before the fresh attempt.
      cancelled = false;
      const container = containerRef.current;
      // `dispose()` has already removed the map and its canvas; this only clears
      // a leftover fallback/retry card so it cannot sit under the new renderer.
      if (container) container.innerHTML = '';
      start();
      return true;
    };

    /** User-driven retry: always allowed, and it resets the self-healing budget. */
    const retry = (): void => {
      rebuilds = 0;
      rebuild('the user asked for a retry');
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
      // Honest renderer state, read by the `.map-canvas[data-map-state=…]` CSS:
      // until the style's first data lands the pane shows a "loading" chip
      // instead of an empty surface that looks like a map that vanished. It is
      // purely decorative (`pointer-events: none`) and never covers the canvas
      // once the style is ready.
      container.dataset.mapState = 'loading';
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
      const markers: Partial<Record<MapMarkerKind, GLMarker>> = {};
      const targets: Partial<Record<MapMarkerKind, LatLng>> = {};
      const displayed: Partial<Record<MapMarkerKind, LatLng>> = {};
      /** Where each pin should point (device heading, degrees clockwise from north). */
      const headings: Partial<Record<MapMarkerKind, number>> = {};
      /** The rotation currently painted on screen, so turns can be eased. */
      const rotations: Partial<Record<MapMarkerKind, number>> = {};

      const releaseFollow = () => {
        if (!following) return;
        following = false;
        optionsRef.current.onUserInteract?.();
      };

      // ---------------------------------------------------------------------
      // Camera arbitration: a person steering the map always wins.
      //
      // Two signals are combined, because neither is complete on its own:
      //
      //   * the interaction handlers' `isActive()` — the SDK's own answer to
      //     "is a gesture in progress?". It is gesture-scoped, so a camera move
      //     this component started never reads back as user input (the public
      //     `isMoving()` cannot tell the two apart), and it covers drag pan,
      //     touch pan, pinch zoom/rotate, two-finger pitch, box zoom, wheel
      //     zoom, double-click zoom and keyboard panning;
      //   * the map's gesture events, which extend the hold past the release so
      //     an auto-move never yanks the view back mid-inertia.
      // ---------------------------------------------------------------------
      let gestureTail = 0;
      let gestureTailTimer = 0;
      /** How long auto camera moves stay parked after the fingers leave. */
      const GESTURE_TAIL_MS = 700;
      /** Stale-gesture budget: an end event swallowed by the browser must not wedge the camera. */
      const GESTURE_MAX_MS = 8_000;
      let gestureDepth = 0;
      let gestureStartedAt = 0;

      /** Re-arms the post-gesture hold; auto moves stay parked until it lapses. */
      const armGestureTail = (ms: number): void => {
        gestureTail = Math.max(gestureTail, Date.now() + ms);
        window.clearTimeout(gestureTailTimer);
        gestureTailTimer = window.setTimeout(() => {
          gestureTail = 0;
        }, ms);
      };

      const onGestureStart = (event: unknown): void => {
        // Map-level `mousedown`/`mouseup` also fire for clicks on the zoom buttons
        // and the attribution bubble — only canvas input counts as steering.
        if ((event as { originalEvent?: unknown } | undefined)?.originalEvent === undefined) return;
        gestureDepth += 1;
        gestureStartedAt = Date.now();
        window.clearTimeout(gestureTailTimer);
      };

      const onGestureEnd = (): void => {
        gestureDepth = Math.max(0, gestureDepth - 1);
        armGestureTail(GESTURE_TAIL_MS);
      };

      /** True while the user (not the app) owns the camera. */
      const userIsSteering = (): boolean => {
        if (gestureDepth > 0) {
          if (Date.now() - gestureStartedAt < GESTURE_MAX_MS) return true;
          gestureDepth = 0; // an end event never arrived — never wedge follow
        }
        const handlers: Array<{ isActive?: () => boolean } | undefined> = [
          mapInstance.dragPan,
          mapInstance.dragRotate,
          mapInstance.scrollZoom,
          mapInstance.boxZoom,
          mapInstance.doubleClickZoom,
          mapInstance.touchZoomRotate,
          mapInstance.touchPitch,
          mapInstance.keyboard,
        ];
        if (handlers.some((handler) => handler?.isActive?.() === true)) return true;
        return Date.now() < gestureTail;
      };

      const userOriginated = (event: unknown): boolean =>
        (event as { originalEvent?: unknown } | undefined)?.originalEvent !== undefined;

      mapInstance.on('dragstart', releaseFollow);
      mapInstance.on('zoomstart', (event: unknown) => {
        if (userOriginated(event)) releaseFollow();
      });
      // Two-finger pitch / rotate move the camera without ever firing drag or
      // zoom events — without these the followed view would fight them.
      mapInstance.on('pitchstart', (event: unknown) => {
        if (userOriginated(event)) releaseFollow();
      });
      mapInstance.on('rotatestart', (event: unknown) => {
        if (userOriginated(event)) releaseFollow();
      });

      const gestureStartEvents = ['mousedown', 'touchstart', 'dragstart', 'boxzoomstart'] as const;
      const gestureEndEvents = ['mouseup', 'dragend', 'touchend', 'touchcancel', 'boxzoomend', 'boxzoomcancel'] as const;
      for (const type of gestureStartEvents) mapInstance.on(type, onGestureStart);
      for (const type of gestureEndEvents) mapInstance.on(type, onGestureEnd);
      // Wheel zoom has no end event: every tick re-arms a short hold instead.
      const onWheelGesture = (): void => armGestureTail(260);
      mapInstance.on('wheel', onWheelGesture);


      // Errors are handled in the resilience block below (style fallback etc.).
      // Tile hiccups stay quiet there: markers keep updating regardless.

      // Ensure the route sources + layers exist and return whether they do.
      // Repair (never duplicate): a style swap or a torn-down transition can
      // leave a source without its layer or a layer without its source — the
      // missing half is re-added onto the existing half. `setData` on an
      // existing source updates the line in place; layers are only ever
      // created once per map, so the route can never vanish behind a
      // "source already exists" / "layer already exists" throw.
      const ensureRouteLayers = (): boolean => {
        if (cancelled || mapInstance._removed) return false;
        try {
          const routeSource = mapInstance.getSource(ROUTE_SOURCE);
          const routeLine = mapInstance.getLayer('onyx-route-line');
          const hasSources = Boolean(routeSource) && Boolean(mapInstance.getSource(DONE_SOURCE));
          const hasLayers = Boolean(routeLine) && Boolean(mapInstance.getLayer('onyx-route-casing')) && Boolean(mapInstance.getLayer('onyx-route-done'));
          if (hasSources && hasLayers) return true;
          if (!routeSource) {
            mapInstance.addSource(ROUTE_SOURCE, { type: 'geojson', data: emptyCollection() });
          }
          if (!mapInstance.getSource(DONE_SOURCE)) {
            mapInstance.addSource(DONE_SOURCE, { type: 'geojson', data: emptyCollection() });
          }
          if (!mapInstance.getLayer('onyx-route-casing')) {
            mapInstance.addLayer({
              id: 'onyx-route-casing',
              type: 'line',
              source: ROUTE_SOURCE,
              layout: { 'line-cap': 'round', 'line-join': 'round' },
              paint: { 'line-color': '#ffffff', 'line-width': 11, 'line-opacity': 0.92 },
            });
          }
          if (!routeLine) {
            mapInstance.addLayer({
              id: 'onyx-route-line',
              type: 'line',
              source: ROUTE_SOURCE,
              layout: { 'line-cap': 'round', 'line-join': 'round' },
              paint: { 'line-color': '#D40000', 'line-width': 6, 'line-opacity': 1 },
            });
          }
          if (!mapInstance.getLayer('onyx-route-done')) {
            mapInstance.addLayer({
              id: 'onyx-route-done',
              type: 'line',
              source: DONE_SOURCE,
              layout: { 'line-cap': 'round', 'line-join': 'round' },
              paint: { 'line-color': '#0b9663', 'line-width': 6, 'line-opacity': 0.96 },
            });
          }
          return true;
        } catch {
          // Mid style-swap the document rejects adds — the next style event retries.
          return false;
        }
      };

      // Arrow consts (not hoisted function declarations) so the non-null
      // `mapboxgl` narrowing from the guard above is preserved inside them.
      const setSourceData = (id: string, coordinates: Array<[number, number]>): boolean => {
        if (cancelled || mapInstance._removed || !mapInstance.isStyleLoaded()) return false;
        try {
          const source = mapInstance.getSource(id) as import('mapbox-gl').GeoJSONSource | undefined;
          if (!source || typeof source.setData !== 'function') return false;
          source.setData(coordinates.length === 0 ? emptyCollection() : lineFeature(coordinates));
          return true;
        } catch {
          // The source belongs to a style document being torn down — the next
          // style event re-applies `applyRoute`, never a rebuild.
          return false;
        }
      };

      const placeMarker = (
        kind: MapMarkerKind,
        point: LatLng,
        animate: boolean,
        heading?: number | null,
      ): void => {
        if (!isUsablePoint(point)) return; // never place a marker on a broken coordinate
        targets[kind] = point;
        const headingDeg = ROTATING_KINDS.has(kind) ? normaliseHeading(heading) : null;
        if (headingDeg !== null) headings[kind] = headingDeg;
        if (!mapInstance.isStyleLoaded()) return;
        const previous = displayed[kind];
        if (!previous || !markers[kind]) {
          markers[kind]?.remove();
          // Native SDK marker attached directly to the map. Never draggable, so
          // it can never intercept a gesture or float above the canvas as a
          // custom overlay. `rotationAlignment: 'map'` makes the SDK turn the
          // glyph with the map plane, so a device heading points along the real
          // travel direction no matter how the basemap is bearing — which is the
          // only alignment that stays true while a user rotates the view.
          const rotating = ROTATING_KINDS.has(kind);
          markers[kind] = new mapboxgl.Marker({
            ...(rotating
              ? { element: createHeadingElement(NATIVE_MARKER_COLORS[kind]) }
              : { color: NATIVE_MARKER_COLORS[kind] }),
            draggable: false,
            anchor: rotating ? 'center' : 'bottom',
            rotation: headings[kind] ?? 0,
            rotationAlignment: rotating ? 'map' : 'viewport',
          })
            .setLngLat([point.lng, point.lat])
            .addTo(mapInstance);
          displayed[kind] = { ...point };
          rotations[kind] = headings[kind] ?? 0;
          return;
        }
        if (!animate) {
          // An existing pin is *moved in place*, never rebuilt. `setDestination`
          // and `setRestaurant` are non-animated and are re-sent on every
          // polling tick: destroying and re-creating a `Marker` each time makes
          // the pin blink and churns DOM nodes under the canvas — churn that
          // reads as pins "disappearing" while an order is live. `setLngLat`
          // with unchanged coordinates is a projection-level no-op.
          markers[kind]?.setLngLat([point.lng, point.lat]);
          displayed[kind] = { ...point };
          const snapRotation = headings[kind] ?? rotations[kind] ?? 0;
          if (snapRotation !== rotations[kind]) {
            markers[kind]?.setRotation(snapRotation);
            rotations[kind] = snapRotation;
          }
          return;
        }
        // The heading travels with the position: the pin turns along the shortest
        // arc while it glides, so a corner reads as one continuous move instead of
        // a snap followed by a slide.
        const fromRotation = rotations[kind] ?? headings[kind] ?? 0;
        const toRotation = headings[kind] ?? fromRotation;
        const rotationDelta = headingDelta(fromRotation, toRotation);
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
          if (rotationDelta !== 0) {
            const rotation = fromRotation + rotationDelta * eased;
            markers[kind]?.setRotation(rotation);
            rotations[kind] = rotation;
          }
          if (t < 1 && !cancelled) animationFrame = requestAnimationFrame(step);
        };
        animationFrame = requestAnimationFrame(step);
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
        // A person is steering: gestures always win over the follow camera. The
        // next fix (or the follow button) re-engages once the map is idle again,
        // so the view can never fight a pan/pinch mid-stroke.
        if (!force && userIsSteering()) return;
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
      /**
       * Set once the first route leg frames the camera — later `setRoute`
       * calls replace the line in place without touching the camera, so live
       * position updates move markers + the route, never the viewport.
       */
      let routeFitted = false;
      const applyRoute = (force = false): void => {
        if (!pendingRoute || !mapInstance.isStyleLoaded()) return;
        // Layers/sources may still be mid-swap: only the actually-written
        // geometry counts as applied, so a failed write is retried (not lost)
        // on the next style event instead of the route silently vanishing.
        if (!ensureRouteLayers()) return;
        // Identity-guarded so repeated style events cannot feed themselves.
        if (force || appliedRoute !== pendingRoute) {
          if (setSourceData(ROUTE_SOURCE, pendingRoute)) appliedRoute = pendingRoute;
        }
        if (force || appliedProgress !== pendingProgress) {
          if (setSourceData(DONE_SOURCE, pendingProgress.length > 1 ? pendingProgress : [])) {
            appliedProgress = pendingProgress;
          }
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
          } else if (!rebuild('camera transform never became finite')) {
            showRecovery(container, 'The live map stopped rendering on this device.', retry);
            return;
          }
        } catch {
          if (!rebuild('camera jump threw')) {
            showRecovery(container, 'The live map stopped rendering on this device.', retry);
          }
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
      // 8 s is generous for a first style over slow mobile data (the Mapbox-hosted
      // style normally lands well under a second) and short enough that a blocked
      // domain or a revoked token degrades to the keyless style before the driver
      // gives up on a blank pane.
      const styleWatchdog = window.setTimeout(() => {
        if (cancelled || styleReady) return;
        if (!triedFallbackStyle) {
          triedFallbackStyle = true;
          window.console.warn('[map] no style data after 8s — switching to the keyless fallback style');
          try {
            mapInstance.setStyle(mapFallbackStyleUrl());
          } catch {
            showRecovery(container, 'The map style could not be loaded. Check your connection and retry.', retry);
          }
        }
      }, 8_000);

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

      // Ensure the route sources + layers exist even when `style.load` fires
      // before these listeners attach — the failure mode behind "pins work,
      // the route never renders". `styledata`/`load` handlers only run for
      // style documents installed *after* the listener attaches; on a warm
      // cache the style can be fully loaded before `initMap` finishes wiring,
      // and then sources/layers this section owns would never get created.
      const onStyleData = (): void => {
        if (cancelled || mapInstance._removed) return;
        styleReady = true;
        // First real style data = the basemap is painting: drop the loading chip.
        container.dataset.mapState = 'ready';
        // Earliest possible moment: stop Mapbox's region-limited incidents tiles
        // (404 over Ghana) before they are requested. Idempotent, so every later
        // style event re-running this is a cheap no-op.
        dropUncoveredIncidentLayers(mapInstance);
        ensureRouteLayers();
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
        // …and drop the incidents layers+source whose tiles 404 outside their
        // sparse coverage, so the console stays clean on a healthy screen.
        dropUncoveredIncidentLayers(mapInstance);
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

      // The style can be fully loaded before these listeners attach (fast
      // cache, local style, instant fallback). Without this the map paints and
      // the markers place — but the sources/layers this section is responsible
      // for never get created, so the route silently never renders.
      if (mapInstance.isStyleLoaded()) {
        styleReady = true;
        window.clearTimeout(styleWatchdog);
        relaxStyleFilters(mapInstance);
        dropUncoveredIncidentLayers(mapInstance);
        ensureRouteLayers();
        applyRoute(true);
      } else {
        // `load` may already have fired with the style still settling: poll
        // briefly for the load flip and repair once, then stop — `styledata`
        // keeps every later swap covered.
        let settleChecks = 0;
        const settleTimer = window.setInterval(() => {
          settleChecks += 1;
          if (cancelled || mapInstance._removed || settleChecks > 40) {
            window.clearInterval(settleTimer);
            return;
          }
          if (!mapInstance.isStyleLoaded()) return;
          window.clearInterval(settleTimer);
          onStyleLoad();
        }, 250);
      }

      // Missing sprite images become a transparent pixel instead of an error
      // (`Image "recycling" could not be loaded`, once per tile).
      const onMissingImage = (event: unknown): void => handleMissingStyleImage(mapInstance, event);
      mapInstance.on('styleimagemissing', onMissingImage);

      // WebGL context loss: ask for a restore, and rebuild if it never comes.
      //
      // Mobile reality: backgrounding the PWA, a memory squeeze or a GPU reset
      // all drop the context. The browser fires `webglcontextrestored` when it
      // can — usually within a second — so a short grace period plus the
      // restore handler recovers in place, without ever tearing down a map that
      // is about to come back. `canvasMisses` also feeds the watchdog below.
      let rebuildTimer = 0;
      let canvasMisses = 0;
      const onContextLost = (event: Event): void => {
        event.preventDefault();
        // The pane is genuinely blank until the context returns — say so instead
        // of showing empty grey.
        container.dataset.mapState = 'loading';
        window.clearTimeout(rebuildTimer);
        rebuildTimer = window.setTimeout(() => {
          if (cancelled) return;
          // A hidden tab is not painting by definition: never rebuild from a
          // background timer, the next visible frame restores it.
          if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return;
          if (!rebuild('webgl context was not restored')) {
            showRecovery(container, 'The live map stopped rendering on this device.', retry);
          }
        }, 1_500);
      };
      const onContextRestored = (): void => {
        window.clearTimeout(rebuildTimer);
        canvasMisses = 0;
        try {
          container.dataset.mapState = styleReady ? 'ready' : 'loading';
          mapInstance.resize();
          mapInstance.triggerRepaint();
        } catch {
          if (!rebuild('webgl context restored into a broken renderer')) {
            showRecovery(container, 'The live map stopped rendering on this device.', retry);
          }
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
      // silent) and the one failure the engine cannot report — a canvas that got
      // detached or zeroed.
      //
      // False positives are the real danger here: a sheet snap, an orientation
      // change or a background tab can leave the canvas momentarily 0×0, and
      // rebuilding on that single sample is exactly how a working map gets torn
      // down and looks like it "disappeared". So a rebuild needs two consecutive
      // bad samples on a *visible* page, and every repair is logged with a
      // reason. When the shared budget is spent it hands over to the retry card.
      const watchdog = window.setInterval(() => {
        if (cancelled || !containerSized()) return;
        const live = mapInstance.getCanvas();
        const healthy = Boolean(live) && live!.isConnected && live!.width > 0 && live!.height > 0;
        if (healthy) {
          canvasMisses = 0;
          healCamera();
          syncCanvas();
          return;
        }
        if (typeof document !== 'undefined' && document.visibilityState !== 'visible') {
          canvasMisses = 0; // nothing is obliged to paint while hidden
          return;
        }
        canvasMisses += 1;
        if (canvasMisses < 2) return; // one bad sample is a transient resize
        if (!rebuild('renderer canvas stayed missing or zero-sized')) {
          window.clearInterval(watchdog);
          showRecovery(container, 'The live map stopped rendering on this device.', retry);
        }
      }, 1_500);

      mapInstance.on('load', () => {
        if (cancelled) return;
        window.clearTimeout(styleWatchdog);
        ensureRouteLayers();
        applyRoute();
        for (const kind of Object.keys(targets) as MapMarkerKind[]) {
          const point = targets[kind];
          // Re-place with the last reported heading: a pin restored after a style
          // swap must keep pointing the way the device was travelling.
          if (point) placeMarker(kind, point, false, headings[kind]);
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
            // Once, at route load: frame the whole leg. Later position fixes
            // only update markers + source data — never the camera — so the
            // map stops flashing/resetting on every GPS tick.
            if (routeFitted) return;
            // ...but never over an in-progress gesture: the fit is retried on the
            // next route write instead of stealing the map mid-pan.
            if (userIsSteering()) return;
            routeFitted = true;
            const bounds = new mapboxgl.LngLatBounds();
            for (const point of coordinates) bounds.extend(point);
            try {
              mapInstance.fitBounds(bounds, { padding: 80, duration: 800 });
            } catch {
              /* never let a camera hiccup break the screen */
            }
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
            delete headings.driver;
            delete rotations.driver;
            return;
          }
          placeMarker('driver', point, driverOptions?.animate ?? true, driverOptions?.heading);
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
        setUser: (point, userOptions) => {
          if (!point) {
            markers.user?.remove();
            delete markers.user;
            delete displayed.user;
            delete targets.user;
            delete headings.user;
            delete rotations.user;
            return;
          }
          placeMarker('user', point, true, userOptions?.heading);
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
        window.clearTimeout(gestureTailTimer);
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
        if (activeMaps.get(container) === mapInstance) activeMaps.delete(container);
        try {
          mapInstance.remove();
        } catch {
          /* already removed */
        }
        delete container.dataset.mapState;
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






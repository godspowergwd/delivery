import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { OrderDTO, SettingsDTO } from '@delivery/shared';
import { ORDER_STATUS_LABELS, distanceKm, etaText, formatDistance, formatMoney } from '@delivery/shared';
import { api } from '../../lib/api';
import { fetchDriverDeliveries, postDriverAction } from '../../lib/driver-api';
import { useRealtimeSync, toast } from '../../lib/realtime';
import { useDeviceLocation } from '../../lib/geolocation';
import { useLocationPublisher } from '../../lib/tracking';
import { MALAM_CENTER } from '../../lib/live-map';
import { fetchRoadRoute, type RoadRoute } from '../../lib/route';
import { LiveMap, useLiveMap } from '../../components/LiveMap';
import { DragSheet, sheetSnapHeights, type SheetSnap } from '../../components/DragSheet';
import {
  ArrowLeftIcon,
  BikeIcon,
  ChevronDownIcon,
  CompassIcon,
  LeafIcon,
  LocateIcon,
  MapPinIcon,
  NavigationIcon,
  PhoneIcon,
  RouteIcon,
  StoreIcon,
  ZoomInIcon,
  ZoomOutIcon,
} from '../../components/icons';
import { Button, Modal, Spinner, StatusPill, Textarea } from '../../components/ui';

/**
 * Driver navigation screen.
 *
 * A full-screen live map, exactly like a professional driver app: the position
 * on the map is always the driver's own device GPS (never simulated), the route
 * is a real road route to the next stop, and every delivery action stays within
 * one thumb's reach.
 */

const ACTIVE_STATUSES = 'ACCEPTED,PREPARING,READY,OUT_FOR_DELIVERY';
const ROUTE_REFRESH_MS = 60_000;
const ROUTE_REFRESH_METRES = 250;

export default function DriverMap() {
  useRealtimeSync();
  const queryClient = useQueryClient();
  const mapHostRef = useRef<HTMLDivElement | null>(null);
  /** Deep link from the deliveries list (`?order=<id>`) selects that delivery immediately. */
  const [searchParams] = useSearchParams();
  const requestedOrderId = searchParams.get('order');
  const [selectedId, setSelectedId] = useState<string | null>(requestedOrderId);
  /**
   * Bolt-Food sheet behaviour: peek (handle only, map almost full-screen),
   * collapsed (summary) and expanded (full order details).
   */
  const [snap, setSnap] = useState<SheetSnap>('collapsed');
  const [rotated, setRotated] = useState(false);
  const [viewportH, setViewportH] = useState(() =>
    typeof window === 'undefined' ? 720 : window.innerHeight,
  );
  const [permissionDismissed, setPermissionDismissed] = useState(false);
  const [issueOpen, setIssueOpen] = useState(false);
  const [route, setRoute] = useState<RoadRoute | null>(null);
  const [isFollowing, setIsFollowing] = useState(true);

  const location = useDeviceLocation({ enabled: true, watch: true });
  const publisher = useLocationPublisher();
  const mapRef = useLiveMap(mapHostRef, {
    center: MALAM_CENTER,
    zoom: 15,
    // The driver map ships its own floating controls (zoom, compass, route,
    // centre) so Mapbox's built-in control would be a duplicate.
    navigation: false,
    // Start already following: the first real fix glides the camera onto the
    // driver, and any manual pan hands control back to the driver.
    follow: true,
    onUserInteract: () => setIsFollowing(false),
  });

  const { data: orders = [], isLoading, isError, error } = useQuery({
    queryKey: ['driver-deliveries', 'map'],
    queryFn: () => fetchDriverDeliveries(`/driver/deliveries?status=${ACTIVE_STATUSES}`),
  });

  const { data: settingsData } = useQuery({
    queryKey: ['settings'],
    queryFn: () => api.get<{ settings: SettingsDTO }>('/settings'),
    staleTime: 5 * 60_000,
  });

  const restaurant = useMemo(() => {
    const settings = settingsData?.settings;
    const lat = settings?.businessLatitude;
    const lng = settings?.businessLongitude;
    if (typeof lat === 'number' && typeof lng === 'number' && Number.isFinite(lat) && Number.isFinite(lng)) {
      return { lat, lng };
    }
    return MALAM_CENTER;
  }, [settingsData]);

  const selected: OrderDTO | null = useMemo(
    () => orders.find((order) => order.id === selectedId) ?? orders[0] ?? null,
    [orders, selectedId],
  );

  // Keep the deep-linked delivery selected if the driver navigates back and forth.
  useEffect(() => {
    if (requestedOrderId) setSelectedId(requestedOrderId);
  }, [requestedOrderId]);

  /** Delivery point: the REAL checkout GPS coordinate — never a fake pin. */
  const destination = useMemo(() => {
    if (!selected) return null;
    if (
      typeof selected.deliveryLatitude === 'number' &&
      typeof selected.deliveryLongitude === 'number' &&
      Number.isFinite(selected.deliveryLatitude) &&
      Number.isFinite(selected.deliveryLongitude) &&
      (selected.deliveryLatitude !== 0 || selected.deliveryLongitude !== 0)
    ) {
      return { lat: selected.deliveryLatitude, lng: selected.deliveryLongitude, exact: true };
    }
    return null;
  }, [selected]);

  const delivering = selected?.status === 'OUT_FOR_DELIVERY';
  const target = delivering ? destination : restaurant;

  // Publish the driver's own GPS whenever the device reports a new fix.
  const { publish } = publisher;
  useEffect(() => {
    if (!location.position) return;
    mapRef.current.setDriver(
      { lat: location.position.lat, lng: location.position.lng },
      { animate: true, accuracyMetres: location.position.accuracy },
    );
    publish(location.position);
  }, [location.position, mapRef, publish]);

  useEffect(() => {
    mapRef.current.setRestaurant(restaurant);
  }, [restaurant, mapRef]);

  useEffect(() => {
    if (!destination) return;
    mapRef.current.setDestination({ lat: destination.lat, lng: destination.lng });
  }, [destination, mapRef]);

  // Route from the driver's real position to the next stop, refreshed on
  // movement instead of on a timer so we never burn data while parked.
  const routeKeyRef = useRef<{ at: number; lat: number; lng: number; target: string } | null>(null);
  useEffect(() => {
    if (!target || !location.position) return;
    const targetKey = `${target.lat.toFixed(5)},${target.lng.toFixed(5)}`;
    const previous = routeKeyRef.current;
    const movedMetres = previous
      ? distanceKm(
          { lat: previous.lat, lng: previous.lng },
          { lat: location.position.lat, lng: location.position.lng },
        ) * 1000
      : Number.POSITIVE_INFINITY;
    const stale = previous ? Date.now() - previous.at > ROUTE_REFRESH_MS : true;
    if (previous && previous.target === targetKey && movedMetres < ROUTE_REFRESH_METRES && !stale) return;
    routeKeyRef.current = {
      at: Date.now(),
      lat: location.position.lat,
      lng: location.position.lng,
      target: targetKey,
    };

    const controller = new AbortController();
    fetchRoadRoute(
      { lat: location.position.lat, lng: location.position.lng },
      { lat: target.lat, lng: target.lng },
      controller.signal,
    )
      .then((next) => {
        setRoute(next);
        mapRef.current.setRoute(next.coordinates, { fit: false });
      })
      .catch(() => undefined);
    return () => controller.abort();
  }, [location.position, target, mapRef]);

  const action = useMutation({
    mutationFn: ({ id, verb }: { id: string; verb: 'complete' }) =>
      postDriverAction(`/driver/deliveries/${id}/${verb}`),
    onSuccess: (order) => {
      void queryClient.invalidateQueries({ queryKey: ['driver-deliveries'] });
      void queryClient.invalidateQueries({ queryKey: ['driver-summary'] });
      toast(`Order ${order.orderNumber} → ${ORDER_STATUS_LABELS[order.status]}`, 'success');
    },
    onError: (err: Error) => toast(err.message, 'error'),
  });

  const remainingKm = useMemo(() => {
    if (!location.position || !target) return null;
    const direct = distanceKm(
      { lat: location.position.lat, lng: location.position.lng },
      { lat: target.lat, lng: target.lng },
    );
    // Follow the road distance while it is plausible, else the straight line.
    return route ? Math.min(route.distanceKm, direct * 1.5) : direct;
  }, [location.position, target, route]);

  const recenter = useCallback(() => {
    if (!location.position) {
      location.request();
      return;
    }
    setIsFollowing(true);
    mapRef.current.setFollow(true);
  }, [location, mapRef]);

  const focusDestination = useCallback(() => {
    if (!target) return;
    setIsFollowing(false);
    mapRef.current.focus({ lat: target.lat, lng: target.lng }, { zoom: 16 });
  }, [target, mapRef]);

  const fitRoute = useCallback(() => {
    const points = [
      location.position ? { lat: location.position.lat, lng: location.position.lng } : null,
      target ? { lat: target.lat, lng: target.lng } : null,
    ].filter((point): point is { lat: number; lng: number } => Boolean(point));
    if (points.length === 0) return;
    setIsFollowing(false);
    mapRef.current.fit(points, { maxZoom: 15 });
  }, [location.position, target, mapRef]);

  // Keep the canvas correctly sized whenever the sheet snaps to a new height,
  // and remember the viewport so the floating controls can track the sheet.
  useEffect(() => {
    const onResize = () => setViewportH(window.innerHeight);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  useEffect(() => {
    const id = window.setTimeout(() => mapRef.current.resize(), 320);
    return () => window.clearTimeout(id);
  }, [snap, mapRef]);

  // Compass state: red selected treatment while the map is rotated off north.
  useEffect(() => {
    let timer = 0;
    let detach: (() => void) | undefined;
    let tries = 0;
    const attach = () => {
      const map = mapRef.current.getMap();
      if (map) {
        const onRotate = () => setRotated(Math.abs(map.getBearing()) > 1);
        map.on('rotate', onRotate);
        onRotate();
        detach = () => map.off('rotate', onRotate);
        return;
      }
      if (tries < 40) {
        tries += 1;
        timer = window.setTimeout(attach, 500);
      }
    };
    attach();
    return () => {
      window.clearTimeout(timer);
      detach?.();
    };
  }, [mapRef]);

  const zoomBy = useCallback(
    (direction: 1 | -1) => {
      const map = mapRef.current.getMap();
      if (!map) return;
      if (direction > 0) map.zoomIn();
      else map.zoomOut();
    },
    [mapRef],
  );

  const resetBearing = useCallback(() => {
    const map = mapRef.current.getMap();
    if (!map) return;
    map.easeTo({ bearing: 0, pitch: 0, duration: 450 });
  }, [mapRef]);

  const handleSnapChange = useCallback(
    (next: SheetSnap) => {
      setSnap(next);
      // The sheet animates for ~420 ms; resize once it has settled.
      window.setTimeout(() => mapRef.current.resize(), 440);
    },
    [mapRef],
  );

  const showPermissionCard =
    !permissionDismissed &&
    ['idle', 'denied', 'unavailable', 'timeout', 'insecure', 'unsupported'].includes(location.status);

  /** Floating controls track the sheet height at every snap. */
  const snapHeight = sheetSnapHeights(viewportH)[snap];

  return (
    <div className="relative h-[100dvh] w-full overflow-hidden bg-slate-100">
      <LiveMap mapRef={mapHostRef} ariaLabel="Live driver navigation map">
        <div className="map-top-bar">
          <Link to="/driver/deliveries" className="map-control-btn" aria-label="Back to deliveries">
            <ArrowLeftIcon className="h-5 w-5" />
          </Link>
          <TrackingPill
            status={location.status}
            accuracy={location.position?.accuracy ?? null}
            transport={publisher.transport}
            lastSentAt={publisher.lastSentAt}
          />
          {orders.length > 1 && (
            <button
              type="button"
              className="map-control-btn map-control-btn-green gap-1 px-3 text-sm font-bold"
              onClick={() => handleSnapChange('expanded')}
              aria-label={`${orders.length} active deliveries — open the list`}
              title="Active deliveries"
            >
              <BikeIcon className="h-4 w-4" />
              {orders.length}
            </button>
          )}
        </div>

        {/* Floating map controls — within one thumb, never eating screen space.
            Red = selected / primary controls, green = location + route progress. */}
        <div
          className="absolute right-3 z-20 flex flex-col gap-2"
          style={{ bottom: `${snapHeight + 16}px` }}
        >
          <button
            type="button"
            className="map-control-btn"
            onClick={() => zoomBy(1)}
            aria-label="Zoom in"
            title="Zoom in"
          >
            <ZoomInIcon className="map-control-btn-icon-red h-5 w-5" />
          </button>
          <button
            type="button"
            className="map-control-btn"
            onClick={() => zoomBy(-1)}
            aria-label="Zoom out"
            title="Zoom out"
          >
            <ZoomOutIcon className="map-control-btn-icon-red h-5 w-5" />
          </button>
          <button
            type="button"
            className={`map-control-btn ${rotated ? 'map-control-btn-red' : ''}`}
            onClick={resetBearing}
            aria-label="Reset the map to north"
            title="Reset to north"
            aria-pressed={rotated}
          >
            <CompassIcon className="h-5 w-5" />
          </button>
          <button
            type="button"
            className={`map-control-btn ${route ? 'map-control-btn-green' : ''}`}
            onClick={fitRoute}
            aria-label="Show the whole route"
            title="Show the whole route"
            aria-pressed={Boolean(route)}
          >
            <RouteIcon className="h-5 w-5" />
          </button>
          <button
            type="button"
            className={`map-control-btn ${isFollowing ? 'map-control-btn-green' : ''}`}
            onClick={recenter}
            aria-label="Centre on my location"
            title="Centre on my location"
            aria-pressed={isFollowing}
          >
            <LocateIcon className={`h-5 w-5 ${isFollowing ? '' : 'map-control-btn-icon-green'}`} />
          </button>
          {target && (
            <button
              type="button"
              className="map-control-btn"
              onClick={focusDestination}
              aria-label={delivering ? 'Centre on the customer' : 'Centre on the restaurant'}
              title={delivering ? 'Centre on the customer' : 'Centre on the restaurant'}
            >
              {delivering ? (
                <MapPinIcon className="map-control-btn-icon-red h-5 w-5" />
              ) : (
                <StoreIcon className="map-control-btn-icon-red h-5 w-5" />
              )}
            </button>
          )}
        </div>

        {showPermissionCard && (
          <LocationPermissionCard
            status={location.status}
            title={location.message?.title}
            detail={location.message?.detail}
            requesting={location.requesting}
            onAllow={() => {
              setPermissionDismissed(false);
              location.request();
            }}
            onDismiss={() => setPermissionDismissed(true)}
          />
        )}
      </LiveMap>

      {isError && (
        <div className="absolute inset-x-3 top-20 z-20 rounded-2xl border border-red-200 bg-white p-4 shadow-lift">
          <p className="text-sm font-bold text-red-700">Deliveries could not be loaded</p>
          <p className="mt-1 text-sm text-slate-600">
            {error instanceof Error ? error.message : 'Check your connection and try again.'}
          </p>
        </div>
      )}

      {/* Delivery bottom sheet — draggable, Bolt-Food style: three snaps,
          velocity-based spring, and the map grows when the driver drags down. */}
      <DragSheet
        snap={snap}
        onSnapChange={handleSnapChange}
        ariaLabel="Delivery order"
        className="pb-[max(env(safe-area-inset-bottom),0.5rem)]"
        header={
          <div className="pt-1">
            {isLoading ? (
              <div className="flex items-center justify-center py-6">
                <Spinner className="h-6 w-6" />
              </div>
            ) : !selected ? (
              <div className="flex items-center gap-2 py-1">
                <span className="badge-fresh">Ready for a delivery</span>
                <p className="ml-auto truncate text-sm font-bold text-slate-700">
                  No active order
                </p>
              </div>
            ) : (
              <>
                <div className="flex items-center gap-2">
                  <StatusPill status={selected.status} label={ORDER_STATUS_LABELS[selected.status]} />
                  <span className="truncate font-mono text-sm text-slate-700">
                    {selected.orderNumber}
                  </span>
                  {/* Green online / active-delivery indicator */}
                  {delivering ? (
                    <span className="flex flex-none items-center gap-1.5 rounded-full bg-green-600 px-2.5 py-1 text-[11px] font-extrabold uppercase tracking-wide text-white shadow-green">
                      <span className="relative flex h-2 w-2">
                        <span className="animate-glow absolute inset-0 rounded-full bg-green-300/60" />
                        <span className="absolute inset-0 rounded-full bg-white" />
                      </span>
                      On delivery
                    </span>
                  ) : (
                    <span className="badge-hot flex-none">Pickup</span>
                  )}
                  <button
                    type="button"
                    onClick={() => handleSnapChange(snap === 'expanded' ? 'collapsed' : 'expanded')}
                    aria-label={snap === 'expanded' ? 'Collapse order details' : 'Expand order details'}
                    className="ml-auto flex h-9 w-9 flex-none items-center justify-center rounded-full bg-red-50 text-red-600 transition hover:bg-red-100"
                  >
                    <ChevronDownIcon
                      className={`h-5 w-5 transition-transform duration-300 ${
                        snap === 'expanded' ? 'rotate-180' : ''
                      }`}
                    />
                  </button>
                </div>
                {snap !== 'peek' && (
                  <div className="mt-2 flex items-center gap-3 pb-1">
                    <span className="flex flex-col">
                      <span className="text-[10px] font-bold uppercase tracking-wide text-red-600">
                        ETA
                      </span>
                      <span className="text-sm font-extrabold text-green-700">
                        {route ? etaText(route.durationMin) : '—'}
                      </span>
                    </span>
                    <span className="flex flex-col">
                      <span className="text-[10px] font-bold uppercase tracking-wide text-red-600">
                        To go
                      </span>
                      <span className="text-sm font-extrabold text-green-700">
                        {remainingKm !== null ? formatDistance(remainingKm) : '—'}
                      </span>
                    </span>
                    <span className="min-w-0 flex-1 truncate text-[13px] font-semibold text-slate-600">
                      {selected.customerName} ·{' '}
                      {delivering ? selected.deliveryAddress : 'Maame’s Waakye kitchen'}
                    </span>
                    <a
                      href={`tel:${selected.deliveryPhone}`}
                      aria-label={`Call ${selected.customerName}`}
                      className="flex h-9 w-9 flex-none items-center justify-center rounded-full bg-green-600 text-white shadow-green transition hover:bg-green-700"
                    >
                      <PhoneIcon className="h-4 w-4" />
                    </a>
                  </div>
                )}
              </>
            )}
          </div>
        }
      >
        {!isLoading && !selected && <EmptyDelivery />}
        {selected && (
          <DeliveryDetails
            order={selected}
            remainingKm={remainingKm}
            delivering={Boolean(delivering)}
            destinationExact={destination?.exact ?? false}
            routeReady={Boolean(route)}
            busy={action.isPending}
            deliveryCount={orders.length}
            onComplete={() => action.mutate({ id: selected.id, verb: 'complete' })}
            onIssue={() => setIssueOpen(true)}
            onSelectOther={() => {
              const index = orders.findIndex((order) => order.id === selected.id);
              const next = orders[(index + 1) % orders.length];
              if (next) setSelectedId(next.id);
            }}
          />
        )}
      </DragSheet>

      {issueOpen && selected && <IssueDialog order={selected} onClose={() => setIssueOpen(false)} />}
    </div>
  );
}

/* ------------------------------------------------------------------ pieces */

/** Live GPS health: what the driver needs to know at a glance. */
function TrackingPill({
  status,
  accuracy,
  transport,
  lastSentAt,
}: {
  status: string;
  accuracy: number | null;
  transport: 'socket' | 'rest' | 'idle';
  lastSentAt: string | null;
}) {
  const live = status === 'granted';
  const label = live
    ? accuracy && accuracy > 60
      ? `Live · ±${Math.round(accuracy)} m`
      : 'Live location on'
    : status === 'requesting'
      ? 'Finding your location…'
      : 'Location off';

  return (
    <div className="flex min-w-0 flex-1 items-center gap-2 rounded-full border border-slate-200 bg-white/95 px-3 py-2 shadow-soft">
      <span
        className={`relative flex h-2.5 w-2.5 flex-none rounded-full ${live ? 'bg-green-600' : 'bg-slate-400'}`}
      >
        {live && <span className="pulse-ring absolute inset-0 rounded-full bg-green-600/60" />}
      </span>
      <span className="min-w-0 truncate text-[13px] font-bold text-slate-800">{label}</span>
      {live && lastSentAt && (
        <span className="hidden flex-none text-[11px] font-semibold uppercase tracking-wide text-slate-400 sm:inline">
          {transport === 'socket' ? 'streaming' : transport === 'rest' ? 'synced' : 'sent'}
        </span>
      )}
    </div>
  );
}

/** Explains why GPS is needed and never blocks the rest of the screen. */
function LocationPermissionCard({
  status,
  title,
  detail,
  requesting,
  onAllow,
  onDismiss,
}: {
  status: string;
  title?: string;
  detail?: string;
  requesting: boolean;
  onAllow: () => void;
  onDismiss: () => void;
}) {
  return (
    <div className="absolute inset-x-3 top-20 z-30 rounded-3xl border border-slate-200 bg-white/95 p-4 shadow-lift backdrop-blur">
      <div className="flex items-start gap-3">
        <span className="flex h-11 w-11 flex-none items-center justify-center rounded-2xl bg-red-50 text-red-600">
          <LocateIcon className="h-6 w-6" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[15px] font-extrabold text-slate-900">
            {title ?? 'Share your location to navigate'}
          </p>
          <p className="mt-1 text-sm leading-snug text-slate-600">
            {detail ??
              'Your live position is what lets the customer follow the delivery and lets the restaurant see you arriving.'}
          </p>
          <p className="mt-2 text-[13px] font-semibold text-slate-500">
            {status === 'denied'
              ? 'Browser menu → Site settings → Location → Allow.'
              : 'Only used while you are on duty.'}
          </p>
        </div>
      </div>
      <div className="mt-3 flex gap-2">
        <Button size="sm" loading={requesting} onClick={onAllow}>
          Allow location
        </Button>
        <Button size="sm" variant="ghost" onClick={onDismiss}>
          Not now
        </Button>
      </div>
    </div>
  );
}

function DeliveryDetails({
  order,
  remainingKm,
  delivering,
  destinationExact,
  routeReady,
  busy,
  deliveryCount,
  onComplete,
  onIssue,
  onSelectOther,
}: {
  order: OrderDTO;
  remainingKm: number | null;
  delivering: boolean;
  destinationExact: boolean;
  routeReady: boolean;
  busy: boolean;
  deliveryCount: number;
  onComplete: () => void;
  onIssue: () => void;
  onSelectOther: () => void;
}) {
   // An ETA is only ever shown when it comes from a real road route.
  const eta = routeReady && remainingKm !== null ? etaText(remainingKm) : null;
  const targetLabel = delivering ? 'Customer' : 'Restaurant';
  const navPoint =
    typeof order.deliveryLatitude === 'number' &&
    typeof order.deliveryLongitude === 'number' &&
    Number.isFinite(order.deliveryLatitude) &&
    Number.isFinite(order.deliveryLongitude) &&
    (order.deliveryLatitude !== 0 || order.deliveryLongitude !== 0)
      ? { lat: order.deliveryLatitude, lng: order.deliveryLongitude }
      : null;

  return (
    <div className="pb-4 pt-2">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[13px] font-bold uppercase tracking-wide text-red-600">
            {delivering ? 'Delivering now' : 'Next stop · restaurant'}
          </p>
          <p className="truncate font-mono text-sm text-slate-700">{order.orderNumber}</p>
        </div>
        <StatusPill status={order.status} label={ORDER_STATUS_LABELS[order.status]} />
      </div>

      {/* ETA (red emphasis) paired with the live green distance-to-go. */}
      <div className="mt-3 grid grid-cols-2 gap-2">
        <div className="rounded-2xl border border-red-100 bg-red-50 px-3 py-2.5">
          <p className="text-[12px] font-semibold uppercase tracking-wide text-red-700/80">
            Arriving in
          </p>
          <p className="text-xl font-extrabold leading-tight text-red-800">
            {eta ?? (remainingKm !== null ? '—' : 'Waiting for GPS')}
          </p>
        </div>
        <div className="rounded-2xl border border-green-100 bg-green-50 px-3 py-2.5">
          <p className="text-[12px] font-semibold uppercase tracking-wide text-green-700/80">
            {delivering ? 'To customer' : 'To restaurant'}
          </p>
          <p className="text-xl font-extrabold leading-tight text-green-800">
            {remainingKm !== null ? formatDistance(remainingKm) : '—'}
          </p>
        </div>
      </div>

      <div className="mt-3 flex items-start gap-2 rounded-2xl border border-slate-200 px-3 py-2.5">
        <span className="mt-0.5 flex h-8 w-8 flex-none items-center justify-center rounded-xl bg-red-50 text-red-600">
          <MapPinIcon className="h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-bold uppercase tracking-wide text-green-700">
            {targetLabel}
          </p>
          <p className="text-[15px] font-bold text-slate-900">{order.customerName}</p>
          <p className="text-sm leading-snug text-slate-600">
            {order.deliveryAddress}
            {order.deliveryArea ? ` · ${order.deliveryArea}` : ''}
          </p>
          {!destinationExact && (
            <p className="mt-1 text-[12px] font-semibold text-amber-700">
              {navPoint
                ? 'Exact customer GPS pin.'
                : 'No customer GPS on this order yet — call the customer for directions.'}
            </p>
          )}
          {destinationExact && (
            <p className="mt-1 text-[12px] font-semibold text-green-700">
              Exact customer GPS pin.
            </p>
          )}
          {order.notes && (
            <p className="mt-1 rounded-xl bg-green-50 px-2 py-1 text-[13px] font-semibold text-green-800">
              Note: {order.notes}
            </p>
          )}
        </div>
      </div>

      <div className="mt-2 flex items-center justify-between gap-2 text-[13px] font-semibold text-slate-500">
        <span>
          {order.itemCount} item(s) · {formatMoney(order.total)} ·{' '}
          {order.paymentMethod.replace('_', ' ')}
        </span>
        {deliveryCount > 1 && (
          <button type="button" onClick={onSelectOther} className="font-bold text-red-700 underline">
            Next delivery
          </button>
        )}
      </div>

      {/* Balanced actions: red = the delivery action itself, green = service
          and contact, white/red = navigation, ghost = reporting. */}
      <div className="mt-3 flex flex-wrap gap-2">
        {delivering && (
          <Button loading={busy} onClick={onComplete}>
            Complete delivery
          </Button>
        )}
        <a
          href={`tel:${order.deliveryPhone}`}
          className="inline-flex min-h-11 items-center gap-2 rounded-2xl bg-green-600 px-4 text-[15px] font-bold text-white shadow-green transition hover:bg-green-700"
        >
          <PhoneIcon className="h-4 w-4" />
          Call
        </a>
        {delivering && navPoint && (
          <a
            href={`https://www.openstreetmap.org/directions?to=${navPoint.lat},${navPoint.lng}`}
            target="_blank"
            rel="noreferrer"
            className="inline-flex min-h-11 items-center gap-2 rounded-2xl border border-red-200 bg-white px-4 text-[15px] font-semibold text-red-700 transition hover:bg-red-50"
          >
            <NavigationIcon className="h-4 w-4" />
            Navigate
          </a>
        )}
        <Button variant="ghost" size="md" onClick={onIssue}>
          Report issue
        </Button>
      </div>
    </div>
  );
}

function EmptyDelivery() {
  return (
    <div className="pb-6 pt-2">
      <p className="text-base font-extrabold text-slate-900">No active delivery to navigate</p>
      <p className="mt-1 text-sm text-slate-600">
        Accept a delivery from the list and the full route appears here automatically.
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Link
          to="/driver/deliveries"
          className="inline-flex min-h-11 items-center justify-center rounded-2xl bg-red-600 px-4 text-[15px] font-semibold text-white shadow-brand-soft transition hover:bg-red-700"
        >
          Go to deliveries
        </Link>
        <span className="food-chip">
          <LeafIcon className="h-3 w-3" aria-hidden="true" />
          available today
        </span>
      </div>
    </div>
  );
}

function IssueDialog({ order, onClose }: { order: OrderDTO; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [note, setNote] = useState('');
  const [working, setWorking] = useState(false);

  const submit = async () => {
    setWorking(true);
    try {
      await postDriverAction(`/driver/deliveries/${order.id}/issue`, { note: note.trim() });
      toast('The issue was reported to the administrators.', 'success');
      void queryClient.invalidateQueries({ queryKey: ['driver-deliveries'] });
      onClose();
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Could not report the issue.', 'error');
    } finally {
      setWorking(false);
    }
  };

  return (
    <Modal open title={`Report issue · ${order.orderNumber}`} onClose={onClose}>
      <p className="text-sm text-slate-700">Describe what happened so the administrators can help.</p>
      <Textarea
        value={note}
        onChange={(event) => setNote(event.target.value)}
        rows={4}
        placeholder="e.g. Customer is not answering the phone at the gate…"
        className="mt-3"
      />
      <div className="mt-4 flex justify-end gap-2">
        <Button variant="ghost" onClick={onClose} disabled={working}>
          Cancel
        </Button>
        <Button loading={working} disabled={note.trim().length < 5} onClick={() => void submit()}>
          Send report
        </Button>
      </div>
    </Modal>
  );
}



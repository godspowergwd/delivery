import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import type { OrderDTO, OrderStatus } from '@delivery/shared';
import { ORDER_STATUS_DESCRIPTIONS, ORDER_STATUS_FLOW, ORDER_STATUS_LABELS, ORDER_STATUS_TONE, orderStatusIndex } from '@delivery/shared';
import { api } from '../../lib/api';
import { useOrderTracking } from '../../lib/tracking';
import { useDeviceLocation } from '../../lib/geolocation';
import { LiveMap, useLiveMap } from '../../components/LiveMap';
import { Button, Card, Spinner } from '../../components/ui';
import { ArrowLeftIcon, PhoneIcon, RestaurantIcon, TruckIcon } from '../../components/icons';
import { estimateAddressCoordinates, formatDistance } from '../../lib/live-map';

const TRACK_TONE_CLASSES = [
  'bg-red-600 text-white',
  'bg-red-800 text-white',
  'bg-green-600 text-white',
  'success-gradient text-white shadow-green',
  'bg-green-800 text-white',
] as const;

/** The five customer-facing steps of the Waakye App order lifecycle. */
const TRACK_STEPS = [
  { label: 'Order placed', short: 'Placed' },
  { label: 'Order accepted', short: 'Accepted' },
  { label: 'Serving', short: 'Being prepared' },
  { label: 'Out for delivery', short: 'On the way' },
  { label: 'Delivered', short: 'Done' },
];

/** Shown instead of the delivery flow when an order was cancelled. */
const CANCELLED_STEPS = [
  { label: 'Order placed', short: 'Placed' },
  { label: 'Cancelled', short: 'Stopped' },
];

function LiveBadge() {
  return (
    <span className="flex items-center gap-1.5 rounded-full bg-green-600 px-2.5 py-1 text-[11px] font-extrabold uppercase tracking-wide text-white shadow-green">
      <span className="relative flex h-2 w-2">
        <span className="animate-glow absolute inset-0 rounded-full bg-green-400/40" />
        <span className="absolute inset-0 rounded-full bg-green-400" />
      </span>
      Live
    </span>
  );
}

function CheckIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <path d="m5 12.5 3.5 3.5L19 7" />
    </svg>
  );
}

export default function CustomerTracking() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const mapHostRef = useRef<HTMLDivElement>(null);
  const mapRef = useLiveMap(mapHostRef);
  const location = useDeviceLocation({ enabled: true });
  const activeLatest = useQuery({
    queryKey: ['active-orders'],
    queryFn: () => api.get<{ orders: OrderDTO[] }>('/orders/active'),
    enabled: !id,
    refetchInterval: 15_000,
  });
  const effectiveId = id ?? activeLatest.data?.orders?.[0]?.id;
  const order = useQuery({
    queryKey: ['order', effectiveId],
    queryFn: () => api.get<{ order: OrderDTO }>('/orders/' + effectiveId),
    enabled: Boolean(effectiveId),
  });
  const tracking = useOrderTracking(order.data?.order?.id ?? effectiveId);
  const [showDriverDetails, setShowDriverDetails] = useState(false);

  const orderData = order.data?.order;
  const trackingData = tracking.data?.tracking;
  const driverLocation = trackingData?.driver?.location;
  const destination = useMemo(() => {
    if (!orderData) return null;
    if (orderData.deliveryLatitude != null && orderData.deliveryLongitude != null) {
      return { lat: orderData.deliveryLatitude, lng: orderData.deliveryLongitude };
    }
    // Fall back to a geocoded estimate of the written address so the driver's
    // route still points at the right neighbourhood when GPS was declined.
    const estimate = estimateAddressCoordinates(orderData.deliveryAddress, orderData.deliveryArea);
    return { lat: estimate.lat, lng: estimate.lng };
  }, [orderData]);

  useEffect(() => {
    if (driverLocation && mapRef.current) {
      mapRef.current.setDriver({ lat: driverLocation.latitude, lng: driverLocation.longitude }, { accuracyMetres: driverLocation.accuracy });
    }
  }, [driverLocation, mapRef]);

  useEffect(() => {
    if (destination && mapRef.current) mapRef.current.setDestination(destination);
  }, [destination, mapRef]);

  useEffect(() => {
    if (!location.position || !mapRef.current) return;
    mapRef.current.setUser(
      { lat: location.position.lat, lng: location.position.lng },
      location.position.accuracy,
    );
  }, [location.position, mapRef]);

  const cancelled = orderData?.status === 'CANCELLED';
  const steps = cancelled ? CANCELLED_STEPS : TRACK_STEPS;
  const activeIndex = cancelled
    ? CANCELLED_STEPS.length - 1
    : Math.max(0, orderData ? orderStatusIndex(orderData.status) : 0);
  const isLive = orderData?.status === 'OUT_FOR_DELIVERY';
  const driver = trackingData?.driver;
  const distanceKm = trackingData?.driverToDestinationKm;

    return (
    <div className="relative h-[100dvh] w-full overflow-hidden bg-slate-100">
      {/* The map container is always mounted so useLiveMap can construct the MapLibre
          instance on the first render — the hook builds the map once, on mount, and
          never re-runs for the same ref object. Rendering the container here (instead
          of inside the `!orderData` branch) is what makes the map actually appear;
          the loading spinner below simply overlays it while the order resolves. */}
      <LiveMap mapRef={mapHostRef} ariaLabel="Live delivery map" />

      {!orderData && (
        <div className="absolute inset-0 flex h-[100dvh] items-center justify-center bg-white px-6">
          {order.isPending ? (
            <Spinner className="h-8 w-8" />
          ) : (
            <Card>
              <p className="text-center text-sm text-slate-600">
                {order.error instanceof Error ? order.error.message : 'That order could not be found.'}
              </p>
            </Card>
          )}
        </div>
      )}

      {orderData && (
        <>
      <div className="absolute inset-x-0 top-0 z-20 flex items-center justify-between border-b border-white/20 bg-gradient-to-b from-black/55 via-black/30 to-transparent px-4 pb-3 pt-[max(env(safe-area-inset-top),0.75rem)]">
        <div className="flex items-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/90 shadow-sm">
            <TruckIcon className="h-5 w-5 text-slate-800" />
          </div>
          <div className="max-w-[180px] overflow-hidden text-left">
            <p className="text-xs font-bold uppercase tracking-wider text-white/80 truncate">{orderData.orderNumber}</p>
            <p className="text-sm font-extrabold text-white leading-tight truncate">{ORDER_STATUS_LABELS[orderData.status]}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {isLive && driverLocation && <LiveBadge />}
          {driver && (
            <button onClick={() => setShowDriverDetails(!showDriverDetails)} className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/90 shadow-sm text-slate-700">
              <PhoneIcon className="h-5 w-5" />
            </button>
          )}
          <button onClick={() => navigate(-1)} className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/90 shadow-sm text-slate-700">
            <ArrowLeftIcon className="h-5 w-5" />
          </button>
        </div>
      </div>

      {showDriverDetails && driver && (
        <div className="absolute left-4 bottom-20 z-20 max-w-xs rounded-2xl bg-white/95 backdrop-blur p-4 shadow-lift">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-green-100 text-green-700 font-extrabold">{driver.name.charAt(0)}</div>
            <div>
              <p className="text-sm font-bold text-slate-900">{driver.name}</p>
              <p className="text-xs text-slate-500">{driver.phone ? 'Contact available' : 'No phone'}</p>
            </div>
          </div>
          {driver.phone ? (
            <div className="mt-3">
              <a
                href={`tel:${driver.phone}`}
                className="block rounded-2xl brand-gradient px-4 py-2.5 text-center text-sm font-bold text-white shadow-brand transition hover:brightness-105"
              >
                Call {driver.name}
              </a>
            </div>
          ) : null}
        </div>
      )}

      <div className="absolute inset-x-4 bottom-[max(env(safe-area-inset-bottom),0.75rem)] z-20 flex flex-col gap-3">
        <div className="rounded-2xl bg-white p-4 shadow-card">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <RestaurantIcon className="h-5 w-5 text-slate-500" />
              <span className="text-sm font-semibold text-slate-700">{orderData.deliveryAddress}</span>
            </div>
            {distanceKm != null && distanceKm !== undefined && <span className="text-sm font-bold text-green-700">{formatDistance(distanceKm)} away</span>}
          </div>
          {isLive && (
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="relative flex h-2 w-2">
                  <span className="animate-glow absolute inset-0 rounded-full bg-green-400/40" />
                  <span className="absolute inset-0 rounded-full bg-green-400" />
                </span>
                <span className="text-sm font-semibold text-green-700">Driver is on the way</span>
              </div>
              {distanceKm != null ? (
                <span className="text-sm font-bold text-white bg-green-600 px-2.5 py-1 rounded-full">{formatDistance(distanceKm)} to you</span>
              ) : null}
            </div>
          )}
          {!isLive && (
            <p className="text-sm text-slate-600">{ORDER_STATUS_DESCRIPTIONS[orderData.status]}</p>
          )}
        </div>

        <div className="rounded-2xl border border-slate-100 bg-slate-50 divide-y divide-slate-100">
          {steps.map((step, i) => {
            const done = i < activeIndex;
            const current = i === activeIndex;
            const tone = i <= activeIndex ? TRACK_TONE_CLASSES[i] : 'bg-slate-200 text-slate-400';
            return (
              <div key={i} className="flex items-center gap-3 px-4 py-3">
                <div
                  className={`flex h-7 w-7 shrink-0 flex-col items-center justify-center rounded-full text-[11px] font-bold ${tone} ${current ? 'pulse-ring' : ''}`}
                >
                  {done ? <CheckIcon className="h-4 w-4" /> : <span className="leading-none">{i + 1}</span>}
                </div>
                <div className="min-w-0">
                  <p className={done || current ? 'text-sm font-semibold text-slate-900' : 'text-sm font-semibold text-slate-400'}>{step.label}</p>
                  <p className="text-[11px] text-slate-400">{step.short}</p>
                </div>
                {current && <span className="ml-auto text-[11px] font-bold text-amber-600">Now</span>}
              </div>
            );
          })}
                </div>
      </div>
        </>
      )}
    </div>
  );
}

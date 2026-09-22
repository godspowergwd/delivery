import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import type { OrderDTO } from '@delivery/shared';
import { ORDER_STATUS_LABELS } from '@delivery/shared';
import { api } from '../../lib/api';
import { useOrderTracking } from '../../lib/tracking';
import { useDeviceLocation } from '../../lib/geolocation';
import { useLiveMap } from '../../components/LiveMap';
import { Button, Card, Spinner } from '../../components/ui';
import { NavigationIcon, PhoneIcon, RestaurantIcon, TruckIcon } from '../../components/icons';
import { KITCHEN_ANCHOR, etaText, formatDistance } from '../../lib/live-map';

const STATUS_STEPS = {
  RECEIVED: [{ label: 'Order placed', short: 'Placed' }],
  ACCEPTED: [{ label: 'Order placed', short: 'Placed' }, { label: 'Restaurant accepted', short: 'Accepted' }],
  PREPARING: [{ label: 'Order placed', short: 'Placed' }, { label: 'Restaurant accepted', short: 'Accepted' }, { label: 'Preparing', short: 'Prepping' }],
  READY: [{ label: 'Order placed', short: 'Placed' }, { label: 'Restaurant accepted', short: 'Accepted' }, { label: 'Preparing', short: 'Prepping' }, { label: 'Ready for pickup', short: 'Ready' }],
  OUT_FOR_DELIVERY: [{ label: 'Order placed', short: 'Placed' }, { label: 'Restaurant accepted', short: 'Accepted' }, { label: 'Preparing', short: 'Prepping' }, { label: 'Ready for pickup', short: 'Ready' }, { label: 'Driver picked up', short: 'Picked up' }, { label: 'On the way to you', short: 'En route' }],
  DELIVERED: [{ label: 'Order placed', short: 'Placed' }, { label: 'Restaurant accepted', short: 'Accepted' }, { label: 'Preparing', short: 'Prepping' }, { label: 'Ready for pickup', short: 'Ready' }, { label: 'Driver picked up', short: 'Picked up' }, { label: 'On the way to you', short: 'En route' }, { label: 'Delivered', short: 'Delivered' }],
  CANCELLED: [{ label: 'Order placed', short: 'Placed' }, { label: 'Cancelled', short: 'Cancelled' }],
};

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
  const order = useQuery({
    queryKey: ['order', id],
    queryFn: () => api.get<{ order: OrderDTO }>('/orders/' + id),
    enabled: Boolean(id),
  });
  const tracking = useOrderTracking(order.data?.order?.id);
  const [showDriverDetails, setShowDriverDetails] = useState(false);

  const orderData = order.data?.order;
  const trackingData = tracking.data?.tracking;
  const driverLocation = trackingData?.driver?.location;
  const destination = useMemo(
    () => ({ lat: orderData?.deliveryLatitude ?? KITCHEN_ANCHOR.lat, lng: orderData?.deliveryLongitude ?? KITCHEN_ANCHOR.lng }),
    [orderData],
  );

  useEffect(() => {
    if (driverLocation && mapRef.current) {
      mapRef.current.setDriver({ lat: driverLocation.latitude, lng: driverLocation.longitude }, { accuracyMetres: driverLocation.accuracy });
    }
  }, [driverLocation, mapRef]);

  useEffect(() => {
    if (destination && mapRef.current) mapRef.current.setDestination(destination);
  }, [destination, mapRef]);

  useEffect(() => {
    if (orderData?.deliveryLatitude && orderData?.deliveryLongitude && mapRef.current) {
      mapRef.current.setDestination({ lat: orderData.deliveryLatitude, lng: orderData.deliveryLongitude });
    }
  }, [orderData]);

  const steps = orderData ? (STATUS_STEPS[orderData.status] ?? STATUS_STEPS.RECEIVED) : [];
  const activeIndex = orderData
    ? Math.min(steps.length - 1, steps.findIndex((s) => ORDER_STATUS_LABELS[orderData.status] === s.label || ORDER_STATUS_LABELS[orderData.status] === s.short))
    : 0;
  const isLive = orderData?.status === 'OUT_FOR_DELIVERY';
  const driver = trackingData?.driver;
  const distanceKm = trackingData?.driverToDestinationKm;

  if (!orderData) {
    return <Card><p className="text-center text-sm text-slate-600">Order not found.</p></Card>;
  }

  return (
    <div className="flex h-[100dvh] w-full flex-col bg-slate-100 overflow-hidden">
      <div ref={mapHostRef} className="absolute inset-0" />

      <div className="absolute top-0 left-0 right-0 z-20 flex items-center justify-between border-b border-white/20 bg-gradient-to-b from-black/50 via-black/30 to-transparent px-4 pt-10 pb-3">
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
            <NavigationIcon className="h-5 w-5" />
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
          <div className="mt-3 flex gap-2">
            <Button size="sm" className="flex-1">Call</Button>
            <Button size="sm" variant="secondary" className="flex-1">Message</Button>
          </div>
        </div>
      )}

      <div className="absolute left-4 right-4 bottom-0 z-20 flex flex-col gap-3">
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
                <span className="text-sm font-bold text-white bg-green-600 px-2.5 py-1 rounded-full">{etaText(distanceKm)}</span>
              ) : (
                <span className="text-sm font-bold text-white bg-slate-400 px-2.5 py-1 rounded-full">ETA pending</span>
              )}
            </div>
          )}
          {!isLive && (
            <p className="text-sm text-slate-500">{ORDER_STATUS_LABELS[orderData.status]} — {steps.length} steps</p>
          )}
        </div>

        <div className="rounded-2xl border border-slate-100 bg-slate-50 divide-y divide-slate-100">
          {steps.map((step, i) => {
            const done = i <= activeIndex;
            const current = i === activeIndex;
            return (
              <div key={i} className="flex items-center gap-3 px-4 py-3">
                <div
                  className={
                    done
                      ? 'flex h-7 w-7 shrink-0 flex-col items-center justify-center rounded-full text-[11px] font-bold bg-green-600 text-white'
                      : current
                        ? 'flex h-7 w-7 shrink-0 flex-col items-center justify-center rounded-full text-[11px] font-bold bg-amber-400 text-amber-900 ring-2 ring-amber-300'
                        : 'flex h-7 w-7 shrink-0 flex-col items-center justify-center rounded-full text-[11px] font-bold bg-slate-200 text-slate-400'
                  }
                >
                  {done ? <CheckIcon className="h-4 w-4" /> : <span className="leading-none">{i + 1}</span>}
                </div>
                <div className="min-w-0">
                  <p className={done ? 'text-sm font-semibold text-slate-900' : 'text-sm font-semibold text-slate-400'}>{step.label}</p>
                  <p className="text-[11px] text-slate-400">{step.short}</p>
                </div>
                {current && <span className="ml-auto text-[11px] font-bold text-amber-600">Now</span>}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

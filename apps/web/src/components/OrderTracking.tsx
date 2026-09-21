import { useEffect, useMemo, useRef, useState } from 'react';
import type { OrderDTO } from '@delivery/shared';
import { ORDER_STATUS_FLOW, ORDER_STATUS_LABELS } from '@delivery/shared';
import { distanceKm, etaText, formatDistance, geocodeAddress, KITCHEN_ANCHOR } from '../lib/live-map';
import { fetchRoadRoute, type RoadRoute } from '../lib/route';
import { positionAlongRoute, useAnimatedProgress } from '../lib/driver-sim';
import { useLiveMap } from './LiveMap';

/**
 * Live tracking section for the customer order page: real Accra roads,
 * animated driver marker along the route, live remaining distance + ETA.
 * Runs while the order is out for delivery; quiet otherwise.
 */
export function OrderTracking({ order }: { order: OrderDTO }) {
  const mapHostRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useLiveMap(mapHostRef);

  const pickup = KITCHEN_ANCHOR;
  const dropoff = useMemo(
    () => geocodeAddress(order.deliveryAddress, order.deliveryArea),
    [order.deliveryAddress, order.deliveryArea],
  );

  const [route, setRoute] = useState<RoadRoute | null>(null);
  useEffect(() => {
    if (order.status !== 'OUT_FOR_DELIVERY') return;
    const controller = new AbortController();
    setRoute(null);
    fetchRoadRoute(pickup, dropoff, controller.signal)
      .then(setRoute)
      .catch(() => undefined);
    return () => controller.abort();
  }, [order.id, order.status, pickup.lat, pickup.lng, dropoff.lat, dropoff.lng]);

  const legActive = order.status === 'OUT_FOR_DELIVERY';
  const progress = useAnimatedProgress(route ? Math.max(30, route.durationMin * 1200) : 60_000, legActive);
  const driverPosition = useMemo(
    () => (route ? positionAlongRoute(route.coordinates, progress) : pickup),
    [route, progress, pickup.lat, pickup.lng],
  );
  const remainingKm = route ? route.distanceKm * (1 - progress) : distanceKm(pickup, dropoff);

  useEffect(() => {
    if (!route) return;
    mapRef.current.setRoute(route.coordinates);
  }, [route, mapRef]);

  useEffect(() => {
    mapRef.current.moveDriver(driverPosition);
  }, [driverPosition, mapRef]);

  useEffect(() => {
    mapRef.current.moveDestination(dropoff);
  }, [dropoff, mapRef]);

  const stepIndex = ORDER_STATUS_FLOW.indexOf(order.status);
  if (order.status === 'CANCELLED') return null;

  return (
    <section className="overflow-hidden rounded-card bg-white shadow-card ring-1 ring-inset ring-slate-200/60">
      {legActive && (
        <div className="map-shell !rounded-b-none border-0 ring-0 h-64">
          <div ref={mapHostRef} className="map-canvas" data-testid="order-live-map" />
          <div className="map-overlay-card left-3 top-3 px-4 py-3">
            <p className="text-[13px] font-semibold text-slate-500">Your courier is on the way</p>
            <p className="text-lg font-extrabold leading-tight text-slate-900">
              {etaText(remainingKm)} · {formatDistance(remainingKm)}
            </p>
          </div>
        </div>
      )}
      <div className="space-y-3 p-4">
        <div className="flex items-center justify-between">
          <p className="text-sm font-bold text-slate-800">Order progress</p>
          <span className="text-[13px] font-semibold text-slate-500">
            {stepIndex + 1} of {ORDER_STATUS_FLOW.length}
          </span>
        </div>
        <div className="flex gap-1.5" aria-hidden="true">
          {ORDER_STATUS_FLOW.map((status, index) => (
            <span
              key={status}
              className={`h-1.5 flex-1 rounded-full transition-colors duration-500 ${
                index <= stepIndex ? 'bg-red-600' : 'bg-slate-200'
              }`}
            />
          ))}
        </div>
        <p className="text-[13px] font-semibold text-slate-600">{ORDER_STATUS_LABELS[order.status]}</p>
        {!legActive && (
          <p className="text-sm text-slate-500">
            Live map tracking starts the moment your courier leaves the kitchen.
          </p>
        )}
      </div>
    </section>
  );
}

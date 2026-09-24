import { useEffect, useMemo, useRef } from 'react';
import type { OrderDTO } from '@delivery/shared';
import { ORDER_STATUS_FLOW, ORDER_STATUS_LABELS, orderStatusIndex } from '@delivery/shared';
import { estimateAddressCoordinates, formatDistance, distanceKm } from '../lib/live-map';
import { fetchRoadRoute } from '../lib/route';
import { useLiveMap } from './LiveMap';
import { useOrderTracking } from '../lib/tracking';

const ORDER_PROGRESS_TONES = [
  'bg-red-600',
  'bg-red-800',
  'bg-green-600',
  'success-gradient shadow-green',
  'bg-green-800',
] as const;

/**
 * Live tracking section for the customer order page: real Accra roads,
 * the driver's actual device GPS, live remaining distance + ETA.
 * Runs while the order is out for delivery; quiet otherwise.
 */
export function OrderTracking({ order }: { order: OrderDTO }) {
  const mapHostRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useLiveMap(mapHostRef);
  const tracking = useOrderTracking(order.id);

  const dropoff = useMemo(
    () =>
      typeof order.deliveryLatitude === 'number' && typeof order.deliveryLongitude === 'number'
        ? { lat: order.deliveryLatitude, lng: order.deliveryLongitude }
        : estimateAddressCoordinates(order.deliveryAddress, order.deliveryArea),
    [order.deliveryLatitude, order.deliveryLongitude, order.deliveryAddress, order.deliveryArea],
  );

  const orderTracking = tracking.data?.tracking;
  const driverLocation = orderTracking?.driver?.location ?? null;
  const destinationLatLng = useMemo(
    () => ({ lat: dropoff.lat, lng: dropoff.lng }),
    [dropoff],
  );

  useEffect(() => {
    if (!orderTracking?.driver?.location) return;
    mapRef.current.setDriver(
      { lat: orderTracking.driver.location.latitude, lng: orderTracking.driver.location.longitude },
      { accuracyMetres: orderTracking.driver.location.accuracy },
    );
  }, [orderTracking, mapRef]);

  useEffect(() => {
    mapRef.current.setDestination(destinationLatLng);
  }, [destinationLatLng, mapRef]);

  const routeKeyRef = useRef<string | null>(null);
  useEffect(() => {
    if (order.status !== 'OUT_FOR_DELIVERY' || !driverLocation) return;
    const key = `${driverLocation.latitude.toFixed(5)},${driverLocation.longitude.toFixed(5)}`;
    if (routeKeyRef.current === key) return;
    routeKeyRef.current = key;

    const controller = new AbortController();
    fetchRoadRoute(
      { lat: driverLocation.latitude, lng: driverLocation.longitude },
      { lat: destinationLatLng.lat, lng: destinationLatLng.lng },
      controller.signal,
    ).then((route) => {
      mapRef.current.setRoute(route.coordinates, { fit: false });
    }).catch(() => undefined);
    return () => controller.abort();
  }, [order.status, driverLocation, destinationLatLng, mapRef]);

  const remainingKm =
    driverLocation && destinationLatLng
      ? distanceKm(
          { lat: driverLocation.latitude, lng: driverLocation.longitude },
          { lat: destinationLatLng.lat, lng: destinationLatLng.lng },
        )
      : null;

  const stepIndex = orderStatusIndex(order.status);
  if (order.status === 'CANCELLED') return null;

  const isLive = order.status === 'OUT_FOR_DELIVERY';

  return (
    <section className="overflow-hidden rounded-card bg-white shadow-card ring-1 ring-inset ring-slate-200/60">
      {isLive && (
        <div className="map-shell !rounded-b-none border-0 ring-0 h-64">
          <div ref={mapHostRef} className="map-canvas" data-testid="order-live-map" />
          <div className="map-overlay-card left-3 top-3 px-4 py-3">
            <p className="text-[13px] font-semibold text-slate-500">Your courier is on the way</p>
            <p className="text-lg font-extrabold leading-tight text-slate-900">
              {remainingKm !== null ? `${formatDistance(remainingKm)} away` : '—'}
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
              className={`h-1.5 flex-1 rounded-full transition-colors duration-500 ${index <= stepIndex ? ORDER_PROGRESS_TONES[index] : 'bg-slate-200'}`}
            />
          ))}
        </div>
        <p className="text-[13px] font-semibold text-slate-600">{ORDER_STATUS_LABELS[order.status]}</p>
        {!isLive && (
          <p className="text-sm text-slate-500">
            Live map tracking starts the moment your courier leaves the kitchen.
          </p>
        )}
      </div>
    </section>
  );
}

import { useEffect, useRef } from 'react';
import type { OrderDTO } from '@delivery/shared';
import { ORDER_STATUS_FLOW, ORDER_STATUS_LABELS, orderStatusIndex } from '@delivery/shared';
import { formatDistance, distanceKm } from '../lib/live-map';
import { useDeliveryRoute } from '../lib/route';
import { useLiveMap } from './LiveMap';
import { useOrderTracking } from '../lib/tracking';

const ORDER_PROGRESS_TONES = [
  /* Order placed   */ 'bg-red-600',
  /* Order accepted  */ 'bg-green-600',
  /* Serving         */ 'bg-red-700',
  /* Out for delivery*/ 'duo-progress',
  /* Delivered       */ 'bg-green-700',
] as const;

/**
 * Live tracking section for the customer order page: real Accra roads,
 * the driver's actual device GPS, live remaining distance + ETA.
 * Runs while the order is out for delivery; quiet otherwise.
 */
export function OrderTracking({ order }: { order: OrderDTO }) {
  const mapHostRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useLiveMap(mapHostRef, {
    // The card follows the delivery: the camera keeps the courier and the
    // destination in view and only moves when one of them would leave it.
    follow: true,
    followMode: 'bounds',
  });
  const tracking = useOrderTracking(order.id);

  // Real checkout GPS only — never invent a pin for a typed address.
  // The server's geocoded destination is used as a fallback so older orders
  // with GPS still pin the map; a typed address with no coordinates never
  // creates a fake pin.
  const orderTracking = tracking.data?.tracking;
  const driverLocation = orderTracking?.driver?.location ?? null;
  const serverDestination =
    orderTracking?.destination && orderTracking.destination.source === 'gps'
      ? { lat: orderTracking.destination.latitude, lng: orderTracking.destination.longitude }
      : null;
  const hasRealDropoff =
    typeof order.deliveryLatitude === 'number' &&
    typeof order.deliveryLongitude === 'number' &&
    Number.isFinite(order.deliveryLatitude) &&
    Number.isFinite(order.deliveryLongitude) &&
    (order.deliveryLatitude !== 0 || order.deliveryLongitude !== 0);
  const destinationLatLng = hasRealDropoff
    ? { lat: order.deliveryLatitude as number, lng: order.deliveryLongitude as number }
    : serverDestination;

  useEffect(() => {
    if (!orderTracking?.driver?.location) return;
    mapRef.current.setDriver(
      { lat: orderTracking.driver.location.latitude, lng: orderTracking.driver.location.longitude },
      // The heading the driver's device reported, carried on the tracking DTO.
      { heading: orderTracking.driver.location.heading },
    );
  }, [orderTracking, mapRef]);

  useEffect(() => {
    mapRef.current.setDestination(destinationLatLng);
  }, [destinationLatLng, mapRef]);

  const { route, error: routeError } = useDeliveryRoute(
    driverLocation
      ? { lat: driverLocation.latitude, lng: driverLocation.longitude }
      : null,
    destinationLatLng,
    order.status === 'OUT_FOR_DELIVERY',
  );

  useEffect(() => {
    mapRef.current.setRoute(route?.coordinates ?? []);
  }, [mapRef, route]);

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
        <>
          <div className="map-shell !rounded-b-none border-0 ring-0 h-64">
            <div ref={mapHostRef} className="map-canvas" data-testid="order-live-map" />
          </div>
          <p className="map-status-pill">
            <span>Your courier is on the way</span>
            <strong>{remainingKm !== null ? `${formatDistance(remainingKm)} away` : '-'}</strong>
          </p>
          {routeError && (
            <p className="px-4 py-2 text-xs font-medium text-red-700" role="status">
              Road directions are temporarily unavailable. Live location is still updating.
            </p>
          )}
        </>
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

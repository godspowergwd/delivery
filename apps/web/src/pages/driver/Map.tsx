import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { OrderDTO } from '@delivery/shared';
import { ORDER_STATUS_LABELS, formatMoney } from '@delivery/shared';
import { fetchDriverDeliveries, postDriverAction } from '../../lib/driver-api';
import { useRealtimeSync } from '../../lib/realtime';
import { distanceKm, etaText, formatDistance, geocodeAddress, KITCHEN_ANCHOR } from '../../lib/live-map';
import { fetchRoadRoute, type RoadRoute } from '../../lib/route';
import { positionAlongRoute, useAnimatedProgress } from '../../lib/driver-sim';
import { useLiveMap } from '../../components/LiveMap';
import { Button, EmptyState, Spinner, StatusPill } from '../../components/ui';
import { BikeIcon, MapPinIcon, WalletIcon } from '../../components/icons';

export default function DriverMap() {
  useRealtimeSync();
  const queryClient = useQueryClient();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const mapHostRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useLiveMap(mapHostRef);

  const { data: orders = [], isLoading, isError, error } = useQuery({
    queryKey: ['driver-deliveries', 'map'],
    queryFn: () => fetchDriverDeliveries('/driver/deliveries?status=ACCEPTED,PREPARING,READY,OUT_FOR_DELIVERY'),
    refetchInterval: 15_000,
  });

  const selected = useMemo(
    () => orders.find((order) => order.id === selectedId) ?? orders[0] ?? null,
    [orders, selectedId],
  );

  const pickup = KITCHEN_ANCHOR;
  const dropoff = useMemo(
    () => geocodeAddress(selected?.deliveryAddress, selected?.deliveryArea),
    [selected?.deliveryAddress, selected?.deliveryArea],
  );

  const [route, setRoute] = useState<RoadRoute | null>(null);
  useEffect(() => {
    if (!selected) return;
    const controller = new AbortController();
    setRoute(null);
    fetchRoadRoute(pickup, dropoff, controller.signal)
      .then((next) => setRoute(next))
      .catch(() => undefined);
    return () => controller.abort();
  }, [selected?.id, pickup.lat, pickup.lng, dropoff.lat, dropoff.lng]);

  // Simulated delivery leg until real GPS streams from the backend: the driver
  // glides from the kitchen along the actual road route with zero jumps.
  const legActive = selected?.status === 'OUT_FOR_DELIVERY';
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

  if (isLoading) {
    return (
      <div className="flex justify-center py-16">
        <Spinner className="h-8 w-8" />
      </div>
    );
  }
  if (isError) {
    return <EmptyState title="Something went wrong" hint={error instanceof Error ? error.message : 'Could not load the map.'} />;
  }
  if (!selected) {
    return (
      <EmptyState title="No active delivery to navigate" hint="Accept a delivery first and its live route will appear here." />
    );
  }

  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-2xl font-extrabold tracking-tight text-slate-900">Live navigation</h1>
        <p className="text-sm text-slate-500">Real Accra roads, live route and ETA — no app switching.</p>
      </header>

      {orders.length > 1 && (
        <div className="flex flex-wrap gap-2">
          {orders.map((order) => (
            <button
              key={order.id}
              onClick={() => setSelectedId(order.id)}
              aria-pressed={selected.id === order.id}
              className={
                selected.id === order.id
                  ? 'rounded-full bg-red-600 px-4 py-2 text-sm font-bold text-white shadow-brand-soft'
                  : 'rounded-full bg-white px-4 py-2 text-sm font-semibold text-slate-600 shadow-soft ring-1 ring-inset ring-slate-200 hover:text-slate-900'
              }
            >
              {order.orderNumber}
            </button>
          ))}
        </div>
      )}

      <div className="map-shell h-[46dvh] min-h-72">
        <div ref={mapHostRef} className="map-canvas" data-testid="driver-live-map" />
        <div className="map-overlay-card left-3 top-3 flex items-center gap-3 px-4 py-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-full bg-green-50 text-green-700">
            <BikeIcon className="h-5 w-5" aria-hidden="true" />
          </span>
          <div>
            <p className="text-[13px] font-semibold text-slate-500">Arriving in</p>
            <p className="text-lg font-extrabold leading-tight text-slate-900">
              {legActive ? etaText(remainingKm) : 'Awaiting pickup'}
            </p>
          </div>
        </div>
        <div className="map-overlay-card bottom-3 left-3 right-3 flex items-center justify-between gap-3 px-4 py-3">
          <div className="min-w-0">
            <p className="truncate text-[13px] font-semibold text-slate-500">Remaining</p>
            <p className="text-lg font-extrabold leading-tight text-slate-900">{formatDistance(remainingKm)}</p>
          </div>
          <StatusPill status={selected.status} label={ORDER_STATUS_LABELS[selected.status]} />
        </div>
      </div>

      <div className="rounded-card bg-white p-4 shadow-card ring-1 ring-inset ring-slate-200/60">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="font-mono text-sm text-slate-800">{selected.orderNumber}</p>
            <p className="text-sm font-semibold text-slate-900">{selected.customerName}</p>
            <p className="text-sm text-slate-600">{selected.deliveryPhone}</p>
          </div>
          <StatusPill status={selected.status} label={ORDER_STATUS_LABELS[selected.status]} />
        </div>

        <div className="mt-3 space-y-1.5 text-sm text-slate-600">
          <p className="flex items-start gap-2">
            <MapPinIcon className="mt-0.5 h-3.5 w-3.5 flex-none text-red-600" aria-hidden="true" />
            <span>
              {selected.deliveryAddress}
              {selected.deliveryArea ? ` · ${selected.deliveryArea}` : ''}
            </span>
          </p>
          {selected.notes ? <p className="font-semibold text-red-700">Note: {selected.notes}</p> : null}
          <p className="flex items-center gap-2">
            <WalletIcon className="h-3.5 w-3.5 flex-none text-slate-500" aria-hidden="true" />
            <span>
              {formatMoney(selected.total)} · {selected.paymentMethod.replace('_', ' ')} · {selected.itemCount} item(s)
            </span>
          </p>
        </div>

        <div className="mt-3 flex flex-wrap gap-2">
          {selected.status === 'READY' && (
            <Button
              size="sm"
              onClick={async () => {
                try {
                  await postDriverAction(`/driver/deliveries/${selected.id}/pickup`);
                  void queryClient.invalidateQueries({ queryKey: ['driver-deliveries'] });
                } catch {
                  // surfaced by toast in Deliveries; keep map usable on failure
                }
              }}
            >
              Start delivery
            </Button>
          )}
          <a
            href={`tel:${selected.deliveryPhone}`}
            className="inline-flex items-center gap-2 rounded-2xl bg-slate-100 px-4 py-2 text-sm font-semibold text-slate-800 transition hover:bg-slate-200"
          >
            Call customer
          </a>
          <a
            href={`https://www.openstreetmap.org/directions?to=${dropoff.lat},${dropoff.lng}`}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-300"
          >
            Turn-by-turn ↗
          </a>
        </div>
      </div>
    </div>
  );
}

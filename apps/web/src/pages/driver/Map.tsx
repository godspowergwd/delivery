import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { OrderDTO } from '@delivery/shared';
import { ORDER_STATUS_LABELS, formatMoney } from '@delivery/shared';
import { fetchDriverDeliveries } from '../../lib/driver-api';
import { useRealtimeSync } from '../../lib/realtime';
import { MapPinIcon, WalletIcon } from '../../components/icons';
import { Button, Card, EmptyState, Spinner, StatusPill } from '../../components/ui';

function mapsUrl(order: OrderDTO): string {
  const target = encodeURIComponent(order.deliveryAddress);
  const origin = encodeURIComponent(order.deliveryArea ?? '');
  return origin
    ? `https://www.google.com/maps/dir/?api=1&origin=${origin}&destination=${target}`
    : `https://www.google.com/maps/search/?api=1&query=${target}`;
}

function osmEmbed(order: OrderDTO): string {
  return `https://www.openstreetmap.org/export/embed.html?bbox=&layer=mapnik&marker=${encodeURIComponent(
    order.deliveryAddress,
  )}`;
}

export default function DriverMap() {
  useRealtimeSync();
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const { data: orders = [], isLoading, isError, error } = useQuery({
    queryKey: ['driver-deliveries', 'map'],
    queryFn: () =>
      fetchDriverDeliveries('/driver/deliveries?status=ACCEPTED,PREPARING,READY,OUT_FOR_DELIVERY'),
    refetchInterval: 15_000,
  });

  const selected = useMemo(
    () => orders.find((order) => order.id === selectedId) ?? orders[0] ?? null,
    [orders, selectedId],
  );

  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-2xl font-extrabold text-slate-900">Delivery map</h1>
        <p className="text-sm text-slate-500">
          Route guidance and delivery info without leaving the map.
        </p>
      </header>

      {isLoading ? (
        <div className="flex justify-center py-12">
          <Spinner className="h-8 w-8" />
        </div>
      ) : isError ? (
        <EmptyState title="Something went wrong" hint={error instanceof Error ? error.message : 'Could not load the map.'} />
      ) : !selected ? (
        <EmptyState
          title="No active delivery to navigate"
          hint="Accept a delivery first and its route will appear here."
        />
      ) : (
        <>
          {orders.length > 1 && (
            <div className="flex flex-wrap gap-2">
              {orders.map((order) => (
                <button
                  key={order.id}
                  onClick={() => setSelectedId(order.id)}
                  aria-pressed={selected.id === order.id}
                  className={
                    selected.id === order.id
                      ? 'rounded-full bg-red-600 px-3 py-1.5 text-sm font-bold text-white'
                      : 'rounded-full bg-slate-100 px-3 py-1.5 text-sm font-semibold text-slate-700 hover:bg-slate-200'
                  }
                >
                  {order.orderNumber}
                </button>
              ))}
            </div>
          )}

          <Card className="!p-0 overflow-hidden">
            <iframe
              title={`Delivery location for ${selected.orderNumber}`}
              src={osmEmbed(selected)}
              className="h-64 w-full border-0"
              loading="lazy"
            />
          </Card>

          <Card className="!p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-mono text-sm text-slate-800">{selected.orderNumber}</p>
                <p className="text-sm font-semibold text-slate-900">{selected.customerName}</p>
                <p className="text-sm text-slate-600">{selected.deliveryPhone}</p>
              </div>
              <StatusPill status={selected.status} label={ORDER_STATUS_LABELS[selected.status]} />
            </div>

            <div className="mt-3 space-y-1.5 text-sm text-slate-600">
              <p className="flex items-center gap-2">
                <MapPinIcon className="h-3.5 w-3.5 flex-none text-slate-500" aria-hidden="true" />
                <span>{selected.deliveryAddress}{selected.deliveryArea ? ` · ${selected.deliveryArea}` : ''}</span>
              </p>
              {selected.notes ? <p className="text-red-700">Note: {selected.notes}</p> : null}
              <p className="flex items-center gap-2">
                <WalletIcon className="h-3.5 w-3.5 flex-none text-slate-500" aria-hidden="true" />
                <span>
                  {formatMoney(selected.total)} · {selected.paymentMethod.replace('_', ' ')} ·{' '}
                  {selected.itemCount} item(s)
                </span>
              </p>
            </div>

            <div className="mt-3 flex flex-wrap gap-2">
              <a
                href={mapsUrl(selected)}
                target="_blank"
                rel="noreferrer"
                className="rounded-2xl bg-red-600 px-4 py-2 text-sm font-bold text-white hover:bg-red-700"
              >
                Start turn-by-turn navigation ↗
              </a>
              <a
                href={`tel:${selected.deliveryPhone}`}
                className="rounded-2xl bg-slate-100 px-4 py-2 text-sm font-semibold text-slate-800 hover:bg-slate-200"
              >
                Call customer
              </a>
              {selected.status === 'READY' && (
                <Button size="sm" onClick={() => window.location.assign('/driver/deliveries')}>
                  Open deliveries to start
                </Button>
              )}
            </div>
          </Card>
        </>
      )}
    </div>
  );
}

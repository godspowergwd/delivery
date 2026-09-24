import { useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import type { OrderDTO } from '@delivery/shared';
import { ORDER_STATUS_LABELS, formatMoney, formatRelativeTime } from '@delivery/shared';
import { fetchDriverDeliveries, fetchDriverSummary } from '../../lib/driver-api';
import { ClockIcon, ReceiptIcon, TruckIcon } from '../../components/icons';
import { Card, EmptyState, Spinner, StatusPill } from '../../components/ui';

export default function DriverEarnings() {
  const [tab, setTab] = useState<'week' | 'month' | 'all'>('all');
  const monthTabs: { label: string; value: string }[] = [
    { label: 'This week', value: 'week' },
    { label: 'This month', value: 'month' },
    { label: 'All time', value: 'all' },
  ];

  const { data: summary, isLoading: summaryLoading } = useQuery({
    queryKey: ['driver-summary'],
    queryFn: fetchDriverSummary,
  });

  const { data: delivered = [], isLoading: ordersLoading, isError } = useQuery({
    queryKey: ['driver-history'],
    queryFn: () => fetchDriverDeliveries('/driver/deliveries?status=DELIVERED'),
    staleTime: 60_000,
  });

  const orders = useMemo(() => {
    const start = new Date();
    if (tab === 'week') start.setDate(start.getDate() - 7);
    if (tab === 'month') start.setDate(1);
    if (tab === 'all') return delivered;
    return delivered.filter((o) => o.deliveredAt && new Date(o.deliveredAt) >= start);
  }, [delivered, tab]);

  const earnings = useMemo(() => {
    return orders.reduce((acc, order) => {
      const fee = order.deliveryFee ?? 0;
      const tip = (order as OrderDTO & { tip?: number }).tip ?? 0;
      acc.count += 1;
      acc.total += fee + tip;
      acc.fees += fee;
      acc.tips += tip;
      return acc;
    }, { count: 0, total: 0, fees: 0, tips: 0 });
  }, [orders]);

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-2xl font-extrabold text-slate-900">Earnings</h1>
        <p className="text-sm text-slate-500">Your delivery earnings and payout history.</p>
      </header>

      {/* Today's snapshot from summary API */}
      {summaryLoading ? (
        <div className="flex justify-center py-8"><Spinner className="h-7 w-7" /></div>
      ) : summary ? (
        <div className="grid grid-cols-2 gap-3">
          <Card className="!p-4">
            <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Today</p>
            <p className="mt-1 text-2xl font-extrabold text-slate-900">{formatMoney(summary.earningsToday)}</p>
            <p className="mt-1 text-xs text-slate-500">{summary.completedToday} deliveries</p>
          </Card>
          <Card className="!p-4">
            <p className="text-xs font-bold uppercase tracking-wide text-slate-500">All-time</p>
            <p className="mt-1 text-2xl font-extrabold text-red-600">{formatMoney(earnings.total)}</p>
            <p className="mt-1 text-xs text-slate-500">{earnings.count} deliveries</p>
          </Card>
        </div>
      ) : (
        <EmptyState title="Could not load earnings" hint="They will refresh automatically." />
      )}

      {/* Period tabs */}
      <div className="flex gap-1 rounded-full bg-slate-100 p-1 text-sm font-semibold">
        {monthTabs.map((m) => (
          <button
            key={m.value}
            onClick={() => setTab(m.value as 'week' | 'month' | 'all')}
            className={
              tab === m.value
                ? 'flex-1 rounded-full bg-red-700 py-2 text-white shadow-brand-soft'
                : 'flex-1 rounded-full py-2 text-slate-500 hover:text-slate-800'
            }
          >
            {m.label}
          </button>
        ))}
      </div>

      {/* Recent completed deliveries */}
      <section className="space-y-3">
        <h2 className="text-sm font-bold uppercase tracking-wide text-slate-500">Recent deliveries</h2>
        {ordersLoading ? (
          <div className="flex justify-center py-8">
            <Spinner className="h-6 w-6" />
          </div>
        ) : isError ? (
          <EmptyState title="Something went wrong" hint="Could not load your delivery history." />
        ) : orders.length === 0 ? (
          <EmptyState title="No completed deliveries yet" hint="Deliveries you complete will appear here." />
        ) : (
          <div className="space-y-3">
            {orders.map((order) => (
              <DeliveryRow key={order.id} order={order} />
            ))}
          </div>
        )}

      </section>

      {/* Earnings breakdown */}
      <Card className="!p-4">
        <h2 className="text-sm font-bold uppercase tracking-wide text-slate-500">Breakdown</h2>
        <div className="mt-3 space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-slate-500">Delivery fees</span>
            <span className="font-semibold text-slate-900">{formatMoney(earnings.fees)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-500">Tips</span>
            <span className="font-semibold text-slate-900">{formatMoney(earnings.tips)}</span>
          </div>
          <div className="mt-2 flex justify-between border-t border-slate-200 pt-2 text-base font-extrabold">
            <span className="text-slate-900">Total earned</span>
            <span className="text-red-600">{formatMoney(earnings.total)}</span>
          </div>
        </div>
      </Card>
    </div>
  );
}

function DeliveryRow({ order }: { order: OrderDTO }) {
  const delivered = order.deliveredAt ? new Date(order.deliveredAt) : null;
  const tip = (order as OrderDTO & { tip?: number }).tip ?? 0;
  return (
    <Card className="!p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-slate-500">#{order.orderNumber}</span>
            <StatusPill status={order.status} label={ORDER_STATUS_LABELS[order.status]} />
          </div>
          <p className="mt-1 line-clamp-1 text-sm text-slate-600">{order.deliveryAddress}</p>
          <div className="mt-1 flex items-center gap-3 text-xs text-slate-400">
            {delivered ? (
              <>
                <span className="inline-flex items-center gap-1">
                  <ReceiptIcon className="h-3 w-3" />{formatDate(delivered)}
                </span>
                <span className="inline-flex items-center gap-1">
                  <ClockIcon className="h-3 w-3" />
                  {formatRelativeTime(delivered.toISOString())}
                </span>
              </>
            ) : (
              <span className="inline-flex items-center gap-1">
                <TruckIcon className="h-3 w-3" />
                Delivered
              </span>
            )}
          </div>
        </div>
        <div className="flex flex-col items-end gap-0.5 text-right text-sm">
          <span className="font-bold text-slate-900">{formatMoney(order.deliveryFee)}</span>
          {tip > 0 && <span className="text-xs text-slate-500">+{formatMoney(tip)} tip</span>}
        </div>
      </div>
    </Card>
  );
}

function formatDate(d: Date): string {
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}
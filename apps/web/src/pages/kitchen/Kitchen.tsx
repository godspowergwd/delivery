import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { OrderDTO, Paginated } from '@delivery/shared';
import { ORDER_STATUS_LABELS, formatMoney, formatRelativeTime } from '@delivery/shared';
import { api } from '../../lib/api';
import { toast, useRealtimeSync } from '../../lib/realtime';
import { Button, Card, EmptyState, Spinner, StatusPill } from '../../components/ui';
import {
  InboxIcon,
  FlameIcon,
  ChefHatIcon,
  CheckCircleIcon,
  XCircleIcon,
  TruckIcon,
  WalletIcon,
} from '../../components/icons';
import type { ComponentType } from 'react';

const LIVE_STATUSES = ['RECEIVED', 'ACCEPTED', 'PREPARING', 'READY', 'OUT_FOR_DELIVERY'] as const;

/** The three queues of the kitchen main screen: New / Active / Completed. */
type QueueTab = 'new' | 'active' | 'completed';
const QUEUE_TABS: Array<{ id: QueueTab; label: string; statuses: string }> = [
  { id: 'new', label: 'New orders', statuses: 'RECEIVED' },
  { id: 'active', label: 'Active', statuses: 'ACCEPTED,PREPARING,READY,OUT_FOR_DELIVERY' },
  { id: 'completed', label: 'Completed', statuses: 'DELIVERED,CANCELLED' },
];

interface KitchenSummary {
  incoming: number;
  active: number;
  serving: number;
  outForDelivery: number;
  completedToday: number;
  cancelledToday: number;
  todayRevenue: number;
}

export function KitchenQueue() {
  useRealtimeSync();
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<QueueTab>('new');
  const activeStatuses = QUEUE_TABS.find((entry) => entry.id === tab)?.statuses ?? 'RECEIVED';

  const { data: summary } = useQuery({
    queryKey: ['kitchen-summary'],
    queryFn: () => api.get<KitchenSummary>('/kitchen/summary'),
    refetchInterval: 15_000,
  });

  const { data: page, isLoading } = useQuery({
    queryKey: ['kitchen-orders', activeStatuses],
    queryFn: () => api.get<Paginated<OrderDTO>>(`/kitchen/orders?status=${activeStatuses}`),
    refetchInterval: 10_000,
  });

  const orders = page?.items ?? [];

  async function advance(orderId: string, action: string, note?: string) {
    try {
      await api.post(`/kitchen/orders/${orderId}/${action}`, note ? { note } : undefined);
      void queryClient.invalidateQueries({ queryKey: ['kitchen-orders'] });
      void queryClient.invalidateQueries({ queryKey: ['kitchen-summary'] });
    } catch (error: any) {
      toast(error instanceof Error ? error.message : 'Action failed', 'error');
    }
  }

  if (isLoading) {
    return (
      <div className="flex justify-center py-16">
        <Spinner className="h-8 w-8" />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {summary && (
        <>
          <Card className="flex items-center gap-4 !border-red-200 !bg-red-50">
            <span className="flex h-12 w-12 flex-none items-center justify-center rounded-xl bg-red-600 text-white">
              <WalletIcon className="h-6 w-6" />
            </span>
            <div className="min-w-0">
              <p className="text-sm font-semibold uppercase tracking-wide text-red-600">Today revenue</p>
              <p className="truncate text-2xl font-extrabold text-slate-900">{formatMoney(summary.todayRevenue)}</p>
            </div>
          </Card>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <KitchenStat label="Incoming" value={summary.incoming} icon={InboxIcon} tile="bg-red-50 text-red-700" />
            <KitchenStat label="Active" value={summary.active} icon={FlameIcon} tile="bg-green-50 text-green-700" />
            <KitchenStat label="Serving" value={summary.serving} icon={ChefHatIcon} tile="bg-green-100 text-green-800" />
            <KitchenStat label="Out for delivery" value={summary.outForDelivery} icon={TruckIcon} tile="bg-green-50 text-green-700" />
            <KitchenStat label="Done today" value={summary.completedToday} icon={CheckCircleIcon} tile="bg-green-50 text-green-700" />
            <KitchenStat label="Cancelled" value={summary.cancelledToday} icon={XCircleIcon} tile="bg-slate-100 text-slate-500" />
          </div>
        </>
      )}

      <div className="flex gap-1 overflow-x-auto rounded-2xl bg-slate-100 p-1" role="tablist" aria-label="Order queues">
        {QUEUE_TABS.map((entry) => (
          <button
            key={entry.id}
            type="button"
            role="tab"
            aria-selected={tab === entry.id}
            onClick={() => setTab(entry.id)}
            className={`min-h-11 shrink-0 rounded-xl px-4 text-sm font-bold whitespace-nowrap transition ${
              tab === entry.id
                ? entry.id === 'new'
                  ? 'bg-red-700 text-white shadow-brand-soft'
                  : 'bg-green-600 text-white shadow-green'
                : 'text-slate-600 hover:text-slate-800'
            }`}
          >
            {entry.label}
          </button>
        ))}
      </div>

      {orders.length === 0 ? (
        <EmptyState
          title={
            tab === 'new' ? 'No new orders' : tab === 'active' ? 'No active orders' : 'No completed orders yet'
          }
          hint={
            tab === 'new'
              ? 'New orders appear here the moment a customer checks out.'
              : tab === 'active'
                ? 'Accepted and serving orders show up here.'
                : 'Delivered and cancelled orders are kept here for reference.'
          }
        />
      ) : (
        <div className="space-y-3">
          {orders.map((order) => (
            <KitchenOrderCard key={order.id} order={order} onAdvance={advance} />
          ))}
        </div>
      )}
    </div>
  );
}

function KitchenStat({ label, value, icon: Icon, tile }: {
  label: string; value: string | number; icon: ComponentType<{ className?: string }>; tile: string;
}) {
  return (
    <Card className="!p-4">
      <div className="flex items-center gap-3">
        <span className={`flex h-10 w-10 flex-none items-center justify-center rounded-xl ${tile}`}>
          <Icon className="h-5 w-5" />
        </span>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-slate-500">{label}</p>
          <p className="truncate text-xs font-extrabold text-slate-900">{value}</p>
        </div>
      </div>
    </Card>
  );
}

function KitchenOrderCard({
  order, onAdvance,
}: {
  order: OrderDTO;
  onAdvance: (id: string, action: string, note?: string) => void;
}) {
  const isLive = (LIVE_STATUSES as readonly string[]).includes(order.status);
  const actions = kitchenActions(order.status);

  return (
    <Card className="border-slate-200">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-extrabold text-slate-900">{order.orderNumber}</p>
          <p className="text-sm text-slate-500">
            {order.customerName} · {formatRelativeTime(order.createdAt)}
          </p>
        </div>
        <StatusPill status={order.status} label={ORDER_STATUS_LABELS[order.status]} />
      </div>

      <div className="space-y-1.5 mb-3">
        {order.items.map((item) => (
          <div key={item.id} className="flex items-center justify-between text-sm">
            <span className="text-slate-700">{item.quantity}× {item.name}</span>
            <span className="text-slate-600">{formatMoney(item.lineTotal)}</span>
          </div>
        ))}
      </div>

      <div className="flex items-center justify-between border-t border-slate-100 pt-3">
        <p className="text-sm font-bold text-red-600">{formatMoney(order.total)}</p>
        {isLive && (
          <div className="flex gap-2 flex-wrap justify-end">
            {actions.map((action) => (
              <Button
                key={action.label}
                size="sm"
                variant={action.variant ?? 'primary'}
                onClick={() => onAdvance(order.id, action.endpoint, action.note)}
              >
                {action.label}
              </Button>
            ))}
          </div>
        )}
      </div>
    </Card>
  );
}

function kitchenActions(status: string): Array<{
  label: string; endpoint: string;
  variant?: 'primary' | 'ghost' | 'outline' | 'danger' | 'success';
  note?: string;
}> {
  // Exactly three kitchen actions in the simple lifecycle:
  // ORDER ACCEPTED -> SERVING -> OUT FOR DELIVERY (the driver completes delivery).
  switch (status) {
    case 'RECEIVED':
      return [{ label: 'Accept order', endpoint: 'accept', note: 'Accepted by the kitchen' }];
    case 'ACCEPTED':
      return [{ label: 'Start serving', endpoint: 'preparing', note: 'Serving started' }];
    case 'PREPARING':
    case 'READY': // legacy orders packed before the simplified workflow
      return [{ label: 'Out for delivery', endpoint: 'dispatch', note: 'Out for delivery', variant: 'success' }];
    default:
      return [];
  }
}
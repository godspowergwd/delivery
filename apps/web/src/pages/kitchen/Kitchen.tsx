import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import type { OrderDTO, Paginated } from '@delivery/shared';
import { ORDER_STATUS_LABELS, formatMoney, formatRelativeTime } from '@delivery/shared';
import { api } from '../../lib/api';
import { toast, useRealtimeSync } from '../../lib/realtime';
import { Button, Card, EmptyState, Modal, Spinner, StatusPill } from '../../components/ui';
import {
  InboxIcon,
  FlameIcon,
  ChefHatIcon,
  PackageIcon,
  CheckCircleIcon,
  XCircleIcon,
  WalletIcon,
} from '../../components/icons';
import type { ComponentType } from 'react';
import { PrepTimer } from '../../components/PrepTimer';

const LIVE_STATUSES = ['RECEIVED', 'ACCEPTED', 'PREPARING', 'READY', 'OUT_FOR_DELIVERY'] as const;
const STATUS_FILTERS = ['all', ...LIVE_STATUSES] as const;

interface KitchenSummary {
  incoming: number;
  active: number;
  preparing: number;
  ready: number;
  completedToday: number;
  cancelledToday: number;
  todayRevenue: number;
}

export function KitchenQueue() {
  useRealtimeSync();
  const queryClient = useQueryClient();
  const [statusFilter, setStatusFilter] = useState('RECEIVED');
  const [rejectOrder, setRejectOrder] = useState<OrderDTO | null>(null);
  const [rejectReason, setRejectReason] = useState('');

  const { data: summary } = useQuery({
    queryKey: ['kitchen-summary'],
    queryFn: () => api.get<KitchenSummary>('/kitchen/summary'),
    refetchInterval: 15_000,
  });

  const { data: page, isLoading } = useQuery({
    queryKey: ['kitchen-orders', statusFilter],
    queryFn: () =>
      statusFilter === 'all'
        ? api.get<Paginated<OrderDTO>>('/kitchen/orders')
        : api.get<Paginated<OrderDTO>>(`/kitchen/orders?status=${statusFilter}`),
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

  async function rejectOrderNow() {
    if (!rejectOrder || !rejectReason.trim()) return;
    try {
      await api.post(`/kitchen/orders/${rejectOrder.id}/reject`, { reason: rejectReason });
      void queryClient.invalidateQueries({ queryKey: ['kitchen-orders'] });
      void queryClient.invalidateQueries({ queryKey: ['kitchen-summary'] });
      setRejectOrder(null);
      setRejectReason('');
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
            <KitchenStat label="Active" value={summary.active} icon={FlameIcon} tile="bg-red-50 text-red-600" />
            <KitchenStat label="Preparing" value={summary.preparing} icon={ChefHatIcon} tile="bg-red-100 text-red-800" />
            <KitchenStat label="Ready" value={summary.ready} icon={PackageIcon} tile="bg-red-50 text-red-700" />
            <KitchenStat label="Done today" value={summary.completedToday} icon={CheckCircleIcon} tile="bg-red-50 text-red-700" />
            <KitchenStat label="Cancelled" value={summary.cancelledToday} icon={XCircleIcon} tile="bg-slate-100 text-slate-500" />
          </div>
        </>
      )}

      <div className="flex gap-1 overflow-x-auto rounded-2xl bg-slate-100 p-1">
        {STATUS_FILTERS.map((f) => (
          <button
            key={f}
            onClick={() => setStatusFilter(f)}
            className={`shrink-0 rounded-xl px-3 py-1.5 text-sm font-semibold whitespace-nowrap ${
              statusFilter === f ? 'bg-red-600 text-white' : 'text-slate-600 hover:text-slate-800'
            }`}
          >
            {f === 'all' ? 'All Live' : ORDER_STATUS_LABELS[f as keyof typeof ORDER_STATUS_LABELS]}
          </button>
        ))}
      </div>

      {orders.length === 0 ? (
        <EmptyState title="No orders in this queue" hint="New orders will appear here automatically." />
      ) : (
        <div className="space-y-3">
          {orders.map((order) => (
            <KitchenOrderCard
              key={order.id}
              order={order}
              onAdvance={advance}
              onReject={() => setRejectOrder(order)}
            />
          ))}
        </div>
      )}
      <Modal open={!!rejectOrder} onClose={() => setRejectOrder(null)} title="Reject order">
        <p className="mb-3 text-sm text-slate-700">
          Tell the customer why order <span className="font-bold">{rejectOrder?.orderNumber}</span> was rejected.
        </p>
        <textarea
          value={rejectReason}
          onChange={(e) => setRejectReason(e.target.value)}
          placeholder="Reason for rejection..."
          maxLength={200}
          className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 shadow-sm outline-none focus:border-red-500 focus:ring-2 focus:ring-red-500/15"
        />
        <div className="mt-4 flex gap-2 justify-end">
          <Button variant="ghost" size="sm" onClick={() => setRejectOrder(null)}>Cancel</Button>
          <Button variant="danger" size="sm" onClick={rejectOrderNow} disabled={!rejectReason.trim()}>
            Reject order
          </Button>
        </div>
      </Modal>
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
          <p className="truncate text-xsl font-extrabold text-slate-900">{value}</p>
        </div>
      </div>
    </Card>
  );
}

function KitchenOrderCard({
  order, onAdvance, onReject,
}: {
  order: OrderDTO;
  onAdvance: (id: string, action: string, note?: string) => void;
  onReject: () => void;
}) {
  const isLive = (LIVE_STATUSES as readonly string[]).includes(order.status);
  const actions = kitchenActions(order.status);

  return (
    <Card className="border-slate-200">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <Link to="/kitchen/history" className="text-sm font-extrabold text-slate-900">
            {order.orderNumber}
          </Link>
          <p className="text-sm text-slate-500">
            {order.customerName} · {formatRelativeTime(order.createdAt)}
          </p>
        </div>
        <div className="flex flex-col items-end gap-1.5">
          <StatusPill status={order.status} label={ORDER_STATUS_LABELS[order.status]} />
          {isLive && (
            <PrepTimer startedAt={order.preparingAt ?? order.createdAt} targetMinutes={Math.max(...order.items.map(() => 15))} />
          )}
        </div>
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
  switch (status) {
    case 'RECEIVED':
      return [
        { label: 'Accept', endpoint: 'accept', note: 'Accepted by the kitchen' },
        { label: 'Reject', endpoint: 'reject', variant: 'danger' },
      ];
    case 'ACCEPTED':
      return [
        { label: 'Start preparing', endpoint: 'preparing', note: 'Preparation started' },
        { label: 'Reject', endpoint: 'reject', variant: 'danger' },
      ];
    case 'PREPARING':
      return [{ label: 'Mark ready', endpoint: 'ready', note: 'Order ready for dispatch' }];
    case 'READY':
      return [{ label: 'Dispatch', endpoint: 'dispatch', note: 'Out for delivery' }];
    case 'OUT_FOR_DELIVERY':
      return [{ label: 'Complete', endpoint: 'complete', note: 'Order completed', variant: 'success' }];
    default:
      return [];
  }
}
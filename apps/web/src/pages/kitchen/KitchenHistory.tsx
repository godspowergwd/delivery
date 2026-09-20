import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import type { OrderDTO, Paginated } from '@delivery/shared';
import { ORDER_STATUS_LABELS, formatMoney, formatRelativeTime } from '@delivery/shared';
import { api, qs } from '../../lib/api';
import { useRealtimeSync } from '../../lib/realtime';
import { Button, Card, EmptyState, Input, Select, Spinner, StatusPill } from '../../components/ui';

const HISTORY_STATUSES = ['DELIVERED', 'CANCELLED'] as const;

export function KitchenHistory() {
  useRealtimeSync();
  const [statusFilter, setStatusFilter] = useState<'DELIVERED' | 'CANCELLED' | 'all'>('all');
  const [search, setSearch] = useState('');

  const { data: page, isLoading } = useQuery({
    queryKey: ['kitchen-history', statusFilter, search],
    queryFn: () => {
      const params: Record<string, string | number | undefined> = {
        pageSize: 50,
        from: new Date(new Date().setHours(0, 0, 0, 0)).toISOString(),
      };
      if (statusFilter !== 'all') params.status = statusFilter;
      if (search) params.q = search;
      return api.get<Paginated<OrderDTO>>(`/kitchen/orders${qs(params)}`);
    },
    refetchInterval: 15_000,
  });

  const orders = page?.items ?? [];

  if (isLoading) {
    return (
      <div className="flex justify-center py-16">
        <Spinner className="h-8 w-8" />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex gap-2">
        <Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as any)}>
          <option value="all">All history</option>
          {HISTORY_STATUSES.map((s) => (
            <option key={s} value={s}>{ORDER_STATUS_LABELS[s]}</option>
          ))}
        </Select>
        <Input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by order number..."
          className="flex-1"
        />
      </div>

      {orders.length === 0 ? (
        <EmptyState title="No history yet" hint="Completed and cancelled orders appear here." />
      ) : (
        <div className="space-y-3">
          {orders.map((order) => (
            <Link key={order.id} to={`/app/orders/${order.id}`} className="block">
              <Card className="border-slate-200">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-extrabold text-slate-900">{order.orderNumber}</p>
                    <p className="text-sm text-slate-500">
                      {order.customerName} · {formatRelativeTime(order.createdAt)}
                    </p>
                  </div>
                  <div className="text-right">
                    <StatusPill status={order.status} label={ORDER_STATUS_LABELS[order.status]} />
                    <p className="mt-1 text-sm font-bold text-red-600">{formatMoney(order.total)}</p>
                  </div>
                </div>
              </Card>
            </Link>
          ))}
        </div>
      )}

      <p className="text-center text-sm text-slate-600 pt-4">
        Showing {orders.length} of {page?.total ?? 0} orders
      </p>
    </div>
  );
}
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import type { OrderDTO, Paginated } from '@delivery/shared';
import { ORDER_STATUS_LABELS, formatMoney, formatRelativeTime } from '@delivery/shared';
import { api, qs } from '../../lib/api';
import { Button, Card, EmptyState, Spinner, StatusPill } from '../../components/ui';

export function Orders() {
  const history = useQuery({
    queryKey: ['orders'],
    queryFn: () => api.get<Paginated<OrderDTO>>('/orders?pageSize=20'),
  });
  const active = useQuery({
    queryKey: ['active-orders'],
    queryFn: () => api.get<{ orders: OrderDTO[] }>('/orders/active'),
    refetchInterval: 15_000,
  });

  if (history.isLoading) {
    return (
      <div className="flex justify-center py-16">
        <Spinner className="h-8 w-8" />
      </div>
    );
  }

  const activeOrders = active.data?.orders ?? [];
  const past = history.data?.items ?? [];

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-2xl font-extrabold text-slate-900 lg:text-3xl">My orders</h1>
        <p className="mt-1 text-sm text-slate-500">Track active deliveries and view history.</p>
      </header>
        <section className="space-y-3">
                  <h2 className="text-base font-bold uppercase tracking-wide text-red-600">Live now</h2>
          {activeOrders.map((order) => (
            <Link key={order.id} to={`/app/orders/${order.id}`} className="block">
              <Card className="border-red-200 transition hover:border-red-600/50">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-extrabold text-slate-900">{order.orderNumber}</p>
                    <p className="text-sm text-slate-500">{order.itemCount} items · {formatRelativeTime(order.createdAt)}</p>
                  </div>
                  <div className="text-right">
                    <StatusPill status={order.status} label={ORDER_STATUS_LABELS[order.status]} />
                    <p className="mt-1 text-sm font-bold text-red-600">{formatMoney(order.total)}</p>
                  </div>
                </div>
              </Card>
            </Link>
          ))}
        </section>

      <section className="space-y-3">
                <h2 className="text-base font-bold uppercase tracking-wide text-slate-500">Order history</h2>
        {past.length === 0 ? (
          <EmptyState title="No orders yet" hint="Your completed orders and receipts will appear here.">
            <Link to="/app/menu" className="mt-3">
              <Button>Start an order</Button>
            </Link>
          </EmptyState>
        ) : (
          past.map((order) => (
            <Link key={order.id} to={`/app/orders/${order.id}`} className="block">
              <Card className="transition hover:border-slate-300">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-extrabold text-slate-900">{order.orderNumber}</p>
                    <p className="truncate text-sm text-slate-500">
                      {order.items.map((item) => `${item.quantity}× ${item.name}`).join(', ')}
                    </p>
                    <p className="mt-1 text-sm text-slate-500">{formatRelativeTime(order.createdAt)}</p>
                  </div>
                  <div className="shrink-0 text-right">
                    <StatusPill status={order.status} label={ORDER_STATUS_LABELS[order.status]} />
                    <p className="mt-1 text-sm font-bold text-slate-800">{formatMoney(order.total)}</p>
                  </div>
                </div>
              </Card>
            </Link>
          ))
        )}
      </section>
    </div>
  );
}

import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { OrderDTO, OrderStatus, Paginated } from '@delivery/shared';
import { ORDER_STATUS_LABELS, ORDER_STATUS_VALUES, formatMoney, formatRelativeTime } from '@delivery/shared';
import { api } from '../../lib/api';
import { useRealtimeSync } from '../../lib/realtime';
import { Button, Card, EmptyState, Field, Input, Modal, Select, Spinner, StatusPill, Textarea } from '../../components/ui';
import { toast } from '../../lib/realtime';
import { MapPinIcon, TruckIcon } from '../../components/icons';

const FILTERS: Array<'ALL' | OrderStatus> = ['ALL', ...ORDER_STATUS_VALUES];

export function AdminOrders() {
  useRealtimeSync();
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<'ALL' | OrderStatus>('ALL');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [detail, setDetail] = useState<OrderDTO | null>(null);

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['admin-orders', status, search, page],
    queryFn: () => {
      const params = new URLSearchParams({ page: String(page), pageSize: '20' });
      if (status !== 'ALL') params.set('status', status);
      if (search.trim()) params.set('q', search.trim());
      return api.get<Paginated<OrderDTO>>(`/orders?${params.toString()}`);
    },
    refetchInterval: 15_000,
  });

  const orders = data?.items ?? [];

  const applyStatus = async (order: OrderDTO, next: OrderStatus, note?: string) => {
    try {
      if (next === 'CANCELLED') {
        await api.post(`/orders/${order.id}/cancel`, note ? { reason: note } : {});
      } else {
        await api.post(`/kitchen/orders/${order.id}/status`, { status: next, note });
      }
      void queryClient.invalidateQueries({ queryKey: ['admin-orders'] });
      toast(`Order ${order.orderNumber} → ${ORDER_STATUS_LABELS[next]}`, 'success');
      setDetail(null);
    } catch (error: any) {
      toast(error?.message ?? 'Failed to update the order', 'error');
    }
  };

  return (
    <div className="space-y-4">
                  <h1 className="text-2xl font-extrabold text-slate-900 lg:text-3xl">Orders</h1>
      <p className="mt-1 text-sm text-slate-500">Manage incoming and past orders.</p>

      <div className="flex flex-wrap gap-2">
        <Input
          value={search}
          onChange={(event) => {
            setSearch(event.target.value);
            setPage(1);
          }}
          placeholder="Search order #, customer or phone…"
          className="max-w-xs"
          aria-label="Search orders"
        />
      </div>

      <div className="flex flex-wrap gap-2">
        {FILTERS.map((filter) => (
          <button
            key={filter}
            onClick={() => {
              setStatus(filter);
              setPage(1);
            }}
            className={
              status === filter
                ? 'rounded-full bg-red-600 px-3 py-1.5 text-sm font-bold text-white'
                : 'rounded-full bg-slate-100 px-3 py-1.5 text-sm font-semibold text-slate-700 hover:bg-slate-200'
            }
          >
            {filter === 'ALL' ? 'All' : ORDER_STATUS_LABELS[filter]}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12">
          <Spinner className="h-8 w-8" />
        </div>
      ) : isError ? (
        <EmptyState title="Something went wrong" hint={error instanceof Error ? error.message : 'Could not load orders.'} />
      ) : orders.length === 0 ? (
        <EmptyState title="No orders found" hint="Try a different filter or clear the search." />
      ) : (
        <div className="space-y-2">
          {orders.map((order) => (
            <Card key={order.id} className="!p-4">
              <button className="flex w-full items-center justify-between gap-3 text-left" onClick={() => setDetail(order)}>
                                <div className="min-w-0">
                  <p className="font-mono text-base font-bold text-slate-900">{order.orderNumber}</p>
                  <p className="truncate text-sm text-slate-500">
                    {order.customerName} · {order.itemCount} item(s) · {formatRelativeTime(order.createdAt)}
                  </p>
                </div>
                <div className="flex flex-none items-center gap-3">
                  <span className="text-base font-bold text-slate-900">{formatMoney(order.total)}</span>
                  {order.driverName ? (
                    <span className="flex items-center gap-1 rounded-full bg-red-50 px-2 py-1 text-sm font-bold text-red-600">
                      <TruckIcon className="h-3.5 w-3.5" aria-hidden="true" />
                      {order.driverName}
                    </span>
                  ) : null}
                  <StatusPill status={order.status} label={ORDER_STATUS_LABELS[order.status]} />
                </div>
              </button>
            </Card>
          ))}
        </div>
      )}

      {data && data.pageCount > 1 && (
        <div className="flex items-center justify-center gap-3">
          <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage((current) => current - 1)}>
            ← Prev
          </Button>
          <span className="text-sm text-slate-500">
            Page {data.page} of {data.pageCount}
          </span>
          <Button size="sm" variant="outline" disabled={!data.hasMore} onClick={() => setPage((current) => current + 1)}>
            Next →
          </Button>
        </div>
      )}

      {detail && <OrderDialog order={detail} onClose={() => setDetail(null)} onApply={applyStatus} />}
    </div>
  );
}

function OrderDialog({
  order,
  onClose,
  onApply,
}: {
  order: OrderDTO;
  onClose: () => void;
  onApply: (order: OrderDTO, status: OrderStatus, note?: string) => Promise<void>;
}) {
  const queryClient = useQueryClient();
  const [nextStatus, setNextStatus] = useState<OrderStatus>(order.status);
  const [note, setNote] = useState('');
  const [working, setWorking] = useState(false);
  const [driverId, setDriverId] = useState<string>(order.driverId ?? '');
  const [driverWorking, setDriverWorking] = useState(false);

  const dispatchable = !['RECEIVED', 'DELIVERED', 'CANCELLED'].includes(order.status);

  const { data: drivers, isLoading: driversLoading } = useQuery({
    queryKey: ['admin-users', 'drivers'],
    queryFn: () =>
      api.get<Paginated<{ id: string; name: string; isActive: boolean }>>('/users?role=DRIVER&pageSize=100'),
    enabled: dispatchable,
  });
  const activeDrivers = (drivers?.items ?? []).filter((driver) => driver.isActive);

  const submit = async () => {
    setWorking(true);
    await onApply(order, nextStatus, note.trim() || undefined);
    setWorking(false);
  };

  const submitDriver = async () => {
    setDriverWorking(true);
    try {
      await api.post(`/orders/${order.id}/assign-driver`, { driverId: driverId || null });
      toast(driverId ? 'Driver assigned and notified.' : 'Driver removed from this order.', 'success');
      void queryClient.invalidateQueries({ queryKey: ['admin-orders'] });
      void queryClient.invalidateQueries({ queryKey: ['driver-deliveries'] });
      onClose();
    } catch (error: any) {
      toast(error?.message ?? 'Could not assign the driver', 'error');
    } finally {
      setDriverWorking(false);
    }
  };

  return (
    <Modal open title={`Order ${order.orderNumber}`} onClose={onClose} wide>
      <div className="space-y-4 text-sm text-slate-700">
        <div className="rounded-2xl border border-slate-200 bg-slate-100 p-4">
          <p className="font-semibold text-slate-900">{order.customerName}</p>
          <p className="text-sm text-slate-600">{order.customerEmail}</p>
          <p className="text-sm text-slate-600">{order.deliveryPhone}</p>
          <p className="mt-2 flex items-center gap-1 text-sm text-slate-600">
            <MapPinIcon className="h-3.5 w-3.5 flex-none text-slate-400" aria-hidden="true" />
            <span className="truncate">{order.deliveryAddress}</span>
          </p>
          {order.notes && <p className="mt-1 text-xs text-red-700">Note: {order.notes}</p>}
        </div>

        <div className="space-y-1.5">
          {order.items.map((item) => (
            <div key={item.id} className="flex items-center justify-between gap-3">
              <span className="min-w-0 truncate">
                {item.quantity}× {item.name}
              </span>
              <span className="flex-none font-semibold text-slate-800">{formatMoney(item.lineTotal)}</span>
            </div>
          ))}
        </div>

        <div className="space-y-1 border-t border-slate-200 pt-3 text-xs">
          <Row label="Subtotal" value={formatMoney(order.subtotal)} />
          <Row label="Delivery" value={formatMoney(order.deliveryFee)} />
          <Row label="Tax" value={formatMoney(order.tax)} />
          <Row label="Total" value={formatMoney(order.total)} bold />
          <Row label="Payment" value={order.paymentMethod.replace('_', ' ')} />
        </div>

        {dispatchable && (
          <div className="rounded-2xl border border-red-600/20 bg-red-600/5 p-3">
            <Field
              label="Driver dispatch"
              hint="The driver is notified in real time and sees the delivery in their app."
            >
              <div className="flex gap-2">
                <Select value={driverId} onChange={(event) => setDriverId(event.target.value)}>
                  <option value="">— Pickup pool (any driver can accept) —</option>
                  {activeDrivers.map((driver) => (
                    <option key={driver.id} value={driver.id}>
                      {driver.name}
                    </option>
                  ))}
                </Select>
                <Button
                  size="sm"
                  loading={driverWorking}
                  disabled={driversLoading || (order.driverId ?? '') === driverId}
                  onClick={() => void submitDriver()}
                >
                  Dispatch
                </Button>
              </div>
            </Field>
          </div>
        )}

        {order.timeline.length > 0 && (
          <div className="space-y-1">
            <p className="text-sm font-bold uppercase tracking-wide text-slate-500">Timeline</p>
            {order.timeline.map((event) => (
              <p key={event.id} className="text-sm text-slate-600">
                {ORDER_STATUS_LABELS[event.status] ?? event.status} · {event.changedByName ?? 'System'} ·{' '}
                {formatRelativeTime(event.createdAt)}
                {event.note ? ` — ${event.note}` : ''}
              </p>
            ))}
          </div>
        )}

        <Field label="Override status" hint="Admin can force any status; the customer is notified in real time.">
          <Select value={nextStatus} onChange={(event) => setNextStatus(event.target.value as OrderStatus)}>
            {ORDER_STATUS_VALUES.map((value) => (
              <option key={value} value={value}>
                {ORDER_STATUS_LABELS[value]}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Note (optional)">
          <Textarea value={note} onChange={(event) => setNote(event.target.value)} rows={2} placeholder="Reason or internal note…" />
        </Field>
      </div>

      <div className="mt-5 flex justify-end gap-2">
        <Button variant="ghost" onClick={onClose} disabled={working || driverWorking}>
          Close
        </Button>
        <Button loading={working} disabled={nextStatus === order.status} onClick={() => void submit()}>
          Apply status
        </Button>
      </div>
    </Modal>
  );
}

function Row({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-slate-500">{label}</span>
      <span className={bold ? 'font-extrabold text-slate-900' : 'text-slate-700'}>{value}</span>
    </div>
  );
}

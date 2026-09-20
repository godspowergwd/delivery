import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { OrderDTO } from '@delivery/shared';
import { ORDER_STATUS_LABELS, formatMoney, formatRelativeTime } from '@delivery/shared';
import { fetchDriverDeliveries, postDriverAction } from '../../lib/driver-api';
import { useRealtimeSync, toast } from '../../lib/realtime';
import { MapPinIcon } from '../../components/icons';
import { Button, Card, EmptyState, Modal, Spinner, StatusPill, Textarea } from '../../components/ui';

type Tab = 'mine' | 'available' | 'history';

const TAB_PATHS: Record<Tab, string> = {
  mine: '/driver/deliveries?status=ACCEPTED,PREPARING,READY,OUT_FOR_DELIVERY',
  available: '/driver/available',
  history: '/driver/deliveries?status=DELIVERED',
};

const EMPTY_HINTS: Record<Tab, string> = {
  mine: 'Accept a delivery from the Available tab and it will appear here.',
  available: 'Orders appear here the moment the kitchen marks them ready for pickup.',
  history: 'Deliveries you complete will be listed here.',
};

const EMPTY_TITLES: Record<Tab, string> = {
  mine: 'No active deliveries',
  available: 'Nothing to pick up right now',
  history: 'No completed deliveries yet',
};

export default function DriverDeliveries() {
  useRealtimeSync();
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<Tab>('mine');
  const [issueOrder, setIssueOrder] = useState<OrderDTO | null>(null);

  const { data: orders = [], isLoading, isError, error } = useQuery({
    queryKey: ['driver-deliveries', tab],
    queryFn: () => fetchDriverDeliveries(TAB_PATHS[tab]),
    refetchInterval: 15_000,
  });

  const action = useMutation({
    mutationFn: ({ id, verb }: { id: string; verb: 'accept' | 'pickup' | 'complete' }) =>
      postDriverAction(`/driver/deliveries/${id}/${verb}`),
    onSuccess: (order) => {
      void queryClient.invalidateQueries({ queryKey: ['driver-deliveries'] });
      void queryClient.invalidateQueries({ queryKey: ['driver-summary'] });
      toast(`Order ${order.orderNumber} → ${ORDER_STATUS_LABELS[order.status]}`, 'success');
    },
    onError: (err: Error) => toast(err.message, 'error'),
  });

  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-2xl font-extrabold text-slate-900">Deliveries</h1>
        <p className="text-sm text-slate-500">Touch-first workflow: accept, pick up, deliver.</p>
      </header>

      <div className="flex flex-wrap gap-2" role="tablist">
        {(['mine', 'available', 'history'] as Tab[]).map((t) => (
          <button
            key={t}
            role="tab"
            aria-selected={tab === t}
            onClick={() => setTab(t)}
            className={
              tab === t
                ? 'rounded-full bg-red-600 px-4 py-2 text-sm font-bold text-white'
                : 'rounded-full bg-slate-100 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-200'
            }
          >
            {t === 'mine' ? 'My deliveries' : t === 'available' ? 'Available' : 'History'}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12">
          <Spinner className="h-8 w-8" />
        </div>
      ) : isError ? (
        <EmptyState
          title="Something went wrong"
          hint={error instanceof Error ? error.message : 'Could not load deliveries.'}
        />
      ) : orders.length === 0 ? (
        <EmptyState title={EMPTY_TITLES[tab]} hint={EMPTY_HINTS[tab]} />
      ) : (
        <div className="space-y-2">
          {orders.map((order) => (
            <Card key={order.id} className="!p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-mono text-sm text-slate-800">{order.orderNumber}</p>
                  <p className="truncate text-sm text-slate-600">{order.customerName}</p>
                  <p className="mt-1 flex items-center gap-2 text-sm text-slate-500">
                    <MapPinIcon className="h-3.5 w-3.5 flex-none text-slate-400" aria-hidden="true" />
                    <span className="truncate">{order.deliveryAddress}</span>
                  </p>
                  {order.notes ? <p className="mt-1 truncate text-xs text-red-700">Note: {order.notes}</p> : null}
                  <p className="mt-1 text-sm text-slate-500">
                    {order.itemCount} item(s) · {formatMoney(order.total)} · {order.paymentMethod.replace('_', ' ')} ·{' '}
                    {formatRelativeTime(order.createdAt)}
                  </p>
                </div>
                <StatusPill status={order.status} label={ORDER_STATUS_LABELS[order.status]} />
              </div>

              <div className="mt-3 flex flex-wrap gap-2">
                {tab === 'available' && (
                  <Button
                    size="sm"
                    loading={action.isPending && action.variables?.id === order.id}
                    onClick={() => action.mutate({ id: order.id, verb: 'accept' })}
                  >
                    Accept delivery
                  </Button>
                )}
                {tab === 'mine' && order.status === 'READY' && (
                  <Button
                    size="sm"
                    loading={action.isPending && action.variables?.id === order.id}
                    onClick={() => action.mutate({ id: order.id, verb: 'pickup' })}
                  >
                    Start delivery
                  </Button>
                )}
                {tab === 'mine' && order.status === 'OUT_FOR_DELIVERY' && (
                  <Button
                    size="sm"
                    loading={action.isPending && action.variables?.id === order.id}
                    onClick={() => action.mutate({ id: order.id, verb: 'complete' })}
                  >
                    Mark delivered
                  </Button>
                )}
                {tab === 'mine' && (
                  <a
                    href={`tel:${order.deliveryPhone}`}
                    className="rounded-2xl bg-slate-100 px-4 py-2 text-sm font-semibold text-slate-800 hover:bg-slate-200"
                  >
                    Call customer
                  </a>
                )}
                {tab === 'mine' && (
                  <Button size="sm" variant="ghost" onClick={() => setIssueOrder(order)}>
                    Report issue
                  </Button>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}

      {issueOrder && <IssueDialog order={issueOrder} onClose={() => setIssueOrder(null)} />}
    </div>
  );
}

function IssueDialog({ order, onClose }: { order: OrderDTO; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [note, setNote] = useState('');
  const [working, setWorking] = useState(false);

  const submit = async () => {
    setWorking(true);
    try {
      await postDriverAction(`/driver/deliveries/${order.id}/issue`, { note: note.trim() });
      toast('The issue was reported to the administrators.', 'success');
      void queryClient.invalidateQueries({ queryKey: ['driver-deliveries'] });
      onClose();
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Could not report the issue.', 'error');
    } finally {
      setWorking(false);
    }
  };

  return (
    <Modal open title={`Report issue · ${order.orderNumber}`} onClose={onClose}>
      <p className="text-sm text-slate-700">Describe what happened so the administrators can help.</p>
      <Textarea
        value={note}
        onChange={(event) => setNote(event.target.value)}
        rows={4}
        placeholder="e.g. Customer is not answering the phone at the gate…"
        className="mt-3"
      />
      <div className="mt-4 flex justify-end gap-2">
        <Button variant="ghost" onClick={onClose} disabled={working}>
          Cancel
        </Button>
        <Button loading={working} disabled={note.trim().length < 5} onClick={() => void submit()}>
          Send report
        </Button>
      </div>
    </Modal>
  );
}

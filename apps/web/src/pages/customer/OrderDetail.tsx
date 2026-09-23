import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { OrderDTO, ReceiptDTO, ProductDTO } from '@delivery/shared';
import {
  ORDER_STATUS_FLOW,
  ORDER_STATUS_LABELS,
  formatDateTime,
  formatMoney,
  orderStatusIndex,
} from '@delivery/shared';
import { api } from '../../lib/api';
import { useCart } from '../../lib/cart';
import { toast } from '../../lib/realtime';
import { ArrowLeftIcon, CheckIcon } from '../../components/icons';
import { Button, Card, Modal, Spinner, StatusPill } from '../../components/ui';
import { OrderTracking } from '../../components/OrderTracking';

export function OrderDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { add } = useCart();
  const [showReceipt, setShowReceipt] = useState(false);

  const order = useQuery({
    queryKey: ['order', id],
    queryFn: () => api.get<{ order: OrderDTO }>(`/orders/${id}`),
    enabled: Boolean(id),
    // Live tracking: gentle polling keeps the timeline fresh even without a socket.
    refetchInterval: (query) => {
      const status = query.state.data?.order.status;
      return status && !['DELIVERED', 'CANCELLED'].includes(status) ? 10_000 : false;
    },
  });

  const receipt = useQuery({
    queryKey: ['receipt', id],
    queryFn: () =>
      api.get<{ receipt: ReceiptDTO; receiptNumber: string; downloadUrl: string; printUrl: string }>(`/receipts/order/${id}`),
    enabled: showReceipt,
  });

  const cancel = useMutation({
    mutationFn: () => api.post<{ order: OrderDTO }>(`/orders/${id}/cancel`, {}),
    onSuccess: () => {
      toast('Order cancelled', 'info');
      void queryClient.invalidateQueries({ queryKey: ['order', id] });
      void queryClient.invalidateQueries({ queryKey: ['orders'] });
    },
    onError: (error) => toast(error instanceof Error ? error.message : 'Could not cancel', 'error'),
  });

  const reorder = useMutation({
    mutationFn: () =>
      api.post<{ lines: Array<{ productId: string; name: string; price: number; imageUrl: string | null; quantity: number }> }>(
        `/orders/${id}/reorder`,
      ),
    onSuccess: (data) => {
      for (const line of data.lines) {
        const product: ProductDTO = {
          id: line.productId,
          name: line.name,
          description: '',
          imageUrl: line.imageUrl,
          price: line.price,
          ingredients: [],
          prepTimeMinutes: 0,
          isAvailable: true,
          stock: 999,
          isArchived: false,
          isPopular: false,
          isNew: false,
          categoryId: '',
          categoryName: '',
          categorySlug: '',
          createdAt: '',
          updatedAt: '',
        };
        add(product, line.quantity);
      }
      toast('Items added back to your cart', 'success');
      navigate('/app/cart');
    },
    onError: (error) => toast(error instanceof Error ? error.message : 'Could not reorder', 'error'),
  });

  if (order.isLoading) {
    return (
      <div className="flex justify-center py-16">
        <Spinner className="h-8 w-8" />
      </div>
    );
  }
  const data = order.data?.order;
  if (!data) {
    return (
      <Card>
        <p className="text-center text-sm text-slate-600">Order not found.</p>
        <div className="mt-4 flex justify-center">
          <Link to="/app/orders" className="text-sm font-semibold text-green-700 hover:underline">
            Back to orders
          </Link>
        </div>
      </Card>
    );
  }

  const cancellable = ['RECEIVED', 'ACCEPTED'].includes(data.status);
  const currentStep = orderStatusIndex(data.status);

  return (
    <OrderDetailBody
      data={data}
      currentStep={currentStep}
      cancellable={cancellable}
      showReceipt={showReceipt}
      setShowReceipt={setShowReceipt}
      receipt={receipt}
      onCancel={() => cancel.mutate()}
      cancelBusy={cancel.isPending}
      onReorder={() => reorder.mutate()}
      reorderBusy={reorder.isPending}
    />
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between text-slate-600">
      <span>{label}</span>
      <span className="font-semibold text-slate-800">{value}</span>
    </div>
  );
}

function OrderDetailBody({
  data,
  currentStep,
  cancellable,
  showReceipt,
  setShowReceipt,
  receipt,
  onCancel,
  cancelBusy,
  onReorder,
  reorderBusy,
}: {
  data: OrderDTO;
  currentStep: number;
  cancellable: boolean;
  showReceipt: boolean;
  setShowReceipt: (value: boolean) => void;
  receipt: {
    isLoading: boolean;
    data?: { receipt: ReceiptDTO; receiptNumber: string; downloadUrl: string; printUrl: string };
  };
  onCancel: () => void;
  cancelBusy: boolean;
  onReorder: () => void;
  reorderBusy: boolean;
}) {
  return (
    <div className="space-y-4">
      <button onClick={() => window.history.back()} className="flex items-center gap-2 text-sm font-semibold text-slate-600 hover:text-slate-900">
        <ArrowLeftIcon className="h-5 w-5" aria-hidden="true" />
        Orders
      </button>

      <Card>
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-lg font-extrabold text-slate-900">{data.orderNumber}</p>
            <p className="text-sm text-slate-500">Placed {formatDateTime(data.createdAt)}</p>
          </div>
          <StatusPill status={data.status} label={ORDER_STATUS_LABELS[data.status]} />
        </div>

        {data.status !== 'CANCELLED' && (
          <ol className="mt-5">
            {ORDER_STATUS_FLOW.map((status, index) => {
              const done = index <= currentStep;
              const isCurrent = index === currentStep;
              return (
                <li key={status} className="relative flex gap-3 pb-5 last:pb-0">
                  {index < ORDER_STATUS_FLOW.length - 1 && (
                    <span className={`absolute left-[11px] top-6 h-full w-0.5 ${index < currentStep ? 'bg-green-600/60' : 'bg-slate-200'}`} />
                  )}
                  <span
                    className={`relative z-10 mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-extrabold ${
                      done ? 'bg-green-600 text-white' : 'border border-slate-300 bg-white text-slate-500'
                    } ${isCurrent ? 'pulse-ring' : ''}`}
                  >
                    {done ? <CheckIcon className="h-3.5 w-3.5" /> : index + 1}
                  </span>
                  <div>
                    <p className={`text-sm font-bold ${done ? 'text-slate-900' : 'text-slate-500'}`}>{ORDER_STATUS_LABELS[status]}</p>
                    {isCurrent && data.estimatedReadyAt && (
                      <p className="text-xs font-semibold text-green-700">Estimated ready {formatDateTime(data.estimatedReadyAt)}</p>
                    )}
                  </div>
                </li>
              );
            })}
          </ol>
        )}

        {data.cancelReason && (
          <p className="mt-3 rounded-2xl border border-red-200 bg-red-50 px-4 py-2.5 text-sm text-red-700">
            Cancelled: {data.cancelReason}
          </p>
        )}
      </Card>

      <OrderTracking order={data} />

      <Card className="space-y-3">
        <p className="text-sm font-bold text-slate-800">Items</p>
        {data.items.map((item) => (
          <div key={item.id} className="flex items-center justify-between gap-3 text-sm">
            <span className="text-slate-700">
              {item.quantity}× {item.name}
            </span>
            <span className="font-semibold text-slate-800">{formatMoney(item.lineTotal)}</span>
          </div>
        ))}
        <div className="border-t border-slate-200 pt-3">
          <Row label="Subtotal" value={formatMoney(data.subtotal)} />
          <Row label="Delivery" value={formatMoney(data.deliveryFee)} />
          <Row label="Tax" value={formatMoney(data.tax)} />
          <div className="mt-2 flex items-center justify-between">
            <span className="font-bold text-slate-800">Total ({data.paymentMethod.replace('_', ' ').toLowerCase()})</span>
            <span className="text-lg font-extrabold text-red-600">{formatMoney(data.total)}</span>
          </div>
        </div>
        <p className="text-sm text-slate-500">Deliver to: {data.deliveryAddress}</p>
      </Card>

      <div className="grid grid-cols-2 gap-3">
        <Button variant="outline" onClick={() => setShowReceipt(true)}>
          View receipt
        </Button>
        <Button loading={reorderBusy} onClick={onReorder}>
          Order again
        </Button>
      </div>
      {cancellable && (
        <Button variant="danger" className="w-full" loading={cancelBusy} onClick={onCancel}>
          Cancel this order
        </Button>
      )}

      <Modal open={showReceipt} onClose={() => setShowReceipt(false)} title={receipt.data?.receiptNumber ?? 'Receipt'} wide>
        {receipt.isLoading ? (
          <div className="flex justify-center py-8">
            <Spinner />
          </div>
        ) : receipt.data ? (
          <ReceiptView receipt={receipt.data.receipt} downloadUrl={receipt.data.downloadUrl} printUrl={receipt.data.printUrl} />
        ) : (
          <p className="text-sm text-slate-500">Generating your receipt…</p>
        )}
      </Modal>
    </div>
  );
}

function ReceiptView({ receipt, downloadUrl, printUrl }: { receipt: ReceiptDTO; downloadUrl: string; printUrl: string }) {
  const open = (path: string) => {
    const base = (import.meta.env.VITE_API_URL ?? 'http://localhost:4000/api').replace(/\/+$/, '');
    window.open(`${base}${path}`, '_blank', 'noopener');
  };

  return (
    <div className="space-y-4 text-sm">
      <div className="text-center">
        <p className="text-base font-extrabold text-slate-900">{receipt.businessName}</p>
        <p className="text-sm text-slate-500">{receipt.businessAddress}</p>
        <p className="text-sm text-slate-500">{receipt.businessPhone}</p>
      </div>
      <div className="space-y-1.5 rounded-2xl bg-slate-100 p-4">
        <Row label="Receipt" value={receipt.receiptNumber} />
        <Row label="Order" value={receipt.orderNumber} />
        <Row label="Issued" value={formatDateTime(receipt.issuedAt)} />
        <Row label="Customer" value={receipt.customerName} />
        <Row label="Payment" value={`${receipt.paymentMethod} · ${receipt.paymentStatus}`} />
      </div>
      <div className="space-y-1.5">
        {receipt.items.map((item) => (
          <div key={item.id} className="flex justify-between">
            <span className="text-slate-700">
              {item.quantity}× {item.name}
            </span>
            <span className="text-slate-800">{formatMoney(item.lineTotal, receipt.currencySymbol)}</span>
          </div>
        ))}
        <div className="border-t border-slate-200 pt-2">
          <Row label="Subtotal" value={formatMoney(receipt.subtotal, receipt.currencySymbol)} />
          <Row label="Delivery" value={formatMoney(receipt.deliveryFee, receipt.currencySymbol)} />
          <Row label="Tax" value={formatMoney(receipt.tax, receipt.currencySymbol)} />
          <div className="mt-1 flex justify-between font-extrabold text-red-600">
            <span>Total</span>
            <span>{formatMoney(receipt.total, receipt.currencySymbol)}</span>
          </div>
        </div>
      </div>
      {receipt.qrDataUrl && (
        <div className="flex flex-col items-center gap-1">
          <img src={receipt.qrDataUrl} alt="Receipt verification QR code" className="h-32 w-32 rounded-xl bg-white p-1" />
          <p className="text-sm text-slate-500">Scan to verify this receipt</p>
        </div>
      )}
      <div className="grid grid-cols-2 gap-3">
        <Button variant="outline" onClick={() => open(printUrl)}>
          Print
        </Button>
        <Button onClick={() => open(downloadUrl)}>Download PDF</Button>
      </div>
    </div>
  );
}

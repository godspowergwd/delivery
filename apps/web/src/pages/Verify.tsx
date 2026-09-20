import { Link, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ORDER_STATUS_LABELS, formatMoney } from '@delivery/shared';
import type { ReceiptDTO } from '@delivery/shared';
import { api } from '../lib/api';
import { Button, Card, Spinner, StatusPill } from '../components/ui';

interface VerifyResponse {
  valid: true;
  receiptNumber: string;
  issuedAt: string;
  order: {
    orderNumber: string;
    status: string;
    total: number;
    paymentMethod: string;
    paymentStatus: string;
    placedAt: string;
    deliveredAt: string | null;
    customerName: string;
  };
}

/** Public QR verification screen: /verify/:code */
export function Verify() {
  const { code } = useParams<{ code: string }>();
  const { data, isLoading, error } = useQuery({
    queryKey: ['verify', code],
    queryFn: () => api.get<VerifyResponse>(`/receipts/verify/${code}`),
    enabled: Boolean(code),
    retry: false,
  });

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center px-5">
      <div className="mb-6 flex flex-col items-center gap-2 text-center">
        <img src={`${import.meta.env.BASE_URL}logo.svg`} alt="" className="h-16 w-16 rounded-2xl" />
        <h1 className="text-2xl font-extrabold text-slate-900">Receipt verification</h1>
      </div>

      {isLoading && (
        <div className="flex justify-center py-10">
          <Spinner className="h-8 w-8" />
        </div>
      )}

      {error && (
        <Card>
          <p className="text-center text-base font-semibold text-red-700">Invalid receipt code</p>
          <p className="mt-2 text-center text-sm text-slate-500">
            This receipt could not be verified. Check the code printed under the QR code, or contact support.
          </p>
        </Card>
      )}

      {data && (
        <Card className="border-red-200">
          <div className="flex items-center justify-between">
            <p className="text-sm font-bold uppercase tracking-wide text-red-700">Genuine receipt</p>
            <StatusPill status={data.order.status as ReceiptDTO['status']} label={ORDER_STATUS_LABELS[data.order.status as ReceiptDTO['status']]} />
          </div>
          <dl className="mt-4 space-y-2 text-sm">
            <Row label="Receipt" value={data.receiptNumber} />
            <Row label="Order" value={data.order.orderNumber} />
            <Row label="Customer" value={data.order.customerName} />
            <Row label="Placed" value={new Date(data.order.placedAt).toLocaleString()} />
            {data.order.deliveredAt && <Row label="Delivered" value={new Date(data.order.deliveredAt).toLocaleString()} />}
            <Row label="Payment" value={`${data.order.paymentMethod} · ${data.order.paymentStatus}`} />
            <Row label="Total" value={formatMoney(data.order.total, 'GH₵')} strong />
          </dl>
        </Card>
      )}

      <Link to="/login" className="mt-6 text-center text-sm font-semibold text-red-600 hover:underline">
        Open the app
      </Link>
    </div>
  );
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-slate-100 pb-2 last:border-0">
      <dt className="text-slate-500">{label}</dt>
      <dd className={strong ? 'font-extrabold text-red-600' : 'font-medium text-slate-800'}>{value}</dd>
    </div>
  );
}

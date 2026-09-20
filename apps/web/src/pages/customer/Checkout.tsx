import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { AddressDTO, OrderDTO, SettingsDTO } from '@delivery/shared';
import { PAYMENT_METHOD_LABELS, computeTotals, formatMoney } from '@delivery/shared';
import { api } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { useCart } from '../../lib/cart';
import { toast } from '../../lib/realtime';
import { Button, Card, ErrorText, Field, Input, Textarea } from '../../components/ui';

export function Checkout() {
  const { lines, itemCount, subtotal, clear } = useCart();
  const { user } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [form, setForm] = useState({ deliveryAddress: '', deliveryPhone: '', notes: '', paymentMethod: 'CASH' as 'CASH' | 'MOBILE_MONEY' });

  const { data: settingsData } = useQuery({
    queryKey: ['settings'],
    queryFn: () => api.get<{ settings: SettingsDTO }>('/settings'),
    staleTime: 60_000,
  });
  const settings = settingsData?.settings;

  const { data: addressData } = useQuery({
    queryKey: ['addresses'],
    queryFn: () => api.get<{ addresses: AddressDTO[] }>('/addresses'),
  });

  // Pre-fill from the saved default address and profile phone once loaded.
  useEffect(() => {
    const saved = addressData?.addresses.find((address) => address.isDefault) ?? addressData?.addresses[0];
    const phone = user?.phone ?? '';
    setForm((current) => ({
      ...current,
      deliveryAddress: current.deliveryAddress || (saved ? [saved.line1, saved.area, saved.city].filter(Boolean).join(', ') : ''),
      deliveryPhone: current.deliveryPhone || phone,
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [addressData, user?.phone]);

  const totals = computeTotals({
    items: lines.map((line) => ({ unitPrice: line.unitPrice, quantity: line.quantity })),
    deliveryFee: settings?.deliveryFee ?? 0,
    taxRate: settings?.taxRate ?? 0,
  });

  const placeOrder = useMutation({
    mutationFn: () =>
      api.post<{ order: OrderDTO }>('/orders', {
        items: lines.map((line) => ({ productId: line.productId, quantity: line.quantity, notes: line.notes || undefined })),
        deliveryAddress: form.deliveryAddress,
        deliveryPhone: form.deliveryPhone,
        notes: form.notes || undefined,
        paymentMethod: form.paymentMethod,
      }),
    onSuccess: (data) => {
      clear();
      void queryClient.invalidateQueries({ queryKey: ['orders'] });
      void queryClient.invalidateQueries({ queryKey: ['active-orders'] });
      toast(`Order ${data.order.orderNumber} sent to the kitchen!`, 'success');
      navigate(`/app/orders/${data.order.id}`, { replace: true });
    },
    onError: (error) => toast(error instanceof Error ? error.message : 'Could not place the order', 'error'),
  });

  if (lines.length === 0) {
    return (
      <Card>
        <p className="text-center text-sm text-slate-600">Your cart is empty — add items before checking out.</p>
        <div className="mt-4 flex justify-center">
          <Button onClick={() => navigate('/app/menu')}>Open the menu</Button>
        </div>
      </Card>
    );
  }

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!settings?.acceptingOrders) {
      toast('The kitchen is not accepting orders right now.', 'warning');
      return;
    }
    placeOrder.mutate();
  };

  return (
    <CheckoutForm
      form={form}
      setForm={setForm}
      totals={totals}
      itemCount={itemCount}
      subtotal={subtotal}
      accepting={settings?.acceptingOrders ?? true}
      busy={placeOrder.isPending}
      onSubmit={submit}
    />
  );
}

interface FormState {
  deliveryAddress: string;
  deliveryPhone: string;
  notes: string;
  paymentMethod: 'CASH' | 'MOBILE_MONEY';
}

function CheckoutForm({
  form,
  setForm,
  totals,
  itemCount,
  subtotal,
  accepting,
  busy,
  onSubmit,
}: {
  form: FormState;
  setForm: (updater: (current: FormState) => FormState) => void;
  totals: ReturnType<typeof computeTotals>;
  itemCount: number;
  subtotal: number;
  accepting: boolean;
  busy: boolean;
  onSubmit: (event: FormEvent) => void;
}) {
  return (
    <form onSubmit={onSubmit} className="space-y-5">
      <header>
        <h1 className="text-2xl font-extrabold text-slate-900 lg:text-3xl">Checkout</h1>
        <p className="mt-1 text-sm text-slate-500">Complete your delivery details.</p>
      </header>

      <Card className="space-y-4">
        <Field label="Delivery address">
          <Input
            required
            minLength={6}
            value={form.deliveryAddress}
            onChange={(event) => setForm((current) => ({ ...current, deliveryAddress: event.target.value }))}
            placeholder="Street, area, city"
          />
        </Field>
        <Field label="Contact phone">
          <Input
            required
            inputMode="tel"
            value={form.deliveryPhone}
            onChange={(event) => setForm((current) => ({ ...current, deliveryPhone: event.target.value }))}
            placeholder="+233 20 123 4567"
          />
        </Field>
        <Field label="Order notes (optional)">
          <Textarea
            value={form.notes}
            onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))}
            placeholder="Gate code, landmark, delivery instructions…"
            maxLength={300}
          />
        </Field>
      </Card>

      <Card className="space-y-2">
        <p className="text-sm font-bold text-slate-800">Payment method</p>
        {(['CASH', 'MOBILE_MONEY'] as const).map((method) => (
          <label
            key={method}
            className={
              form.paymentMethod === method
                ? 'flex cursor-pointer items-center justify-between rounded-2xl border border-red-600/50 bg-red-50 px-4 py-3'
                : 'flex cursor-pointer items-center justify-between rounded-2xl border border-slate-200 bg-slate-100 px-4 py-3'
            }
          >
            <span className="text-sm font-semibold text-slate-800">{PAYMENT_METHOD_LABELS[method]}</span>
            <input
              type="radio"
              name="payment"
              checked={form.paymentMethod === method}
              onChange={() => setForm((current) => ({ ...current, paymentMethod: method }))}
              className="h-5 w-5 accent-red-600"
            />
          </label>
        ))}
      </Card>

      <Card className="space-y-2 text-sm">
        <div className="flex justify-between text-slate-600">
          <span>Items ({itemCount})</span>
          <span className="font-semibold text-slate-800">{formatMoney(subtotal)}</span>
        </div>
        <div className="flex justify-between text-slate-600">
          <span>Delivery</span>
          <span className="font-semibold text-slate-800">{formatMoney(totals.deliveryFee)}</span>
        </div>
        <div className="flex justify-between text-slate-600">
          <span>Tax</span>
          <span className="font-semibold text-slate-800">{formatMoney(totals.tax)}</span>
        </div>
        <div className="flex items-center justify-between border-t border-slate-200 pt-2">
          <span className="font-bold text-slate-800">Total</span>
          <span className="text-lg font-extrabold text-red-600">{formatMoney(totals.total)}</span>
        </div>
        <ErrorText message={!accepting ? 'The kitchen is currently not accepting orders.' : null} />
        <Button type="submit" size="lg" className="w-full" loading={busy}>
          Place order · {formatMoney(totals.total)}
        </Button>
      </Card>
    </form>
  );
}

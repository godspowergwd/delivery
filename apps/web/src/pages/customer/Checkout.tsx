import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { AddressDTO, OrderDTO, SettingsDTO } from '@delivery/shared';
import { PAYMENT_METHOD_LABELS, computeTotals, formatMoney } from '@delivery/shared';
import { api } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { useCart } from '../../lib/cart';
import type { PlaceSuggestion } from '../../lib/geocode';
import { toast } from '../../lib/realtime';
import { Button, Card, Field, Input, Textarea } from '../../components/ui';
import { MapPreview } from '../../components/MapPreview';
import { LocationSearch } from '../../components/LocationSearch';
import { CheckIcon, LeafIcon } from '../../components/icons';

/**
 * Checkout — account-only (gated by <RequireAccount>), so everyone here is
 * signed in. The address field is the intelligent Mallam-first autocomplete,
 * the service-zone verdict is a live green/red status, and the submit action
 * is the screen's single red primary button.
 */
export function Checkout() {
  const { lines, clear } = useCart();
  const { user } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [addressText, setAddressText] = useState('');
  const [selected, setSelected] = useState<PlaceSuggestion | null>(null);
  const [deliveryPhone, setDeliveryPhone] = useState('');
  const [notes, setNotes] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<'CASH' | 'MOBILE_MONEY'>('CASH');

  const { data: settingsData } = useQuery({
    queryKey: ['settings'],
    queryFn: () => api.get<{ settings: SettingsDTO }>('/settings'),
    staleTime: 60_000,
  });
  const settings = settingsData?.settings;

  // Live service-area feedback for the chosen point. The API re-checks on submit.
  const zoneCheck = useQuery({
    queryKey: ['delivery-zone', selected?.lat, selected?.lng],
    enabled: Boolean(selected && (selected.lat !== 0 || selected.lng !== 0)),
    staleTime: 120_000,
    queryFn: () =>
      api.get<{ within: boolean; distanceKm: number; radiusKm: number; message: string | null }>(
        `/geo/check-zone?latitude=${selected!.lat}&longitude=${selected!.lng}`,
      ),
  });
  const outOfZone = zoneCheck.data ? !zoneCheck.data.within : false;

  const { data: addressData } = useQuery({
    queryKey: ['addresses'],
    queryFn: () => api.get<{ addresses: AddressDTO[] }>('/addresses'),
    enabled: Boolean(user),
  });

  useEffect(() => {
    const phone = user?.phone ?? '';
    setDeliveryPhone((current) => current || phone);
  }, [user?.phone]);

  // Preselect the saved default address once, before the guest touches the field.
  useEffect(() => {
    if (selected || !addressData) return;
    const saved = addressData.addresses.find((a) => a.isDefault) ?? addressData.addresses[0];
    if (!saved) return;
    const label = [saved.line1, saved.area, saved.city].filter(Boolean).join(', ');
    setAddressText(label);
    // Saved addresses have no GPS pin yet (0/0) — the guest can refine it by
    // picking a suggestion, which turns on the live zone check + map pin.
    setSelected({
      id: `saved:${saved.id}`,
      label: saved.line1,
      address: label,
      lat: 0,
      lng: 0,
      source: 'nominatim',
      kind: 'area',
    });
  }, [addressData, selected]);

  const totals = computeTotals({
    items: lines.map((line) => ({ unitPrice: line.unitPrice, quantity: line.quantity })),
    deliveryFee: settings?.deliveryFee ?? 0,
    taxRate: settings?.taxRate ?? 0,
  });

  const placeOrder = useMutation({
    mutationFn: () =>
      api.post<{ order: OrderDTO }>('/orders', {
        items: lines.map((line) => ({
          productId: line.productId,
          quantity: line.quantity,
          notes: line.notes || undefined,
        })),
        deliveryAddress: selected?.address ?? addressText,
        deliveryPhone,
        notes: notes || undefined,
        paymentMethod,
        deliveryLatitude: selected && (selected.lat !== 0 || selected.lng !== 0) ? selected.lat : null,
        deliveryLongitude: selected && (selected.lat !== 0 || selected.lng !== 0) ? selected.lng : null,
      }),
    onSuccess: (data) => {
      clear();
      queryClient.invalidateQueries({ queryKey: ['orders'] });
      queryClient.invalidateQueries({ queryKey: ['active-orders'] });
      toast(`Order ${data.order.orderNumber} sent to the kitchen!`, 'success');
      navigate(`/app/orders/${data.order.id}`, { replace: true });
    },
    onError: (error) => toast(error instanceof Error ? error.message : 'Could not place the order', 'error'),
  });

  if (lines.length === 0) {
    return (
      <Card>
        <p className="text-center text-sm text-slate-600">
          Your cart is empty — add items before checking out.
        </p>
        <div className="mt-4 flex justify-center">
          <Button onClick={() => navigate('/app/menu')}>Open the menu</Button>
        </div>
      </Card>
    );
  }

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!settings?.acceptingOrders) {
      toast('The kitchen is not accepting orders right now.', 'error');
      return;
    }
    if (!deliveryPhone.trim()) {
      toast('Please add a contact phone number.', 'error');
      return;
    }
    if (!selected && !addressText.trim()) {
      toast('Please choose a delivery address.', 'error');
      return;
    }
    if (outOfZone) {
      toast(zoneCheck.data?.message ?? 'We do not deliver to that location yet.', 'error');
      return;
    }
    placeOrder.mutate();
  };

  const accepting = settings?.acceptingOrders ?? true;
  const busy = placeOrder.isPending;

  return (
    <form onSubmit={submit} className="space-y-5">
      <header>
        <h1 className="text-2xl font-extrabold text-slate-900 lg:text-3xl">Checkout</h1>
        <p className="mt-1 text-sm text-slate-500">Choose your delivery address and confirm.</p>
      </header>

      {/* ---------- Address (intelligent autocomplete) ---------- */}
      <Card className="duo-top relative space-y-1">
        <LocationSearch
          value={addressText}
          onChange={setAddressText}
          onSelect={setSelected}
          selected={selected}
          required
        />
        {zoneCheck.data && (
          <p
            role="status"
            className={
              zoneCheck.data.within
                ? 'flex items-center gap-1.5 rounded-xl bg-green-50 px-3 py-2 text-xs font-bold text-green-800'
                : 'flex items-center gap-1.5 rounded-xl bg-red-50 px-3 py-2 text-xs font-bold text-red-700'
            }
          >
            {zoneCheck.data.within ? (
              <>
                <CheckIcon className="h-4 w-4" aria-hidden="true" />
                Inside the delivery zone · {zoneCheck.data.distanceKm} km from the kitchen (radius{' '}
                {zoneCheck.data.radiusKm} km)
              </>
            ) : (
              <>
                <span aria-hidden="true">!</span>
                {zoneCheck.data.message ?? 'Outside the current delivery zone.'}
              </>
            )}
          </p>
        )}
        {selected && (selected.lat !== 0 || selected.lng !== 0) && (
          <div className="pt-2">
            <MapPreview
              address={selected.address}
              className="h-40"
              label={`Delivery pin for ${selected.label}`}
            />
          </div>
        )}
      </Card>

      {/* ---------- Contact ---------- */}
      <Card className="space-y-4">
        <Field label="Contact phone" hint="Your courier calls this number on arrival.">
          <Input
            required
            inputMode="tel"
            autoComplete="tel"
            value={deliveryPhone}
            onChange={(event) => setDeliveryPhone(event.target.value)}
            placeholder="+233 20 123 4567"
          />
        </Field>
        <Field label="Order notes" hint="Extra sauce, no shito, gate code…">
          <Textarea
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            rows={3}
            maxLength={300}
            placeholder="Anything the kitchen or courier should know?"
          />
        </Field>
        <div>
          <p className="mb-2 text-sm font-semibold text-slate-800">Payment</p>
          <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Payment method">
            {(['CASH', 'MOBILE_MONEY'] as const).map((method) => {
              const active = paymentMethod === method;
              return (
                <button
                  key={method}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  onClick={() => setPaymentMethod(method)}
                  className={
                    active
                      ? 'flex items-center justify-center gap-2 rounded-2xl border-2 border-red-600 bg-red-50 px-3 py-3 text-sm font-bold text-red-700 transition'
                      : 'flex items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-3 py-3 text-sm font-semibold text-slate-600 transition hover:border-green-300 hover:bg-green-50'
                  }
                >
                  {active && <CheckIcon className="h-4 w-4" aria-hidden="true" />}
                  {PAYMENT_METHOD_LABELS[method]}
                </button>
              );
            })}
          </div>
        </div>
      </Card>

      {/* ---------- Totals + submit ---------- */}
      <Card className="duo-top space-y-2 text-sm">
        <Row label="Subtotal" value={formatMoney(totals.subtotal)} />
        <Row label="Delivery fee" value={formatMoney(totals.deliveryFee)} />
        <Row label={`Tax (${settings?.taxRate ?? 0}%)`} value={formatMoney(totals.tax)} />
        <div className="flex items-center justify-between border-t border-slate-200 pt-2">
          <span className="font-bold text-slate-800">Total</span>
          <span className="text-lg font-extrabold text-red-600">{formatMoney(totals.total)}</span>
        </div>
        <p className="flex items-center gap-1.5 rounded-xl bg-green-50 px-3 py-2 text-xs font-semibold text-green-800">
          <LeafIcon className="h-3.5 w-3.5 flex-none" aria-hidden="true" />
          Prepared fresh in the Mallam kitchen the moment you order.
        </p>
        {!accepting && (
          <p className="rounded-2xl border border-red-200 bg-red-50 px-4 py-2 text-xs font-semibold text-red-700">
            The kitchen is currently not accepting orders.
          </p>
        )}
        <Button type="submit" size="lg" block loading={busy} disabled={!accepting}>
          {busy ? 'Sending…' : `Place order · ${formatMoney(totals.total)}`}
        </Button>
      </Card>
    </form>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between text-slate-600">
      <span>{label}</span>
      <span className="font-semibold text-slate-800">{value}</span>
    </div>
  );
}


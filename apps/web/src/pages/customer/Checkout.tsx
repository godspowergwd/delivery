import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { AddressDTO, OrderDTO, SettingsDTO } from '@delivery/shared';
import { PAYMENT_METHOD_LABELS, computeTotals, formatMoney } from '@delivery/shared';
import { ApiError, api } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { useCart } from '../../lib/cart';
import type { PlaceSuggestion } from '../../lib/geocode';
import {
  isValidDeliveryCoordinates,
  clearConfirmedDeliveryLocation,
  readConfirmedDeliveryLocation,
  saveConfirmedDeliveryLocation,
  type ConfirmedDeliveryLocation,
} from '../../lib/delivery-location';
import {
  clearPendingOrder,
  readPendingOrder,
  savePendingOrder,
  type OrderSubmissionPayload,
} from '../../lib/offline-order';
import { toast } from '../../lib/realtime';
import { useRestaurantStatus } from '../../lib/restaurant-status';
import { Button, Card, Field, Input, Textarea } from '../../components/ui';
import { MapPreview } from '../../components/MapPreview';
import { LocationSearch } from '../../components/LocationSearch';
import { RestaurantClosedNotice } from '../../components/restaurant-status';
import { CheckIcon, LeafIcon } from '../../components/icons';

function toPlaceSuggestion(location: ConfirmedDeliveryLocation): PlaceSuggestion {
  return {
    id: `confirmed:${location.confirmedAt}`,
    label: location.label,
    address: location.address,
    lat: location.latitude,
    lng: location.longitude,
    source: location.source === 'gps' ? 'gps' : 'mapbox',
    kind: location.source === 'gps' ? 'gps' : 'area',
  };
}

function isTransientOrderFailure(error: unknown): boolean {
  return typeof navigator !== 'undefined' && !navigator.onLine ||
    error instanceof TypeError ||
    (error instanceof ApiError && [0, 502, 503, 504].includes(error.status));
}

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
  // Live open/closed state — the same source the API re-checks on submit.
  const { status: restaurantStatus, open: restaurantOpen } = useRestaurantStatus();

  const [confirmedLocation, setConfirmedLocation] = useState(() => readConfirmedDeliveryLocation(user?.id));
  const [addressText, setAddressText] = useState(() => confirmedLocation?.label ?? '');
  const [selected, setSelected] = useState<PlaceSuggestion | null>(() =>
    confirmedLocation ? toPlaceSuggestion(confirmedLocation) : null,
  );
  const [deliveryPhone, setDeliveryPhone] = useState('');
  const [notes, setNotes] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<'CASH' | 'MOBILE_MONEY'>('CASH');
  const [pendingOrder, setPendingOrder] = useState<OrderSubmissionPayload | null>(() => readPendingOrder(user?.id));
  const pendingOrderRef = useRef(pendingOrder);
  const addressTouchedRef = useRef(false);

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
  const confirmedSource = selected?.source === 'gps' ? 'gps' : selected?.source === 'mapbox' ? 'search' : null;
  const confirmedMatchesSelection = Boolean(
    confirmedLocation && selected && confirmedSource === confirmedLocation.source &&
    selected.lat === confirmedLocation.latitude && selected.lng === confirmedLocation.longitude &&
    selected.address === confirmedLocation.address,
  );

  const selectLocation = (place: PlaceSuggestion | null): void => {
    addressTouchedRef.current = true;
    setSelected(place);
    setConfirmedLocation(null);
    clearConfirmedDeliveryLocation(user?.id);
  };

  const confirmLocation = (): void => {
    if (!selected || !confirmedSource || !isValidDeliveryCoordinates(selected.lat, selected.lng)) {
      toast('Choose a valid map location before confirming it.', 'error');
      return;
    }
    const snapshot: ConfirmedDeliveryLocation = {
      latitude: selected.lat,
      longitude: selected.lng,
      originalLatitude: confirmedSource === 'gps' ? selected.lat : null,
      originalLongitude: confirmedSource === 'gps' ? selected.lng : null,
      address: selected.address,
      label: selected.label,
      source: confirmedSource,
      confirmedAt: new Date().toISOString(),
    };
    if (!saveConfirmedDeliveryLocation(user?.id, snapshot)) {
      toast('This device could not save the confirmed location. Check storage and try again.', 'error');
      return;
    }
    setConfirmedLocation(snapshot);
  };

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
    if (selected || confirmedLocation || !addressData || addressTouchedRef.current) return;
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
      source: 'saved',
      kind: 'area',
    });
  }, [addressData, confirmedLocation, selected]);

  const totals = computeTotals({
    items: lines.map((line) => ({ unitPrice: line.unitPrice, quantity: line.quantity })),
    deliveryFee: settings?.deliveryFee ?? 0,
    taxRate: settings?.taxRate ?? 0,
  });

  const placeOrder = useMutation({
    mutationFn: (payload: OrderSubmissionPayload) => api.post<{ order: OrderDTO }>('/orders', payload),
    onSuccess: (data) => {
      clearPendingOrder(user?.id);
      clearConfirmedDeliveryLocation(user?.id);
      pendingOrderRef.current = null;
      setPendingOrder(null);
      setConfirmedLocation(null);
      clear();
      queryClient.invalidateQueries({ queryKey: ['orders'] });
      queryClient.invalidateQueries({ queryKey: ['active-orders'] });
      toast(`Order ${data.order.orderNumber} sent to the kitchen!`, 'success');
      navigate(`/app/orders/${data.order.id}`, { replace: true });
    },
    onError: (error, payload) => {
      if (isTransientOrderFailure(error)) {
        if (savePendingOrder(user?.id, payload)) {
          pendingOrderRef.current = payload;
          setPendingOrder(payload);
          toast('Order saved on this device. It will sync when you are back online.', 'info');
          return;
        }
        toast('You are offline and this order could not be saved locally. Keep this page open and retry when connected.', 'error');
        return;
      }
      toast(error instanceof Error ? error.message : 'Could not place the order', 'error');
    },
  });

  const sendOrderRef = useRef(placeOrder.mutate);
  sendOrderRef.current = placeOrder.mutate;
  useEffect(() => {
    const onSynced = (event: Event): void => {
      const order = (event as CustomEvent<{ order?: OrderDTO }>).detail?.order;
      if (!order) return;
      pendingOrderRef.current = null;
      setPendingOrder(null);
      setConfirmedLocation(null);
      navigate(`/app/orders/${order.id}`, { replace: true });
    };
    const onRejected = (): void => {
      pendingOrderRef.current = null;
      setPendingOrder(null);
    };
    window.addEventListener('ds:offline-order-synced', onSynced);
    window.addEventListener('ds:offline-order-rejected', onRejected);
    return () => {
      window.removeEventListener('ds:offline-order-synced', onSynced);
      window.removeEventListener('ds:offline-order-rejected', onRejected);
    };
  }, [navigate]);

  if (lines.length === 0) {
    return (
      <Card>
        <p className="text-center text-sm text-slate-600">
          Your cart is empty - add items before checking out.
        </p>
        <div className="mt-4 flex justify-center">
          <Button onClick={() => navigate('/app/menu')}>Open the menu</Button>
        </div>
      </Card>
    );
  }

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!restaurantOpen) {
      // The server refuses the order anyway — this only keeps the messaging clean.
      toast('The kitchen is currently closed for new orders.', 'error');
      return;
    }
    if (!deliveryPhone.trim()) {
      toast('Please add a contact phone number.', 'error');
      return;
    }
    if (!confirmedLocation || !confirmedMatchesSelection) {
      toast('Choose a location and confirm it as your delivery destination.', 'error');
      return;
    }
    if (outOfZone) {
      toast(zoneCheck.data?.message ?? 'We do not deliver to that location yet.', 'error');
      return;
    }
    if (pendingOrderRef.current) {
      sendOrderRef.current(pendingOrderRef.current);
      return;
    }
    const payload: OrderSubmissionPayload = {
      idempotencyKey: crypto.randomUUID(),
      items: lines.map((line) => ({
        productId: line.productId,
        quantity: line.quantity,
        notes: line.notes || undefined,
      })),
      deliveryAddress: confirmedLocation.address,
      deliveryPhone,
      notes: notes || undefined,
      paymentMethod,
      deliveryLatitude: confirmedLocation.latitude,
      deliveryLongitude: confirmedLocation.longitude,
      deliveryOriginalLatitude: confirmedLocation.originalLatitude,
      deliveryOriginalLongitude: confirmedLocation.originalLongitude,
      deliveryLocationSource: confirmedLocation.source,
      deliveryLocationConfirmedAt: confirmedLocation.confirmedAt,
    };
    if (!navigator.onLine) {
      if (!savePendingOrder(user?.id, payload)) {
        toast('You are offline and this order could not be saved locally. Keep this page open and retry when connected.', 'error');
        return;
      }
      pendingOrderRef.current = payload;
      setPendingOrder(payload);
      toast('Order saved on this device. It will sync when you are back online.', 'info');
      return;
    }
    placeOrder.mutate(payload);
  };

  const accepting = restaurantOpen;
  const busy = placeOrder.isPending;

  return (
    <form onSubmit={submit} className="space-y-5">
      <header>
        <h1 className="text-2xl font-extrabold text-slate-900 lg:text-3xl">Checkout</h1>
        <p className="mt-1 text-sm text-slate-500">Choose your delivery address and confirm.</p>
      </header>

      {/* Closed kitchen: full-width status card, checkout stays blocked. */}
      {!restaurantOpen && <RestaurantClosedNotice status={restaurantStatus} />}

      {/* ---------- Address (intelligent autocomplete) ---------- */}
      <Card className="duo-top relative space-y-1">
        <LocationSearch
          value={addressText}
          onChange={setAddressText}
          onSelect={selectLocation}
          selected={selected}
          label="Choose another location"
          placeholder="Search for a different delivery location"
          required
          disabled={Boolean(pendingOrder)}
        />
        {addressText.trim() && !selected && (
          <p role="status" className="rounded-xl bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-800">
            Choose a matching address suggestion to confirm the location and save its delivery coordinates.
          </p>
        )}
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
              lat={selected.lat}
              lng={selected.lng}
              address={selected.address}
              className="h-40"
              label={`${confirmedMatchesSelection ? 'Delivery destination' : 'Proposed delivery location'}: ${selected.label}`}
            />
            {confirmedMatchesSelection ? (
              <p role="status" className="mt-2 rounded-xl bg-green-50 px-3 py-2 text-xs font-semibold text-green-800">
                Delivery location confirmed and saved on this device. It will stay fixed if you move.
              </p>
            ) : (
              <Button type="button" className="mt-2 w-full" onClick={confirmLocation} disabled={outOfZone || Boolean(pendingOrder)}>
                Confirm delivery location
              </Button>
            )}
          </div>
        )}
        {selected && selected.lat === 0 && selected.lng === 0 && (
          <p role="status" className="rounded-xl bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-800">
            That saved address has no GPS pin yet - pick a suggestion above so the courier gets an exact pin.
          </p>
        )}
        {pendingOrder && (
          <div role="status" className="space-y-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-3 text-sm text-amber-900">
            <p className="font-semibold">Order saved on this device for {pendingOrder.deliveryAddress}.</p>
            <p className="text-xs">It will sync when your connection returns. This destination is locked.</p>
            <Button type="button" size="sm" variant="outline" loading={busy} onClick={() => sendOrderRef.current(pendingOrder)}>
              Retry sync now
            </Button>
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
            disabled={Boolean(pendingOrder)}
            value={deliveryPhone}
            onChange={(event) => setDeliveryPhone(event.target.value)}
            placeholder="+233 20 123 4567"
          />
        </Field>
        <Field label="Order notes" hint="Extra sauce, no shito, gate code…">
          <Textarea
            disabled={Boolean(pendingOrder)}
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
                  disabled={Boolean(pendingOrder)}
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
          <p className="rounded-2xl border border-red-200 bg-red-50 px-4 py-2.5 text-[13px] font-bold leading-relaxed text-red-700">
            Kitchen is currently closed - we are not accepting orders right now. Opens again when
            the kitchen comes online.
          </p>
        )}
        <Button
          type="submit"
          size="lg"
          block
          loading={busy}
          disabled={!accepting || !confirmedMatchesSelection || Boolean(pendingOrder)}
        >
          {busy
            ? 'Sending…'
            : accepting
              ? `Place order · ${formatMoney(totals.total)}`
              : 'Orders are paused'}
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

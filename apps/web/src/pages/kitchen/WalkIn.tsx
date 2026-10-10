import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { useInfiniteQuery, useQuery, useQueryClient } from '@tanstack/react-query';
import type { DeliveryQuoteDTO, OrderDTO, Paginated, ProductDTO, PublicSettingsDTO, ReceiptDTO } from '@delivery/shared';
import { computeTotals, formatMoney } from '@delivery/shared';
import { ApiError, api, mediaUrl, qs } from '../../lib/api';
import type { PlaceSuggestion } from '../../lib/geocode';
import { toast } from '../../lib/realtime';
import { LocationSearch } from '../../components/LocationSearch';
import { Button, Card, EmptyState, Field, Input, Select, Spinner } from '../../components/ui';
import {
  CheckIcon,
  MinusIcon,
  PlusIcon,
  ReceiptIcon,
  SearchIcon,
  StoreIcon,
  TrashIcon,
} from '../../components/icons';
import { printDeliveryReceipt } from '../../lib/print-receipt';

type Cart = Record<string, number>;
type PaymentMethod = 'CASH' | 'MOBILE_MONEY';
type PaymentStatus = 'PAID' | 'PENDING';

interface WalkInPayload {
  items: Array<{ productId: string; quantity: number }>;
  fulfillmentType: 'PICKUP' | 'DELIVERY';
  customerName?: string;
  deliveryPhone?: string;
  deliveryAddress?: string;
  deliveryLatitude?: number;
  deliveryLongitude?: number;
  deliveryLocationSource?: 'gps' | 'search';
  deliveryLocationConfirmedAt?: string;
  quotedDeliveryFee?: number;
  deliveryOriginalLatitude?: number;
  deliveryOriginalLongitude?: number;
  paymentMethod: PaymentMethod;
  paymentStatus: PaymentStatus;
  idempotencyKey: string;
}

export function KitchenWalkIn() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [cart, setCart] = useState<Cart>({});
  const [cartProducts, setCartProducts] = useState<Record<string, ProductDTO>>({});
  const [delivery, setDelivery] = useState(false);
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [addressText, setAddressText] = useState('');
  const [location, setLocation] = useState<PlaceSuggestion | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('CASH');
  const [paymentStatus, setPaymentStatus] = useState<PaymentStatus>('PAID');
  const [errorMessage, setErrorMessage] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [retryPayload, setRetryPayload] = useState<WalkInPayload | null>(null);
  const [processedOrder, setProcessedOrder] = useState<OrderDTO | null>(null);
  const requestKey = useRef(crypto.randomUUID());
  const locked = isSubmitting || Boolean(retryPayload);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedSearch(search.trim()), 250);
    return () => window.clearTimeout(timer);
  }, [search]);

  const productsQuery = useInfiniteQuery({
    queryKey: ['walk-in-products', debouncedSearch],
    queryFn: ({ pageParam, signal }) => api.get<Paginated<ProductDTO>>(
      `/products${qs({ page: pageParam as number, pageSize: 50, q: debouncedSearch || undefined, sort: 'name_asc' })}`,
      signal,
    ),
    initialPageParam: 1,
    getNextPageParam: (page) => page.hasMore ? page.page + 1 : undefined,
    refetchInterval: 30_000,
  });
  const products = useMemo(
    () => productsQuery.data?.pages.flatMap((page) => page.items) ?? [],
    [productsQuery.data],
  );
  const productById = useMemo(
    () => new Map([...Object.values(cartProducts), ...products].map((product) => [product.id, product])),
    [cartProducts, products],
  );
  const cartLines = Object.entries(cart)
    .map(([productId, quantity]) => ({ product: productById.get(productId), quantity }))
    .filter((line): line is { product: ProductDTO; quantity: number } => Boolean(line.product));
  const settingsQuery = useQuery({
    queryKey: ['settings'],
    queryFn: () => api.get<{ settings: PublicSettingsDTO }>('/settings'),
    staleTime: 60_000,
  });
  const settings = settingsQuery.data?.settings;
  const deliveryQuoteQuery = useQuery({
    queryKey: ['walk-in-delivery-quote', location?.lat, location?.lng],
    enabled: delivery && Boolean(location && (location.lat !== 0 || location.lng !== 0)),
    staleTime: 15_000,
    retry: 1,
    queryFn: () => api.post<{ quote: DeliveryQuoteDTO }>('/geo/delivery-quote', {
      latitude: location!.lat,
      longitude: location!.lng,
    }),
  });
  const deliveryQuote = deliveryQuoteQuery.data?.quote;
  const totals = computeTotals({
    items: cartLines.map(({ product, quantity }) => ({ unitPrice: product.price, quantity })),
    deliveryFee: delivery ? deliveryQuote?.deliveryFee ?? 0 : 0,
    taxRate: settings?.taxRate ?? 0,
  });
  const itemCount = cartLines.reduce((sum, line) => sum + line.quantity, 0);

  const processPayload = async (payload: WalkInPayload): Promise<void> => {
    setIsSubmitting(true);
    setErrorMessage('');
    try {
      const result = await api.post<{ order: OrderDTO }>('/kitchen/walk-in/orders', payload);
      setProcessedOrder(result.order);
      setRetryPayload(null);
      setCart({});
      setCartProducts({});
      requestKey.current = crypto.randomUUID();
      void queryClient.invalidateQueries({ queryKey: ['kitchen-orders'] });
      void queryClient.invalidateQueries({ queryKey: ['kitchen-summary'] });
      void queryClient.invalidateQueries({ queryKey: ['orders'] });
      toast(`Walk-In order ${result.order.orderNumber} processed`, 'success');
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Could not process this order.');
      if (error instanceof ApiError && error.status >= 400 && error.status < 500) {
        setRetryPayload(null);
        requestKey.current = crypto.randomUUID();
      } else {
        setRetryPayload(payload);
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const submit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    setErrorMessage('');
    if (cartLines.length === 0) {
      setErrorMessage('Add at least one product to the order.');
      return;
    }
    if (delivery) {
      if (customerName.trim().length < 2) {
        setErrorMessage('Enter the customer name for delivery.');
        return;
      }
      if (customerPhone.trim().length < 7) {
        setErrorMessage('Enter a valid customer phone number.');
        return;
      }
      if (!location) {
        setErrorMessage('Choose a delivery location from the suggestions.');
        return;
      }
      if (!deliveryQuote) {
        setErrorMessage('Calculate a valid driving route and fee before processing this delivery.');
        return;
      }
    }
    const payload: WalkInPayload = {
      items: cartLines.map(({ product, quantity }) => ({ productId: product.id, quantity })),
      fulfillmentType: delivery ? 'DELIVERY' : 'PICKUP',
      paymentMethod,
      paymentStatus,
      idempotencyKey: requestKey.current,
      ...(delivery && location && deliveryQuote ? {
        customerName: customerName.trim(),
        deliveryPhone: customerPhone.trim(),
        deliveryAddress: location.address,
        deliveryLatitude: location.lat,
        deliveryLongitude: location.lng,
        deliveryLocationSource: location.source === 'gps' ? 'gps' as const : 'search' as const,
        deliveryLocationConfirmedAt: new Date().toISOString(),
        quotedDeliveryFee: deliveryQuote.deliveryFee,
        ...(location.source === 'gps' ? {
          deliveryOriginalLatitude: location.lat,
          deliveryOriginalLongitude: location.lng,
        } : {}),
      } : {}),
    };
    void processPayload(payload);
  };

  const addProduct = (product: ProductDTO): void => {
    setCartProducts((current) => ({ ...current, [product.id]: product }));
    setCart((current) => ({ ...current, [product.id]: Math.min((current[product.id] ?? 0) + 1, 50) }));
  };

  const startNewSale = (): void => {
    setProcessedOrder(null);
    setDelivery(false);
    setCustomerName('');
    setCustomerPhone('');
    setAddressText('');
    setLocation(null);
    setPaymentMethod('CASH');
    setPaymentStatus('PAID');
    setErrorMessage('');
  };

  if (processedOrder) {
    return (
      <div className="mx-auto max-w-xl space-y-4">
        <Card className="space-y-4 border-green-200 !bg-green-50">
          <div className="flex items-start gap-3">
            <span className="flex h-12 w-12 flex-none items-center justify-center rounded-xl bg-green-600 text-white">
              <CheckIcon className="h-6 w-6" aria-hidden="true" />
            </span>
            <div>
              <p className="text-lg font-extrabold text-green-900">Order processed</p>
              <p className="text-sm font-semibold text-green-800">
                {processedOrder.orderNumber} · {processedOrder.fulfillmentType === 'PICKUP' ? 'Walk-In pickup' : 'Walk-In delivery'}
              </p>
            </div>
          </div>
          <div className="flex items-center justify-between border-t border-green-200 pt-3 text-sm">
            <span className="font-semibold text-slate-600">Total · {processedOrder.paymentStatus === 'PAID' ? 'Paid' : 'Payment pending'}</span>
            <strong className="text-lg text-slate-900">{formatMoney(processedOrder.total)}</strong>
          </div>
          <Button
            block
            size="lg"
            onClick={() => void printDeliveryReceipt(
              async () => (await api.get<{ receipt: ReceiptDTO }>(`/receipts/order/${processedOrder.id}`)).receipt,
              { createdAt: processedOrder.createdAt, driverName: processedOrder.driverName },
            ).catch((error: unknown) => toast(error instanceof Error ? error.message : 'Could not open the receipt for printing.', 'error'))}
          >
            <ReceiptIcon className="h-5 w-5" aria-hidden="true" />
            Print receipt
          </Button>
        </Card>
        <Button block size="lg" variant="outline" onClick={startNewSale}>
          <PlusIcon className="h-5 w-5" aria-hidden="true" />
          New sale
        </Button>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-5" noValidate>
      <header className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-extrabold uppercase text-green-700">Kitchen point of sale</p>
          <h1 className="text-2xl font-extrabold text-slate-900">Walk-In</h1>
        </div>
        <a
          href="#walkin-cart"
          className="flex min-h-11 flex-none items-center gap-2 rounded-xl bg-red-600 px-3 text-sm font-extrabold text-white shadow-brand-soft"
        >
          <StoreIcon className="h-4 w-4" aria-hidden="true" />
          Cart · {itemCount}
        </a>
      </header>

      <div className="space-y-5 lg:grid lg:grid-cols-[minmax(0,1fr)_23rem] lg:items-start lg:gap-6 lg:space-y-0">
      <section className="space-y-3" aria-label="Products">
        <div className="relative">
          <SearchIcon className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-red-600" aria-hidden="true" />
          <Input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search products"
            aria-label="Search products"
            className="pl-10"
            disabled={locked}
          />
        </div>

        {productsQuery.isLoading ? (
          <div className="flex justify-center py-12"><Spinner className="h-8 w-8" /></div>
        ) : products.length === 0 ? (
          <EmptyState title="No available products" hint="Available products from the kitchen menu appear here." />
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
            {products.map((product) => {
              const image = mediaUrl(product.imageUrl);
              const soldOut = !product.isAvailable || product.stock <= 0;
              return (
                <Card key={product.id} className="!p-0 overflow-hidden">
                  <div className="aspect-[4/3] bg-slate-100">
                    {image ? <img src={image} alt={product.name} loading="lazy" className="h-full w-full object-cover" /> : (
                      <div className="flex h-full items-center justify-center text-slate-400"><StoreIcon className="h-8 w-8" aria-hidden="true" /></div>
                    )}
                  </div>
                  <div className="space-y-2 p-3">
                    <div className="min-h-10">
                      <p className="line-clamp-2 text-sm font-extrabold leading-5 text-slate-900">{product.name}</p>
                      <p className="mt-1 text-sm font-bold text-red-700">{formatMoney(product.price)}</p>
                    </div>
                    <Button type="button" block size="sm" disabled={locked || soldOut} onClick={() => addProduct(product)}>
                      {soldOut ? 'Unavailable' : <><PlusIcon className="h-4 w-4" aria-hidden="true" /> Add</>}
                    </Button>
                  </div>
                </Card>
              );
            })}
          </div>
        )}
        {productsQuery.hasNextPage && (
          <Button type="button" block variant="outline" disabled={locked || productsQuery.isFetchingNextPage} onClick={() => void productsQuery.fetchNextPage()}>
            {productsQuery.isFetchingNextPage ? 'Loading products…' : 'Load more products'}
          </Button>
        )}
      </section>

      <section id="walkin-cart" className="scroll-mt-20 lg:sticky lg:top-24">
      <Card className="space-y-4 overflow-x-clip">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-lg font-extrabold text-slate-900">Order</h2>
          <span className="text-sm font-semibold text-slate-500">{itemCount} item{itemCount === 1 ? '' : 's'}</span>
        </div>
        {cartLines.length === 0 ? (
          <p className="rounded-lg bg-slate-50 px-3 py-4 text-center text-sm text-slate-500">Choose products to start an order.</p>
        ) : (
          <div className="divide-y divide-slate-100">
            {cartLines.map(({ product, quantity }) => (
              <div key={product.id} className="flex items-center gap-2 py-3 first:pt-0">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-bold text-slate-800">{product.name}</p>
                  <p className="text-xs text-slate-500">{formatMoney(product.price)} each</p>
                </div>
                <div className="flex items-center gap-1">
                  <button type="button" aria-label={`Decrease ${product.name}`} disabled={locked} onClick={() => setCart((current) => {
                    const next = { ...current };
                    if (next[product.id] <= 1) delete next[product.id];
                    else next[product.id] -= 1;
                    return next;
                  })} className="flex h-10 w-10 items-center justify-center rounded-lg border border-slate-200 text-slate-700 disabled:opacity-40">
                    <MinusIcon className="h-4 w-4" aria-hidden="true" />
                  </button>
                  <span className="w-7 text-center text-sm font-extrabold tabular-nums">{quantity}</span>
                  <button type="button" aria-label={`Increase ${product.name}`} disabled={locked || quantity >= 50} onClick={() => setCart((current) => ({ ...current, [product.id]: current[product.id] + 1 }))} className="flex h-10 w-10 items-center justify-center rounded-lg border border-slate-200 text-slate-700 disabled:opacity-40">
                    <PlusIcon className="h-4 w-4" aria-hidden="true" />
                  </button>
                  <button type="button" aria-label={`Remove ${product.name}`} disabled={locked} onClick={() => setCart((current) => {
                    const next = { ...current };
                    delete next[product.id];
                    return next;
                  })} className="ml-1 flex h-10 w-10 items-center justify-center rounded-lg text-red-600 hover:bg-red-50 disabled:opacity-40">
                    <TrashIcon className="h-4 w-4" aria-hidden="true" />
                  </button>
                </div>
                <strong className="w-20 text-right text-sm text-slate-900">{formatMoney(product.price * quantity)}</strong>
              </div>
            ))}
          </div>
        )}

        <label className="flex min-h-12 cursor-pointer items-center justify-between rounded-lg border border-slate-200 px-3 py-2">
          <span>
            <span className="block text-sm font-extrabold text-slate-900">Add Delivery</span>
            <span className="block text-xs text-slate-500">Off by default · Walk-In pickup</span>
          </span>
          <input
            type="checkbox"
            checked={delivery}
            disabled={locked}
            onChange={(event) => {
              const enabled = event.target.checked;
              setDelivery(enabled);
              setPaymentStatus(enabled ? 'PENDING' : 'PAID');
              setErrorMessage('');
            }}
            className="h-5 w-5 accent-green-600"
          />
        </label>

        {delivery && (
          <div className="space-y-3 rounded-lg border border-green-200 bg-green-50/60 p-3">
            <Field label="Customer name" htmlFor="walk-in-customer-name">
              <Input id="walk-in-customer-name" value={customerName} onChange={(event) => setCustomerName(event.target.value)} autoComplete="name" disabled={locked} required />
            </Field>
            <Field label="Customer phone" htmlFor="walk-in-customer-phone">
              <Input id="walk-in-customer-phone" type="tel" value={customerPhone} onChange={(event) => setCustomerPhone(event.target.value)} autoComplete="tel" disabled={locked} required />
            </Field>
            <LocationSearch
              value={addressText}
              onChange={(value) => {
                setAddressText(value);
                setLocation((current) => current?.label === value ? current : null);
              }}
              onSelect={(place) => {
                setLocation(place);
                setErrorMessage('');
              }}
              selected={location}
              required
              disabled={locked}
              label="Delivery location / address"
            />
            {location && deliveryQuoteQuery.isFetching && <p role="status" className="text-xs font-semibold text-slate-600">Calculating the driving route and fee…</p>}
            {deliveryQuote && (
              <div className="space-y-1 rounded-lg bg-green-50 px-3 py-2 text-xs font-semibold text-green-900">
                <p>{deliveryQuote.drivingDistanceKm.toFixed(2)} km · about {deliveryQuote.estimatedDurationMinutes} min</p>
                <p>Delivery fee: {formatMoney(deliveryQuote.deliveryFee)}</p>
              </div>
            )}
            {deliveryQuote?.warning && <p role="status" className="rounded-lg bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-900">{deliveryQuote.warning}</p>}
            {deliveryQuoteQuery.isError && <p role="alert" className="text-xs font-semibold text-rose-700">No driving route could be verified. Correct the address or contact the restaurant.</p>}
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          <Field label="Payment method" htmlFor="walk-in-payment-method">
            <Select id="walk-in-payment-method" value={paymentMethod} onChange={(event) => setPaymentMethod(event.target.value as PaymentMethod)} disabled={locked}>
              <option value="CASH">Cash</option>
              <option value="MOBILE_MONEY">Mobile Money</option>
            </Select>
          </Field>
          <Field label="Payment status" htmlFor="walk-in-payment-status">
            <Select id="walk-in-payment-status" value={paymentStatus} onChange={(event) => setPaymentStatus(event.target.value as PaymentStatus)} disabled={locked}>
              <option value="PAID">Paid</option>
              <option value="PENDING">Pending</option>
            </Select>
          </Field>
        </div>

        <div className="space-y-2 border-t border-slate-200 pt-3 text-sm">
          <div className="flex justify-between text-slate-600"><span>Subtotal</span><span>{formatMoney(totals.subtotal)}</span></div>
          {delivery && <div className="flex justify-between text-slate-600"><span>Delivery</span><span>{deliveryQuote ? formatMoney(deliveryQuote.deliveryFee) : deliveryQuoteQuery.isFetching ? 'Calculating…' : 'Not quoted'}</span></div>}
          {totals.tax > 0 && <div className="flex justify-between text-slate-600"><span>Tax</span><span>{formatMoney(totals.tax)}</span></div>}
          <div className="flex justify-between border-t border-slate-100 pt-2 text-lg font-extrabold text-slate-900"><span>Total</span><span>{formatMoney(totals.total)}</span></div>
        </div>

        {errorMessage && <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-800" role="alert">{errorMessage}</p>}
        {retryPayload ? (
          <Button type="button" block size="lg" disabled={isSubmitting} onClick={() => void processPayload(retryPayload)}>
            {isSubmitting ? 'Retrying…' : 'Retry the same order'}
          </Button>
        ) : (
          <Button type="submit" block size="lg" disabled={locked || cartLines.length === 0 || (delivery && (!deliveryQuote || deliveryQuoteQuery.isError || deliveryQuoteQuery.isFetching))}>
            {isSubmitting ? 'Processing…' : delivery ? 'Process Delivery Order' : 'Process Order'}
          </Button>
        )}
      </Card>
      </section>
      </div>
    </form>
  );
}
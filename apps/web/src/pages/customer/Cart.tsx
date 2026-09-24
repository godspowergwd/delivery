import { Link, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import type { SettingsDTO } from '@delivery/shared';
import { computeTotals, formatMoney } from '@delivery/shared';
import { api, mediaUrl } from '../../lib/api';
import { useCart } from '../../lib/cart';
import { useGuestGate } from '../../lib/guest';
import { Button, Card, EmptyState, Input } from '../../components/ui';
import { ImageIcon, LeafIcon } from '../../components/icons';

export function Cart() {
  const { lines, itemCount, subtotal, setQuantity, setNotes, remove, clear } = useCart();
  const navigate = useNavigate();
  const { requireAuth } = useGuestGate();

  const { data } = useQuery({
    queryKey: ['settings'],
    queryFn: () => api.get<{ settings: SettingsDTO }>('/settings'),
    staleTime: 60_000,
  });
  const settings = data?.settings;

  const totals = computeTotals({
    items: lines.map((line) => ({ unitPrice: line.unitPrice, quantity: line.quantity })),
    deliveryFee: settings?.deliveryFee ?? 0,
    taxRate: settings?.taxRate ?? 0,
  });
  const minimumOrderTotal = settings?.minOrderTotal ?? 0;
  const belowMinimum = minimumOrderTotal > 0 && subtotal < minimumOrderTotal;

  if (lines.length === 0) {
    return (
      <EmptyState title="Your cart is empty" hint="Browse the menu and add something delicious.">
        <Link to="/app/menu" className="mt-3">
          <Button size="lg">Open the menu</Button>
        </Link>
      </EmptyState>
    );
  }

  return (
    <div className="space-y-5">
      <header>
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-extrabold text-slate-900 lg:text-3xl">
            Cart <span className="ml-2 text-base font-semibold text-slate-500">({itemCount} {itemCount === 1 ? 'item' : 'items'})</span>
          </h1>
          <button onClick={clear} className="text-sm font-semibold text-red-600 hover:text-red-800 hover:underline">
            Clear all
          </button>
        </div>
        <p className="mt-1 text-sm text-slate-500">Review your items and continue to checkout.</p>
      </header>

      <div className="space-y-3">
        {lines.map((line) => {
          const image = mediaUrl(line.imageUrl);
          return (
            <Card key={line.productId} className="flex gap-3">
              <div className="h-20 w-20 shrink-0 overflow-hidden rounded-2xl bg-slate-100/60">
                {image ? (
                  <img src={image} alt={line.name} className="h-full w-full object-cover" />
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-slate-300">
                  <ImageIcon className="h-10 w-10" />
                </div>
                )}
              </div>
              <div className="flex flex-1 flex-col gap-2">
                <div className="flex items-start justify-between gap-2">
                  <p className="text-sm font-bold text-slate-900">{line.name}</p>
                  <button onClick={() => remove(line.productId)} className="text-sm font-semibold text-red-700 hover:underline" aria-label={`Remove ${line.name}`}>
                    Remove
                  </button>
                </div>
                <p className="text-sm text-slate-500">{formatMoney(line.unitPrice)} each</p>
                <input
                  value={line.notes ?? ''}
                  onChange={(event) => setNotes(line.productId, event.target.value)}
                  placeholder="Item note (optional)"
                  maxLength={200}
                  className="w-full rounded-xl border border-slate-200 bg-slate-100 px-3 py-2 text-xs text-slate-800 placeholder:text-slate-500 outline-none focus:border-red-600"
                />
                <div className="mt-auto flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <button onClick={() => setQuantity(line.productId, line.quantity - 1)} className="h-10 w-10 rounded-xl border border-red-200 bg-red-50 font-bold text-red-700 transition hover:bg-red-100" aria-label="Decrease">
                      −
                    </button>
                    <span className="w-6 text-center font-extrabold text-slate-900">{line.quantity}</span>
                    <button onClick={() => setQuantity(line.productId, line.quantity + 1)} className="h-10 w-10 rounded-xl bg-red-600 font-bold text-white shadow-brand-soft transition hover:bg-red-700" aria-label="Increase">
                      +
                    </button>
                  </div>
                  <span className="text-sm font-extrabold text-red-600">{formatMoney(line.unitPrice * line.quantity)}</span>
                </div>
              </div>
            </Card>
          );
        })}
      </div>

      <Card className="duo-top space-y-2 text-sm">
        <TotalRow label="Subtotal" value={formatMoney(totals.subtotal)} />
        <TotalRow label="Delivery fee" value={formatMoney(totals.deliveryFee)} />
        <TotalRow label={`Tax (${settings?.taxRate ?? 0}%)`} value={formatMoney(totals.tax)} />
        <div className="flex items-center justify-between border-t border-slate-200 pt-2">
          <span className="font-bold text-slate-800">Total</span>
          <span className="text-lg font-extrabold text-red-600">{formatMoney(totals.total)}</span>
        </div>
        <p className="flex items-center gap-1.5 rounded-xl bg-green-50 px-3 py-2 text-xs font-semibold text-green-800">
          <LeafIcon className="h-3.5 w-3.5 flex-none" aria-hidden="true" />
          Cooked fresh today in our Mallam kitchen.
        </p>
        {belowMinimum && (
          <p className="rounded-2xl border border-red-200 bg-red-50 px-4 py-2 text-xs text-red-700">
            Minimum order is {formatMoney(settings?.minOrderTotal ?? 0)} — add a little more to check out.
          </p>
        )}
        <Button
          size="lg"
          className="w-full"
          disabled={belowMinimum}
          onClick={() =>
            // Checkout is protected — guests get the sheet, then land here.
            requireAuth(() => navigate('/app/checkout'), {
              type: 'NAVIGATE',
              to: '/app/checkout',
            })
          }
        >
          Continue to checkout
        </Button>
      </Card>
    </div>
  );
}

function TotalRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between text-slate-600">
      <span>{label}</span>
      <span className="font-semibold text-slate-800">{value}</span>
    </div>
  );
}

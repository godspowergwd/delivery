import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import type { ProductDTO } from '@delivery/shared';
import { formatMoney } from '@delivery/shared';
import { api, mediaUrl } from '../../lib/api';
import { useCart } from '../../lib/cart';
import { useGuestGate } from '../../lib/guest';
import { toast } from '../../lib/realtime';
import { ArrowLeftIcon, ClockIcon, ImageIcon, LeafIcon } from '../../components/icons';
import { Button, Card, Spinner } from '../../components/ui';

export function ProductPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { add } = useCart();
  const { requireAuth } = useGuestGate();
  const [quantity, setQuantity] = useState(1);
  const [notes, setNotes] = useState('');

  const { data: product, isLoading, isError } = useQuery({
    queryKey: ['product', id],
    queryFn: () => api.get<{ product: ProductDTO }>(`/products/${id}`),
    enabled: Boolean(id),
  });

  if (isLoading) {
    return (
      <div className="flex justify-center py-20">
        <Spinner className="h-8 w-8" />
      </div>
    );
  }
  if (isError || !product) {
    return (
      <Card>
        <p className="text-center text-sm text-slate-600">This product is no longer available.</p>
        <div className="mt-4 flex justify-center">
          <Link to="/app/menu" className="text-sm font-semibold text-red-600 hover:underline">
            Back to menu
          </Link>
        </div>
      </Card>
    );
  }

  const data = product.product;
  const image = mediaUrl(data.imageUrl);
  const soldOut = !data.isAvailable || data.stock <= 0;

  const addToCart = () => {
    // Ordering is protected: guests sign in on the sheet, then this runs.
    requireAuth(
      () => {
        add(data, quantity, notes.trim() || null);
        toast(`Added ${quantity} × ${data.name}`, 'success');
        navigate('/app/cart');
      },
      {
        type: 'ADD_TO_CART',
        line: {
          productId: data.id,
          name: data.name,
          imageUrl: data.imageUrl,
          unitPrice: data.price,
          quantity,
          notes: notes.trim() || null,
        },
      },
    );
  };

  return (
    <div className="space-y-4">
      <button onClick={() => navigate(-1)} className="flex items-center gap-2 text-sm font-semibold text-slate-600 hover:text-slate-900">
        <ArrowLeftIcon className="h-5 w-5" aria-hidden="true" />
        Back
      </button>

      <div className="rg-corners overflow-hidden rounded-3xl border border-slate-200 bg-white">
        <div className="aspect-video bg-slate-100/60">
          {image ? (
            <img src={image} alt={data.name} className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full w-full items-center justify-center py-16 text-slate-300">
              <ImageIcon className="h-16 w-16" />
            </div>
          )}
        </div>
        <div className="space-y-3 p-5">
          <div className="flex items-start justify-between gap-3">
            <h1 className="text-2xl font-extrabold text-red-700">{data.name}</h1>
            <span className="text-lg font-extrabold text-red-600">{formatMoney(data.price)}</span>
          </div>
          <p className="text-sm leading-relaxed text-slate-600">{data.description}</p>
          <div className="flex flex-wrap gap-2 text-xs">
            <span className="flex items-center gap-2 rounded-full bg-slate-100 px-3 py-1 text-slate-700">
              <ClockIcon className="h-3.5 w-3.5 text-red-500" aria-hidden="true" />
              {data.prepTimeMinutes} min prep
            </span>
            <span
              className={
                soldOut
                  ? 'rounded-full bg-red-50 px-3 py-1 font-semibold text-red-700'
                  : 'badge-fresh'
              }
            >
              {soldOut ? 'Sold out' : `${data.stock} in stock`}
            </span>
            {data.isPopular && <span className="badge-hot">Popular</span>}
            {data.isNew && (
              <span className="badge-fresh">
                <LeafIcon className="h-3 w-3" aria-hidden="true" />
                Freshly prepared
              </span>
            )}
          </div>
          {data.ingredients.length > 0 && (
            <div>
              <p className="flex items-center gap-1.5 text-sm font-semibold uppercase tracking-wide text-green-700">
                <LeafIcon className="h-4 w-4" aria-hidden="true" />
                Ingredients
              </p>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {data.ingredients.map((ingredient) => (
                  <span key={ingredient} className="food-chip">
                    {ingredient.toLowerCase()}
                  </span>
                ))}
              </div>
            </div>
          )}
          <p className="text-sm text-slate-600">
            Category:{' '}
            <span className="font-semibold text-green-700">{data.categoryName}</span>
          </p>
        </div>
      </div>

      <Card className="space-y-4">
        <div className="flex items-center justify-between">
          <p className="text-sm font-semibold text-slate-800">Quantity</p>
          <div className="flex items-center gap-3">
            <button
              onClick={() => setQuantity((q) => Math.max(1, q - 1))}
              className="flex h-11 w-11 items-center justify-center rounded-2xl bg-slate-100 text-lg font-bold text-slate-800 transition hover:bg-slate-200 active:scale-95"
              aria-label="Decrease quantity"
            >
              −
            </button>
            <span className="w-8 text-center text-lg font-extrabold text-slate-900">{quantity}</span>
            <button
              onClick={() => setQuantity((q) => Math.min(Math.max(1, data.stock), q + 1))}
              className="flex h-11 w-11 items-center justify-center rounded-2xl bg-slate-100 text-lg font-bold text-slate-800 transition hover:bg-slate-200 active:scale-95"
              aria-label="Increase quantity"
            >
              +
            </button>
          </div>
        </div>
        <textarea
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
          placeholder="Any special requests for the kitchen? (optional)"
          maxLength={200}
          className="min-h-20 w-full rounded-2xl border border-slate-200 bg-slate-100 px-4 py-3 text-sm text-slate-900 placeholder:text-slate-500 outline-none focus:border-red-600"
        />
      </Card>

      {/* Sticky purchase bar — always within thumb reach, like Bolt Food. */}
      <div className="pb-safe sticky bottom-0 z-30 -mx-4 mt-2 border-t border-slate-200 bg-white/95 px-4 py-3 shadow-[0_-8px_24px_rgba(19,26,38,0.08)] backdrop-blur lg:-mx-8 lg:px-8">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 rounded-2xl bg-slate-100 p-1">
            <button
              onClick={() => setQuantity((q) => Math.max(1, q - 1))}
              className="flex h-10 w-10 items-center justify-center rounded-xl text-lg font-bold text-slate-700 transition hover:bg-white active:scale-95"
              aria-label="Decrease quantity"
            >
              −
            </button>
            <span className="w-7 text-center font-extrabold text-slate-900">{quantity}</span>
            <button
              onClick={() => setQuantity((q) => Math.min(Math.max(1, data.stock), q + 1))}
              className="flex h-10 w-10 items-center justify-center rounded-xl text-lg font-bold text-slate-700 transition hover:bg-white active:scale-95"
              aria-label="Increase quantity"
            >
              +
            </button>
          </div>
          <Button size="lg" className="flex-1" disabled={soldOut} onClick={addToCart}>
            {soldOut ? 'Sold out' : `Add · ${formatMoney(data.price * quantity)}`}
          </Button>
        </div>
      </div>
    </div>
  );
}

import { Link } from 'react-router-dom';
import type { ProductDTO } from '@delivery/shared';
import { formatMoney } from '@delivery/shared';
import { clsx } from 'clsx';
import { mediaUrl } from '../lib/api';
import { useCart } from '../lib/cart';
import { useGuestGate } from '../lib/guest';
import { toast } from '../lib/realtime';
import { ClockIcon, ImageIcon, LeafIcon, PlusIcon } from './icons';

/**
 * Food card — the brand's signature surface, balancing red and green:
 *   * white card body with selective red + green corner accents
 *   * red food name and red price (appetite + action hierarchy)
 *   * green ingredient chips, green category line and green freshness badge
 *   * red add-to-cart button (ordering is the action)
 *
 * Guests can browse every card; the add action routes through the guest gate
 * so the sign-in sheet appears and the item is added automatically afterwards.
 */
export function FoodCard({ product, index = 0 }: { product: ProductDTO; index?: number }) {
  const { add } = useCart();
  const { requireAuth } = useGuestGate();
  const image = mediaUrl(product.imageUrl);
  const soldOut = !product.isAvailable || product.stock <= 0;
  const chips = product.ingredients.slice(0, 2);
  const extraChips = Math.max(0, product.ingredients.length - chips.length);

  const onAdd = () => {
    if (soldOut) return;
    requireAuth(
      () => {
        add(product);
        toast(`Added ${product.name}`, 'success');
      },
      {
        type: 'ADD_TO_CART',
        line: {
          productId: product.id,
          name: product.name,
          imageUrl: product.imageUrl,
          unitPrice: product.price,
          quantity: 1,
          notes: null,
        },
      },
    );
  };

  return (
    <article
      className="food-card group rg-corners flex animate-fade-up flex-col overflow-hidden rounded-card bg-white shadow-card ring-1 ring-inset ring-slate-200/60 transition-[transform,box-shadow] duration-200 hover:-translate-y-1 hover:shadow-lift"
      style={{ animationDelay: `${Math.min(index, 8) * 45}ms` }}
    >
      <Link
        to={`/app/product/${product.id}`}
        className="relative block aspect-[4/3] overflow-hidden bg-slate-100"
        aria-label={product.name}
      >
        {image ? (
          <img
            src={image}
            alt={product.name}
            loading="lazy"
            decoding="async"
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.04]"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-slate-300">
            <ImageIcon className="h-10 w-10" aria-hidden="true" />
          </div>
        )}
        {/* Red emphasis badges */}
        <div className="absolute left-2 top-2 flex gap-1.5">
          {product.isPopular && (
            <span className="badge-hot">Popular</span>
          )}
        </div>
        {/* Green freshness / availability badges */}
        <div className="absolute right-2 top-2 flex gap-1.5">
          {product.isNew && (
            <span className="badge-fresh">
              <LeafIcon className="h-3 w-3" aria-hidden="true" />
              Fresh
            </span>
          )}
        </div>
        {!soldOut && !product.isNew && (
          <span className="absolute bottom-2 right-2 inline-flex items-center gap-1 rounded-full bg-white/95 px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wide text-green-700">
            <span className="h-1.5 w-1.5 rounded-full bg-green-600" aria-hidden="true" />
            Available
          </span>
        )}
        {soldOut && (
          <span className="absolute inset-x-0 bottom-0 bg-slate-900/70 py-1 text-center text-[11px] font-bold uppercase tracking-wide text-white">
            Sold out
          </span>
        )}
      </Link>
      <div className="flex flex-1 flex-col gap-1 p-3">
        <Link
          to={`/app/product/${product.id}`}
          className="line-clamp-1 text-[15px] font-bold text-red-700 transition group-hover:text-red-800"
        >
          {product.name}
        </Link>
        <p className="line-clamp-1 text-[13px] font-semibold text-green-700">
          {product.categoryName}
        </p>
        {chips.length > 0 && (
          <div className="flex flex-wrap items-center gap-1" aria-label="Ingredients">
            {chips.map((ingredient) => (
              <span key={ingredient} className="food-chip">
                {ingredient.toLowerCase()}
              </span>
            ))}
            {extraChips > 0 && (
              <span className="food-chip food-chip-red">+{extraChips}</span>
            )}
          </div>
        )}
        <p className="flex items-center gap-1 text-[13px] font-semibold text-slate-500">
          <ClockIcon className="h-3.5 w-3.5 text-green-600" aria-hidden="true" />
          {product.prepTimeMinutes} min
        </p>
        <div className="mt-auto flex items-center justify-between gap-2 pt-1">
          <span className="text-[15px] font-extrabold text-red-600">{formatMoney(product.price)}</span>
          <button
            type="button"
            disabled={soldOut}
            onClick={onAdd}
            aria-label={soldOut ? `${product.name} is sold out` : `Add ${product.name} to cart`}
            className={clsx(
              'btn-ripple flex h-11 w-11 items-center justify-center rounded-full text-white transition active:scale-95 disabled:opacity-40',
              soldOut ? 'bg-slate-300' : 'bg-red-600 shadow-brand hover:bg-red-700',
            )}
          >
            <PlusIcon className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>
      </div>
    </article>
  );
}

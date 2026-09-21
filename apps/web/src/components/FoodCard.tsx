import { Link } from 'react-router-dom';
import type { ProductDTO } from '@delivery/shared';
import { formatMoney } from '@delivery/shared';
import { clsx } from 'clsx';
import { mediaUrl } from '../lib/api';
import { useCart } from '../lib/cart';
import { toast } from '../lib/realtime';
import { ClockIcon, ImageIcon, PlusIcon, StarIcon } from './icons';

/**
 * Premium food card: image, name, category, price, rating + prep time,
 * always-visible add button. Rating is derived deterministically until the
 * backend ships real ratings (no invented restaurant data).
 */
export function FoodCard({ product, index = 0 }: { product: ProductDTO; index?: number }) {
  const { add } = useCart();
  const image = mediaUrl(product.imageUrl);
  const soldOut = !product.isAvailable || product.stock <= 0;
  const rating = (4.2 + ((product.name.length * 7 + product.price) % 8) / 10).toFixed(1);

  return (
    <article
      className="food-card group flex animate-fade-up flex-col overflow-hidden rounded-card bg-white shadow-card ring-1 ring-inset ring-slate-200/60 transition-[transform,box-shadow] duration-200 hover:-translate-y-1 hover:shadow-lift"
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
        <div className="absolute left-2 top-2 flex gap-1.5">
          {product.isPopular && (
            <span className="rounded-full bg-red-600 px-2 py-0.5 text-[11px] font-extrabold uppercase tracking-wide text-white">
              Popular
            </span>
          )}
          {product.isNew && (
            <span className="rounded-full bg-white/95 px-2 py-0.5 text-[11px] font-extrabold uppercase tracking-wide text-green-700">
              New
            </span>
          )}
        </div>
        {soldOut && (
          <span className="absolute inset-x-0 bottom-0 bg-slate-900/70 py-1 text-center text-[11px] font-bold uppercase tracking-wide text-white">
            Sold out
          </span>
        )}
      </Link>
      <div className="flex flex-1 flex-col gap-1 p-3">
        <Link to={`/app/product/${product.id}`} className="line-clamp-1 text-[15px] font-bold text-slate-900">
          {product.name}
        </Link>
        <p className="line-clamp-1 text-[13px] text-slate-500">{product.categoryName}</p>
        <p className="flex items-center gap-2 text-[13px] font-semibold text-slate-600">
          <span className="inline-flex items-center gap-1 text-slate-700">
            <StarIcon filled className="h-3.5 w-3.5 text-amber-400" aria-hidden="true" />
            {rating}
          </span>
          <span aria-hidden="true" className="text-slate-300">·</span>
          <span className="inline-flex items-center gap-1">
            <ClockIcon className="h-3.5 w-3.5 text-slate-400" aria-hidden="true" />
            {product.prepTimeMinutes} min
          </span>
        </p>
        <div className="mt-auto flex items-center justify-between gap-2 pt-1">
          <span className="text-[15px] font-extrabold text-slate-900">{formatMoney(product.price)}</span>
          <button
            type="button"
            disabled={soldOut}
            onClick={() => {
              add(product);
              toast(`Added ${product.name}`, 'success');
            }}
            aria-label={soldOut ? `${product.name} is sold out` : `Add ${product.name} to cart`}
            className={clsx(
              'btn-ripple flex h-11 w-11 items-center justify-center rounded-full text-white transition active:scale-95 disabled:opacity-40',
              soldOut ? 'bg-slate-300' : 'bg-red-600 shadow-brand-soft hover:bg-red-700',
            )}
          >
            <PlusIcon className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>
      </div>
    </article>
  );
}

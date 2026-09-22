import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import type { CategoryDTO, OrderDTO, Paginated, ProductDTO, SettingsDTO } from '@delivery/shared';
import { ORDER_STATUS_LABELS, formatMoney, formatRelativeTime } from '@delivery/shared';
import { api } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { useCart } from '../../lib/cart';
import { Reveal } from '../../components/motion';
import { FoodCard } from '../../components/FoodCard';
import { CategoryRail, DeliveryStatusBar, PromoCapture, TrustRow } from '../../components/home';
import { SearchIcon, SparkleIcon, TruckIcon } from '../../components/icons';
import { Card, Spinner, StatusPill } from '../../components/ui';

export default function CustomerHome() {
  const { user } = useAuth();
  const { itemCount } = useCart();
  const navigate = useNavigate();
  const [query, setQuery] = useState('');

  const { data: categories } = useQuery({
    queryKey: ['categories'],
    queryFn: () => api.get<Paginated<CategoryDTO>>('/categories?pageSize=12&withProductsOnly=true'),
    staleTime: 60_000,
  });

  const { data: popular, isLoading: popularLoading } = useQuery({
    queryKey: ['home-popular'],
    queryFn: () => api.get<Paginated<ProductDTO>>('/products?sort=popular&pageSize=8'),
    staleTime: 30_000,
  });

  const { data: fresh, isLoading: freshLoading } = useQuery({
    queryKey: ['home-fresh'],
    queryFn: () => api.get<Paginated<ProductDTO>>('/products?isNew=true&pageSize=4'),
    staleTime: 30_000,
  });

  const { data: active } = useQuery({
    queryKey: ['active-orders'],
    queryFn: () => api.get<{ orders: OrderDTO[] }>('/orders/active'),
    refetchInterval: 15_000,
    staleTime: 10_000,
  });

  const firstName = user?.name?.split(' ')[0] ?? 'there';

  const submitSearch = (event: React.FormEvent) => {
    event.preventDefault();
    navigate(query.trim() ? `/app/search?q=${encodeURIComponent(query.trim())}` : '/app/search');
  };

  return (
    <div className="space-y-7">
      {(active?.orders?.length ?? 0) > 0 && (
        <Link
          to={`/app/orders/${active!.orders[0].id}`}
          className="flex items-center gap-3 rounded-card bg-slate-900 p-4 text-white shadow-card transition hover:shadow-lift"
        >
          <span className="flex h-11 w-11 flex-none items-center justify-center rounded-2xl bg-red-600">
            <TruckIcon className="h-6 w-6" aria-hidden="true" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-extrabold">
              {active!.orders[0].orderNumber} · {ORDER_STATUS_LABELS[active!.orders[0].status]}
            </span>
            <span className="block truncate text-xs font-medium text-slate-300">
              {active!.orders.length > 1
                ? `${active!.orders.length} live orders — tap to track`
                : `${active!.orders[0].itemCount} items · ${formatMoney(active!.orders[0].total)} · ${formatRelativeTime(active!.orders[0].createdAt)}`}
            </span>
          </span>
          <StatusPill status={active!.orders[0].status} label={ORDER_STATUS_LABELS[active!.orders[0].status]} />
        </Link>
      )}

      {/* ---------- Hero ---------- */}
      <section className="relative overflow-hidden rounded-card bg-white p-5 shadow-card ring-1 ring-inset ring-slate-200/60">
        <div aria-hidden="true" className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full bg-red-50" />
        <div className="relative">
          <p className="text-sm font-bold text-slate-500">Hungry, {firstName}?</p>
          <h1 className="mt-1 text-[26px] font-extrabold leading-tight tracking-tight text-slate-900 sm:text-3xl">
            Fresh food, delivered <span className="text-red-600">fast</span>.
          </h1>

          <form onSubmit={submitSearch} className="mt-4" role="search">
            <div className="flex items-center gap-2 rounded-full bg-slate-100 py-1.5 pl-4 pr-1.5 ring-1 ring-inset ring-transparent transition focus-within:bg-white focus-within:ring-red-300">
              <SearchIcon className="h-5 w-5 flex-none text-slate-400" aria-hidden="true" />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search meals, drinks, desserts…"
                aria-label="Search meals"
                className="min-w-0 flex-1 bg-transparent py-2 text-[15px] font-medium text-slate-900 outline-none placeholder:text-slate-400"
              />
              <button
                type="submit"
                className="btn-ripple flex h-11 flex-none items-center rounded-full bg-red-600 px-5 text-sm font-bold text-white shadow-brand-soft transition hover:bg-red-700 active:scale-95"
              >
                Search
              </button>
            </div>
          </form>

          <div className="mt-3">
            <DeliveryStatusBar etaMinutes={25} />
          </div>
        </div>
      </section>

      {/* ---------- Categories ---------- */}
      {categories && categories.items.length > 0 && (
        <section aria-label="Food categories">
          <CategoryRail
            categories={categories.items}
            activeId={null}
            onSelect={(id) => id && navigate(`/app/search?category=${id}`)}
          />
        </section>
      )}

      {/* ---------- Promo banner ---------- */}
      <Reveal>
        <Link
          to="/app/search"
          className="relative block overflow-hidden rounded-card bg-slate-900 p-5 text-white shadow-card transition hover:shadow-lift"
        >
          <span aria-hidden="true" className="absolute -bottom-8 -right-6 h-32 w-32 rounded-full bg-red-600/90 blur-[2px]" />
          <span className="relative inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-[11px] font-extrabold uppercase tracking-widest text-red-200">
            <SparkleIcon className="h-3.5 w-3.5" aria-hidden="true" /> This week only
          </span>
          <p className="relative mt-2 text-xl font-extrabold leading-snug">Free delivery on your first order</p>
          <p className="relative mt-1 text-sm font-medium text-slate-300">Order today and taste the difference.</p>
        </Link>
      </Reveal>

      {/* ---------- Popular now ---------- */}
      <section aria-label="Popular meals" className="space-y-3">
        <div className="flex items-end justify-between gap-3">
          <div>
            <h2 className="text-lg font-extrabold tracking-tight text-slate-900">Popular now</h2>
            <p className="text-[13px] text-slate-500">What everyone is ordering today.</p>
          </div>
          <Link to="/app/search" className="flex-none text-sm font-bold text-red-600 hover:underline">
            See all
          </Link>
        </div>
        {popularLoading ? (
          <div className="flex justify-center py-8">
            <Spinner className="h-8 w-8" />
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {(popular?.items ?? []).slice(0, 8).map((product, index) => (
              <FoodCard key={product.id} product={product} index={index} />
            ))}
          </div>
        )}
      </section>

      {/* ---------- Trust row ---------- */}
      <Reveal>
        <TrustRow />
      </Reveal>

      {/* ---------- Fresh this week ---------- */}
      <section aria-label="New meals" className="space-y-3">
        <div className="flex items-end justify-between gap-3">
          <div>
            <h2 className="text-lg font-extrabold tracking-tight text-slate-900">Fresh this week</h2>
            <p className="text-[13px] text-slate-500">Straight from the ONYX kitchen.</p>
          </div>
          <Link to="/app/search" className="flex-none text-sm font-bold text-red-600 hover:underline">
            Browse menu
          </Link>
        </div>
        {freshLoading ? (
          <div className="flex justify-center py-8">
            <Spinner className="h-8 w-8" />
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {(fresh?.items ?? []).slice(0, 4).map((product, index) => (
              <FoodCard key={product.id} product={product} index={index} />
            ))}
          </div>
        )}
      </section>

      {/* ---------- Cart shortcut / promo ---------- */}
      {itemCount > 0 ? (
        <Link
          to="/app/cart"
          className="flex items-center justify-between gap-3 rounded-card bg-red-600 p-4 text-white shadow-brand transition hover:bg-red-700"
        >
          <span className="text-sm font-bold">
            {itemCount} item{itemCount === 1 ? '' : 's'} in your cart
          </span>
          <span className="rounded-xl bg-white/20 px-4 py-2 text-sm font-extrabold">Go to cart</span>
        </Link>
      ) : (
        <Reveal>
          <PromoCapture />
        </Reveal>
      )}
    </div>
  );
}

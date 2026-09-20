import { useEffect, useMemo, useRef, useState } from 'react';
import { useInfiniteQuery, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import type { CategoryDTO, Paginated, ProductDTO } from '@delivery/shared';
import { formatMoney } from '@delivery/shared';
import { api, mediaUrl, qs } from '../../lib/api';
import { useCart } from '../../lib/cart';
import { toast } from '../../lib/realtime';
import { HeartIcon, ImageIcon } from '../../components/icons';
import { EmptyState, Input, Select, Spinner } from '../../components/ui';

type Sort = 'newest' | 'popular' | 'price_asc' | 'price_desc' | 'name_asc';

export function Menu() {
  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [sort, setSort] = useState<Sort>('newest');
  const sentinel = useRef<HTMLDivElement | null>(null);
  const queryClient = useQueryClient();
  const { add } = useCart();

  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(search.trim()), 350);
    return () => window.clearTimeout(timer);
  }, [search]);

  const { data: categories } = useQuery({
    queryKey: ['categories'],
    queryFn: () => api.get<Paginated<CategoryDTO>>('/categories?pageSize=50&withProductsOnly=true'),
    staleTime: 60_000,
  });

  const { data: favoriteIds } = useQuery({
    queryKey: ['favorite-ids'],
    queryFn: () => api.get<{ productIds: string[] }>('/favorites/ids'),
    staleTime: 60_000,
  });

  const products = useInfiniteQuery({
    queryKey: ['products', debounced, categoryId, sort],
    queryFn: ({ pageParam, signal }) =>
      api.get<Paginated<ProductDTO>>(
        `/products${qs({ page: pageParam as number, pageSize: 12, q: debounced || undefined, categoryId: categoryId ?? undefined, sort })}`,
        signal,
      ),
    initialPageParam: 1,
    getNextPageParam: (last) => (last.hasMore ? last.page + 1 : undefined),
  });

  // Touch-first infinite scrolling.
  useEffect(() => {
    const node = sentinel.current;
    if (!node) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && products.hasNextPage && !products.isFetchingNextPage) {
          void products.fetchNextPage();
        }
      },
      { rootMargin: '400px' },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [products.hasNextPage, products.isFetchingNextPage, products.fetchNextPage]);

  const items = useMemo(() => products.data?.pages.flatMap((page) => page.items) ?? [], [products.data]);
  const favorites = useMemo(() => new Set(favoriteIds?.productIds ?? []), [favoriteIds]);

  const toggleFavorite = async (product: ProductDTO) => {
    const wasFavorite = favorites.has(product.id);
    try {
      if (wasFavorite) await api.del(`/favorites/${product.id}`);
      else await api.post(`/favorites/${product.id}`);
      void queryClient.invalidateQueries({ queryKey: ['favorite-ids'] });
      toast(wasFavorite ? `Removed "${product.name}" from favorites` : `Saved "${product.name}" to favorites`, 'success');
    } catch (error) {
      toast(error instanceof Error ? error.message : 'Could not update favorites', 'error');
    }
  };

  return (
    <div className="space-y-4">
      <div className="space-y-3">
        <Input
          type="search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search meals, drinks, snacks…"
          aria-label="Search products"
        />
        <div className="flex items-center gap-2">
          <Select value={sort} onChange={(event) => setSort(event.target.value as Sort)} className="max-w-44" aria-label="Sort products">
            <option value="newest">Newest first</option>
            <option value="popular">Most popular</option>
            <option value="price_asc">Price: low to high</option>
            <option value="price_desc">Price: high to low</option>
            <option value="name_asc">Name A → Z</option>
          </Select>
          <div className="flex flex-1 gap-2 overflow-x-auto pb-1">
            <Chip active={categoryId === null} onClick={() => setCategoryId(null)}>
              All
            </Chip>
            {(categories?.items ?? []).map((category) => (
              <Chip key={category.id} active={categoryId === category.id} onClick={() => setCategoryId(category.id)}>
                {category.name}
              </Chip>
            ))}
          </div>
        </div>
      </div>

      {products.isLoading ? (
        <div className="flex justify-center py-16">
          <Spinner className="h-8 w-8" />
        </div>
      ) : items.length === 0 ? (
        <EmptyState title="No products match" hint="Try a different search or category — the kitchen is always adding more." />
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {items.map((product) => (
            <ProductCard
              key={product.id}
              product={product}
              favorite={favorites.has(product.id)}
              onFavorite={() => void toggleFavorite(product)}
              onAdd={() => {
                add(product);
                toast(`Added ${product.name}`, 'success');
              }}
            />
          ))}
        </div>
      )}

      <div ref={sentinel} className="h-4" />
      {products.isFetchingNextPage && (
        <div className="flex justify-center py-4">
          <Spinner />
        </div>
      )}
    </div>
  );
}

function ProductCard({ product, favorite, onFavorite, onAdd }: { product: ProductDTO; favorite: boolean; onFavorite: () => void; onAdd: () => void }) {
  const image = mediaUrl(product.imageUrl);
  const soldOut = !product.isAvailable || product.stock <= 0;

  return (
    <div className="relative flex flex-col overflow-hidden rounded-3xl border border-slate-200 bg-white">
      <button
        onClick={onFavorite}
        aria-label={favorite ? 'Remove from favorites' : 'Add to favorites'}
        className="absolute right-2 top-2 z-10 flex h-10 w-10 items-center justify-center rounded-full bg-white/90 text-slate-500 shadow-sm backdrop-blur transition hover:text-red-600"
      >
        <HeartIcon className="h-5 w-5" filled={favorite} />
      </button>
      <Link to={`/app/product/${product.id}`} className="block aspect-square bg-slate-100/60">
        {image ? (
          <img src={image} alt={product.name} loading="lazy" className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-slate-300">
            <ImageIcon className="h-10 w-10" />
          </div>
        )}
        <div className="absolute left-2 top-2 flex gap-1">
          {product.isPopular && <Badge className="bg-red-600 text-white">Popular</Badge>}
          {product.isNew && <Badge className="bg-red-600/90 text-white">New</Badge>}
        </div>
      </Link>
      <div className="flex flex-1 flex-col gap-2 p-3">
        <Link to={`/app/product/${product.id}`} className="line-clamp-2 text-sm font-bold leading-snug text-slate-900">
          {product.name}
        </Link>
        <p className="text-sm text-slate-500">{product.prepTimeMinutes} min prep</p>
        <div className="mt-auto flex items-center justify-between gap-2">
          <span className="text-sm font-extrabold text-red-600">{formatMoney(product.price)}</span>
          <button
            onClick={onAdd}
            disabled={soldOut}
            className="flex h-10 w-10 items-center justify-center rounded-2xl bg-red-600 text-lg font-bold text-white disabled:opacity-40"
            aria-label={soldOut ? 'Sold out' : `Add ${product.name} to cart`}
          >
            +
          </button>
        </div>
        {soldOut && <p className="text-sm font-semibold text-red-700">Sold out</p>}
      </div>
    </div>
  );
}

function Badge({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <span className={`rounded-full px-2 py-0.5 text-xs font-extrabold uppercase tracking-wide ${className}`}>{children}</span>;
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={
        active
          ? 'shrink-0 rounded-full bg-red-600 px-4 py-2 text-sm font-bold text-white'
          : 'shrink-0 rounded-full border border-slate-200 bg-slate-100 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-200'
      }
    >
      {children}
    </button>
  );
}

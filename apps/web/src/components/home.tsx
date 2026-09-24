import type { ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import type { SettingsDTO } from '@delivery/shared';
import { formatMoney } from '@delivery/shared';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useGuestGate } from '../lib/guest';
import { loadDeliveryLocation } from '../lib/prefs';
import { BikeIcon, ClockIcon, LeafIcon, MapPinIcon, ShieldIcon } from './icons';

/** Compact location + ETA strip shown under the customer header. */
export function DeliveryStatusBar({ etaMinutes = 25 }: { etaMinutes?: number }) {
  const location = loadDeliveryLocation();
  const { data } = useQuery({
    queryKey: ['settings'],
    queryFn: () => api.get<{ settings: SettingsDTO }>('/settings'),
    staleTime: 300_000,
  });
  const fee = data?.settings.deliveryFee;
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[13px] font-medium text-slate-500">
      <span className="inline-flex min-w-0 items-center gap-1.5">
        {/* Green = location / availability accent */}
        <MapPinIcon className="h-4 w-4 flex-none text-green-600" aria-hidden="true" />
        <span className="truncate">{location?.label ?? 'Mallam, Accra'}</span>
      </span>
      <span className="inline-flex items-center gap-1.5">
        <ClockIcon className="h-4 w-4 flex-none text-red-600" aria-hidden="true" />
        {etaMinutes} min
      </span>
      {fee !== undefined && (
        <span className="inline-flex items-center gap-1.5">
          <BikeIcon className="h-4 w-4 flex-none text-slate-400" aria-hidden="true" />
          Delivery {formatMoney(fee)}
        </span>
      )}
      <span className="badge-fresh">
        <LeafIcon className="h-3 w-3" aria-hidden="true" />
        Available today
      </span>
    </div>
  );
}

/**
 * Horizontal category pill rail with icons. Active states alternate the two
 * brand colours: "All" is red, individual food categories are green — food
 * categories read as freshness, the global selection reads as action.
 */
export function CategoryRail<T extends { id: string; name: string }>({
  categories,
  activeId,
  onSelect,
  iconFor,
}: {
  categories: T[];
  activeId: string | null;
  onSelect: (id: string | null) => void;
  iconFor?: (name: string) => ReactNode;
}) {
  return (
    <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 py-1" role="tablist" aria-label="Categories">
      <button
        type="button"
        role="tab"
        aria-selected={activeId === null}
        onClick={() => onSelect(null)}
        className={
          activeId === null
            ? 'flex flex-none items-center gap-2 rounded-full bg-red-600 px-4 py-2.5 text-sm font-bold text-white shadow-brand transition'
            : 'flex flex-none items-center gap-2 rounded-full bg-white px-4 py-2.5 text-sm font-semibold text-slate-600 shadow-soft ring-1 ring-inset ring-slate-200/70 hover:text-slate-900'
        }
      >
        All
      </button>
      {categories.map((category) => {
        const active = activeId === category.id;
        return (
          <button
            key={category.id}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onSelect(active ? null : category.id)}
            className={
              active
                ? 'flex flex-none items-center gap-2 rounded-full bg-green-600 px-4 py-2.5 text-sm font-bold text-white shadow-green transition'
                : 'flex flex-none items-center gap-2 rounded-full bg-white px-4 py-2.5 text-sm font-semibold text-slate-600 shadow-soft ring-1 ring-inset ring-slate-200/70 hover:text-slate-900'
            }
          >
            {iconFor?.(category.name)}
            {category.name}
          </button>
        );
      })}
    </div>
  );
}

/** Trust row: alternating red and green accents across the three promises. */
export function TrustRow() {
  const items = [
    { icon: <BikeIcon className="h-5 w-5" aria-hidden="true" />, label: 'Live order tracking', tone: 'text-red-600' },
    { icon: <LeafIcon className="h-5 w-5" aria-hidden="true" />, label: 'Kitchen-fresh meals', tone: 'text-green-600' },
    { icon: <ShieldIcon className="h-5 w-5" aria-hidden="true" />, label: 'Support on every order', tone: 'text-red-600' },
  ];
  return (
    <div className="grid grid-cols-3 gap-2">
      {items.map((item) => (
        <div
          key={item.label}
          className="flex flex-col items-center gap-1.5 rounded-2xl border border-slate-200/70 bg-white px-2 py-3 text-center text-slate-500"
        >
          <span className={item.tone}>{item.icon}</span>
          <span className="text-[11px] font-bold leading-tight">{item.label}</span>
        </div>
      ))}
    </div>
  );
}

/**
 * Guest-only conversion row: a red promotional surface with green + white
 * actions. Signed-in users never see sign-up prompts again — the row simply
 * disappears for them.
 */
export function PromoCapture() {
  const { user } = useAuth();
  const { openSheet } = useGuestGate();
  if (user) return null;

  return (
    <div className="relative overflow-hidden rounded-2xl bg-red-600 p-2 pl-4 text-white shadow-brand">
      <span className="duo-blob duo-blob-green -right-6 -top-8 h-20 w-20" aria-hidden="true" />
      <div className="relative flex items-center gap-2">
        <p className="min-w-0 flex-1 truncate text-sm font-bold">
          New to Maame’s Waakye App? Sign in to order
        </p>
        <div className="flex flex-none gap-2">
          <button
            type="button"
            onClick={openSheet}
            className="rounded-xl bg-white px-3.5 py-2.5 text-sm font-extrabold text-red-700 transition hover:bg-red-50 active:scale-[0.97]"
          >
            Sign in
          </button>
          <Link
            to="/register"
            className="rounded-xl bg-green-600 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-green-700 active:scale-[0.97]"
          >
            Sign up
          </Link>
        </div>
      </div>
    </div>
  );
}

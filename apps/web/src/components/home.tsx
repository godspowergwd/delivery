import type { FormEvent, ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import type { SettingsDTO } from '@delivery/shared';
import { formatMoney } from '@delivery/shared';
import { api } from '../lib/api';
import { loadDeliveryLocation } from '../lib/prefs';
import { BikeIcon, ClockIcon, MapPinIcon, ShieldIcon, StarIcon } from './icons';

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
        <MapPinIcon className="h-4 w-4 flex-none text-red-600" aria-hidden="true" />
        <span className="truncate">{location?.label ?? 'Accra, Ghana'}</span>
      </span>
      <span className="inline-flex items-center gap-1.5">
        <ClockIcon className="h-4 w-4 flex-none text-slate-400" aria-hidden="true" />
        {etaMinutes} min
      </span>
      {fee !== undefined && (
        <span className="inline-flex items-center gap-1.5">
          <BikeIcon className="h-4 w-4 flex-none text-slate-400" aria-hidden="true" />
          Delivery {formatMoney(fee)}
        </span>
      )}
    </div>
  );
}

/** Horizontal category pill rail with icons. */
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
            ? 'flex flex-none items-center gap-2 rounded-full bg-slate-900 px-4 py-2.5 text-sm font-bold text-white shadow-soft'
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
                ? 'flex flex-none items-center gap-2 rounded-full bg-red-600 px-4 py-2.5 text-sm font-bold text-white shadow-brand-soft'
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

/** Trust row: live tracking, kitchen-fresh, support. */
export function TrustRow() {
  const items = [
    { icon: <BikeIcon className="h-5 w-5" aria-hidden="true" />, label: 'Live order tracking' },
    { icon: <StarIcon className="h-5 w-5" aria-hidden="true" />, label: 'Kitchen-fresh meals' },
    { icon: <ShieldIcon className="h-5 w-5" aria-hidden="true" />, label: 'Support on every order' },
  ];
  return (
    <div className="grid grid-cols-3 gap-2">
      {items.map((item) => (
        <div
          key={item.label}
          className="flex flex-col items-center gap-1.5 rounded-2xl bg-slate-50 px-2 py-3 text-center text-slate-500"
        >
          <span className="text-red-600">{item.icon}</span>
          <span className="text-[11px] font-bold leading-tight">{item.label}</span>
        </div>
      ))}
    </div>
  );
}

/** Email capture row reused on customer screens (promo-ready, no backend yet). */
export function PromoCapture() {
  const submit = (event: FormEvent) => event.preventDefault();
  return (
    <form
      onSubmit={submit}
      className="flex items-center gap-2 rounded-2xl bg-slate-900 p-2 pl-4 text-white shadow-card"
    >
      <p className="min-w-0 flex-1 truncate text-sm font-bold">Get GH₵10 off your first order</p>
      <Link
        to="/register"
        className="flex-none rounded-xl bg-red-600 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-red-700 active:scale-[0.97]"
      >
        Claim
      </Link>
    </form>
  );
}

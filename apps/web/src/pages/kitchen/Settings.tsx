import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import type { KitchenDriverDTO } from '@delivery/shared';
import { api } from '../../lib/api';
import { toast, useRealtimeSync } from '../../lib/realtime';
import { useRestaurantStatus } from '../../lib/restaurant-status';
import { RestaurantStatusCard } from '../../components/restaurant-status';
import { Button, Card } from '../../components/ui';
import {
  ArrowLeftIcon,
  CogIcon,
  PlusIcon,
  SparkleIcon,
  UserIcon,
  UsersIcon,
} from '../../components/icons';

/**
 * Kitchen Settings — the operational hub.
 *
 * Restaurant: open or close the kitchen (the switch customers feel instantly).
 * Driver Management: create driver accounts and manage the fleet.
 * Kitchen Preferences: reserved for future kitchen-only options.
 * Account: the link to the existing account/device settings page, untouched.
 */
export function KitchenSettings() {
  useRealtimeSync();
  const { status } = useRestaurantStatus();

  const { data } = useQuery({
    queryKey: ['kitchen-drivers'],
    queryFn: () => api.get<{ drivers: KitchenDriverDTO[] }>('/kitchen/drivers'),
    refetchInterval: 30_000,
  });

  const drivers = data?.drivers ?? [];
  const online = drivers.filter((driver) => driver.isOnline).length;
  const active = drivers.filter((driver) => driver.isActive).length;

  const toggleStatus = async (next: boolean): Promise<void> => {
    try {
      await api.post('/kitchen/status', { open: next });
      toast(
        next
          ? 'Restaurant is open — customers can order again.'
          : 'Restaurant closed — new orders are blocked.',
        next ? 'success' : 'warning',
      );
    } catch (error) {
      toast(
        error instanceof Error ? error.message : 'Could not change the restaurant status.',
        'error',
      );
    }
  };

  return (
    <div className="space-y-5">
      <header className="space-y-2">
        <Link
          to="/kitchen"
          className="inline-flex min-h-9 items-center gap-1.5 text-sm font-bold text-slate-500 transition hover:text-slate-800"
        >
          <ArrowLeftIcon className="h-4 w-4" aria-hidden="true" />
          Back to orders
        </Link>
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight text-slate-900">Kitchen Settings</h1>
          <p className="text-sm text-slate-500">Restaurant status, drivers and kitchen preferences.</p>
        </div>
      </header>

      {/* ---------- Restaurant ---------- */}
      <section className="space-y-2">
        <h2 className="px-1 text-[13px] font-extrabold uppercase tracking-wide text-slate-400">
          Restaurant
        </h2>
        <RestaurantStatusCard status={status} onToggle={(next) => void toggleStatus(next)} />
      </section>

      {/* ---------- Driver management ---------- */}
      <section className="space-y-2">
        <h2 className="px-1 text-[13px] font-extrabold uppercase tracking-wide text-slate-400">
          Driver Management
        </h2>
        <Card className="space-y-4">
          <div className="flex items-center gap-3">
            <span className="flex h-11 w-11 flex-none items-center justify-center rounded-2xl bg-green-50 text-green-700">
              <UsersIcon className="h-5 w-5" aria-hidden="true" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-[15px] font-extrabold text-slate-900">Delivery drivers</p>
              <p className="truncate text-[13px] text-slate-500">
                {drivers.length === 0
                  ? 'No drivers yet — create the first account.'
                  : `${drivers.length} driver${drivers.length === 1 ? '' : 's'} · ${active} active · ${online} online now`}
              </p>
            </div>
          </div>

          <div className="grid gap-2 sm:grid-cols-2">
            <Link to="/kitchen/drivers/new" className="block">
              <Button block size="lg">
                <PlusIcon className="h-5 w-5" aria-hidden="true" />
                Create Driver
              </Button>
            </Link>
            <Link to="/kitchen/drivers" className="block">
              <Button block size="lg" variant="secondary">
                <UsersIcon className="h-5 w-5" aria-hidden="true" />
                Driver List
              </Button>
            </Link>
          </div>

          <p className="rounded-xl bg-slate-50 px-3 py-2 text-[12px] font-medium text-slate-500">
            New drivers can sign in immediately with the username and password you issue. Drivers
            with delivery history can be disabled, never deleted.
          </p>
        </Card>
      </section>

      {/* ---------- Kitchen preferences (future-ready) ---------- */}
      <section className="space-y-2">
        <h2 className="px-1 text-[13px] font-extrabold uppercase tracking-wide text-slate-400">
          Kitchen Preferences
        </h2>
        <Card className="space-y-3">
          <div className="flex items-center gap-3">
            <span className="flex h-11 w-11 flex-none items-center justify-center rounded-2xl bg-red-50 text-red-600">
              <SparkleIcon className="h-5 w-5" aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <p className="text-[15px] font-extrabold text-slate-900">
                More kitchen controls are coming
              </p>
              <p className="text-[13px] text-slate-500">
                Prep-time targets, printer setup and shift hand-over will live here.
              </p>
            </div>
          </div>
          <p className="rounded-xl bg-green-50 px-3 py-2 text-[12px] font-semibold text-green-800">
            Nothing to configure yet — the kitchen keeps running exactly as it does today.
          </p>
        </Card>
      </section>

      {/* ---------- Account (existing settings are kept) ---------- */}
      <section className="space-y-2">
        <h2 className="px-1 text-[13px] font-extrabold uppercase tracking-wide text-slate-400">
          More
        </h2>
        <Card className="!p-3">
          <Link
            to="/settings"
            className="flex w-full items-center gap-3 rounded-2xl px-3 py-3 text-[15px] font-semibold text-slate-700 transition hover:bg-slate-100"
          >
            <UserIcon className="h-5 w-5 text-slate-400" aria-hidden="true" />
            Account &amp; device settings
          </Link>
          <Link
            to="/kitchen/products"
            className="flex w-full items-center gap-3 rounded-2xl px-3 py-3 text-[15px] font-semibold text-slate-700 transition hover:bg-slate-100"
          >
            <CogIcon className="h-5 w-5 text-slate-400" aria-hidden="true" />
            Menu &amp; products
          </Link>
        </Card>
      </section>
    </div>
  );
}
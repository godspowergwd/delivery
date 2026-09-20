import { clsx } from 'clsx';
import { useEffect, useState, type ComponentType } from 'react';
import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom';
import type { Role } from '@delivery/shared';
import { ROLE_LABELS } from '@delivery/shared';
import { useAuth } from '../lib/auth';
import { useCart } from '../lib/cart';
import { applyPwaUpdate } from '../lib/pwa';
import { isInstalledDisplay } from '../lib/pwa-display';
import { Button } from './ui';
import { NotificationBell } from './NotificationBell';
import {
  CartIcon,
  ChartIcon,
  ClockIcon,
  CogIcon,
  GridIcon,
  HomeIcon,
  LogOutIcon,
  MapIcon,
  PackageIcon,
  ReceiptIcon,
  SearchIcon,
  TruckIcon,
  UserIcon,
  FlameIcon,
} from './icons';

/** Shows the native install button once the browser fires beforeinstallprompt. */
export function InstallButton() {
  const [deferred, setDeferred] = useState<Event | null>(null);
  const [installed, setInstalled] = useState(() => isInstalledDisplay());

  useEffect(() => {
    const onPrompt = (event: Event) => {
      event.preventDefault();
      setDeferred(event);
    };
    const onInstalled = () => {
      setInstalled(true);
      setDeferred(null);
    };
    window.addEventListener('beforeinstallprompt', onPrompt);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  if (installed || !deferred) return null;
  const prompt = deferred as unknown as { prompt: () => Promise<void> };

  return (
    <Button
      size="sm"
      variant="outline"
      onClick={() => {
        void prompt.prompt();
        setDeferred(null);
      }}
    >
      Install app
    </Button>
  );
}

/** Reloads the app the moment a new service worker version is ready. */
export function UpdateToast() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const show = () => setVisible(true);
    window.addEventListener('ds:pwa-update-available', show);
    return () => window.removeEventListener('ds:pwa-update-available', show);
  }, []);

  if (!visible) return null;
  return (
    <div className="fixed inset-x-0 bottom-24 z-[70] mx-auto flex w-[min(92%,26rem)] items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-xl lg:bottom-8">
      <p className="text-sm font-medium text-slate-700">A new version is ready.</p>
      <div className="flex gap-2">
        <Button size="sm" onClick={() => { applyPwaUpdate(); setVisible(false); }}>Update now</Button>
        <Button size="sm" variant="ghost" onClick={() => setVisible(false)}>Later</Button>
      </div>
    </div>
  );
}

export function OfflineBar() {
  const [offline, setOffline] = useState(() => !navigator.onLine);
  useEffect(() => {
    const on = () => setOffline(false);
    const off = () => setOffline(true);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, []);
  if (!offline) return null;
  return (
    <div className="sticky top-0 z-40 bg-red-600 py-1.5 text-center text-sm font-bold text-white">
      Offline — showing cached data. Actions will sync when you reconnect.
    </div>
  );
}

export interface NavItem {
  to: string;
  label: string;
  icon: ComponentType<{ className?: string }>;
  /** High-priority sections get a stronger visual treatment. */
  emphasize?: boolean;
  /** Shows the live cart count badge. */
  cart?: boolean;
}

/**
 * Navigation per role. Mobile shows the first five items as the bottom bar,
 * desktop renders the same destinations in the left sidebar.
 */
const NAV: Record<Role, NavItem[]> = {
  CUSTOMER: [
    { to: '/app/home', label: 'Home', icon: HomeIcon },
    { to: '/app/search', label: 'Search', icon: SearchIcon },
    { to: '/app/cart', label: 'Cart', icon: CartIcon, cart: true },
    { to: '/app/orders', label: 'Orders', icon: ReceiptIcon },
    { to: '/app/profile', label: 'Settings', icon: CogIcon },
  ],
  KITCHEN: [
    { to: '/kitchen', label: 'Queue', icon: FlameIcon, emphasize: true },
    { to: '/kitchen/history', label: 'History', icon: ClockIcon },
    { to: '/settings', label: 'Settings', icon: CogIcon },
  ],
  DRIVER: [
    { to: '/driver/deliveries', label: 'Deliveries', icon: TruckIcon, emphasize: true },
    { to: '/driver/map', label: 'Map', icon: MapIcon },
    { to: '/driver/profile', label: 'Profile', icon: UserIcon },
  ],
  ADMIN: [
    { to: '/admin', label: 'Dashboard', icon: GridIcon },
    { to: '/admin/orders', label: 'Orders', icon: ReceiptIcon, emphasize: true },
    { to: '/admin/products', label: 'Products', icon: PackageIcon },
    { to: '/admin/reports', label: 'Reports', icon: ChartIcon },
    { to: '/admin/settings', label: 'Settings', icon: CogIcon },
  ],
};

function isExactRoute(to: string): boolean {
  return to === '/admin' || to === '/kitchen' || to === '/app/home' || to === '/driver/deliveries';
}

/** Desktop sidebar destination with a clear red active state. */
function SidebarLink({ item, cartCount }: { item: NavItem; cartCount: number }) {
  const Icon = item.icon;
  return (
    <NavLink
      to={item.to}
      end={isExactRoute(item.to)}
      className={({ isActive }) =>
        clsx(
          'flex items-center gap-3 rounded-xl px-3.5 transition',
          item.emphasize ? 'py-3.5 text-base font-bold' : 'py-3 text-[15px] font-semibold',
          isActive
            ? 'bg-red-600 text-white shadow-sm shadow-red-600/25'
            : item.emphasize
              ? 'text-red-700 hover:bg-red-50'
              : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900',
        )
      }
    >
      {({ isActive }) => (
        <>
          <Icon className={clsx('flex-none', item.emphasize ? 'h-6 w-6' : 'h-5 w-5', isActive ? 'text-white' : item.emphasize ? 'text-red-600' : 'text-slate-400')} />
          <span className="flex-1 truncate">{item.label}</span>
          {item.cart && cartCount > 0 && (
            <span className={clsx('rounded-full px-2 py-0.5 text-sm font-bold', isActive ? 'bg-white text-red-700' : 'bg-red-600 text-white')}>
              {cartCount}
            </span>
          )}
        </>
      )}
    </NavLink>
  );
}

/** Mobile bottom destination — large touch target, red active state. */
function BottomLink({ item, cartCount }: { item: NavItem; cartCount: number }) {
  const Icon = item.icon;
  return (
    <NavLink
      to={item.to}
      end={isExactRoute(item.to)}
      className={({ isActive }) =>
        clsx(
          'relative flex min-w-0 flex-1 flex-col items-center justify-center gap-1 px-1 py-2.5 transition',
          isActive ? 'text-red-600' : 'text-slate-500',
        )
      }
    >
      {({ isActive }) => (
        <>
          <span
            className={clsx(
              'absolute inset-x-4 top-0 h-0.5 rounded-full',
              isActive ? 'bg-red-600' : 'bg-transparent',
            )}
          />
          <span className="relative">
            <Icon className={clsx(item.emphasize ? 'h-10 w-10' : 'h-6 w-6')} />
            {item.cart && cartCount > 0 && (
              <span className="absolute -right-2.5 -top-2 flex h-5 min-w-5 items-center justify-center rounded-full bg-red-600 px-1 text-sm font-bold text-white">
                {cartCount}
              </span>
            )}
          </span>
          <span className={clsx('max-w-full truncate text-[11.5px]', isActive || item.emphasize ? 'font-bold' : 'font-semibold')}>
            {item.label}
          </span>
        </>
      )}
    </NavLink>
  );
}

export function AppShell() {
  const { user, logout } = useAuth();
  const { itemCount } = useCart();
  const navigate = useNavigate();
  const items = user ? NAV[user.role] : [];
  const roleLabel = user ? ROLE_LABELS[user.role] : '';

  const signOut = () => {
    void logout().then(() => navigate('/login'));
  };

  return (
    <div className="min-h-dvh bg-white lg:flex">
      {/* Desktop sidebar */}
      <aside className="sticky top-0 hidden h-dvh w-64 flex-none flex-col border-r border-slate-200 bg-white lg:flex xl:w-72">
        <div className="flex items-center gap-3 px-5 pb-5 pt-6">
          <img src={`${import.meta.env.BASE_URL}logo.svg`} alt="" className="h-11 w-11 rounded-2xl" />
          <div className="min-w-0">
            <p className="truncate text-base font-extrabold text-slate-900">Delivery System</p>
            <p className="truncate text-xs font-medium text-slate-500">
              {roleLabel}
              {user ? ` · ${user.name}` : ''}
            </p>
          </div>
        </div>

        <nav className="flex-1 space-y-1 overflow-y-auto px-3 pb-4" aria-label="Main navigation">
          {items.map((item) => (
            <SidebarLink key={item.to} item={item} cartCount={itemCount} />
          ))}
        </nav>

        <div className="space-y-3 border-t border-slate-200 px-4 py-4">
          <InstallButton />
          <button
            onClick={signOut}
            className="flex w-full items-center gap-3 rounded-xl px-3.5 py-3 text-[15px] font-semibold text-slate-600 transition hover:bg-slate-100 hover:text-slate-900"
          >
            <LogOutIcon className="h-5 w-5 flex-none text-slate-400" />
            Sign out
          </button>
        </div>
      </aside>

      <div className="flex min-h-dvh min-w-0 flex-1 flex-col">
        {/* Mobile top bar */}
        <header className="pt-safe sticky top-0 z-40 border-b border-slate-200 bg-white/95 px-4 backdrop-blur lg:hidden">
          <div className="flex items-center justify-between gap-3 pb-3 pt-2">
            <Link to="/" className="flex min-w-0 items-center gap-2.5">
              <img src={`${import.meta.env.BASE_URL}logo.svg`} alt="" className="h-10 w-10 rounded-xl" />
              <div className="min-w-0">
                <p className="truncate text-[15px] font-extrabold leading-tight text-slate-900">Delivery System</p>
                <p className="truncate text-xs leading-tight text-slate-500">
                  {user ? `${roleLabel} · ${user.name}` : 'Fresh food, delivered fast'}
                </p>
              </div>
            </Link>
            <div className="flex flex-none items-center gap-2">
              <NotificationBell />
              <button
                onClick={signOut}
                aria-label="Sign out"
                className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-100 text-slate-500 transition hover:bg-slate-200 hover:text-slate-700"
              >
                <LogOutIcon className="h-5 w-5" />
              </button>
            </div>
          </div>
        </header>

        {/* Desktop top bar */}
        <div className="sticky top-0 z-30 hidden items-center justify-end gap-3 border-b border-slate-200 bg-white/95 px-8 py-3 backdrop-blur lg:flex">
          <InstallButton />
          <NotificationBell />
        </div>

        <OfflineBar />

        <main className="flex-1 px-4 py-5 pb-28 lg:px-8 lg:py-7 lg:pb-12">
          <Outlet />
        </main>

        {/* Mobile bottom navigation */}
        {items.length > 0 && (
          <nav
            className="pb-safe fixed inset-x-0 bottom-0 z-40 border-t border-slate-200 bg-white shadow-[0_-4px_16px_rgba(15,23,42,0.06)] lg:hidden"
            aria-label="Primary navigation"
          >
            <div className="flex items-stretch justify-around">
              {items.slice(0, 5).map((item) => (
                <BottomLink key={item.to} item={item} cartCount={itemCount} />
              ))}
            </div>
          </nav>
        )}

        <UpdateToast />
      </div>
    </div>
  );
}

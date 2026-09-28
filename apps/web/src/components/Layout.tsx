import { clsx } from 'clsx';
import { useEffect, useState, type ComponentType } from 'react';
import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom';
import type { Role } from '@delivery/shared';
import { ROLE_LABELS } from '@delivery/shared';
import { useAuth } from '../lib/auth';
import { useCart } from '../lib/cart';
import { useGuestGate } from '../lib/guest';
import { applyPwaUpdate } from '../lib/pwa';
import { isInstalledDisplay } from '../lib/pwa-display';
import { Button } from './ui';
import { NotificationBell } from './NotificationBell';
import {
  CartIcon,
  ChartIcon,
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
  WalletIcon,
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
    <div
      className="sticky top-0 z-40 flex items-center justify-center gap-2 bg-red-600 py-1.5 text-center text-sm font-bold text-white"
      role="status"
    >
      <span className="h-2 w-2 rounded-full bg-green-300" aria-hidden="true" />
      Offline — showing cached data. Actions will sync when you reconnect.
    </div>
  );
}

export interface NavItem {
  to: string;
  label: string;
  icon: ComponentType<{ className?: string }>;
  /**
   * Brand colour of the active state. Red and green alternate across every
   * role's navigation so neither colour dominates the shell.
   */
  tone: 'red' | 'green';
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
    { to: '/app/home', label: 'Home', icon: HomeIcon, tone: 'red' },
    { to: '/app/menu', label: 'Menu', icon: SearchIcon, tone: 'green' },
    { to: '/app/orders', label: 'Orders', icon: ReceiptIcon, tone: 'red' },
    { to: '/app/track', label: 'Track', icon: TruckIcon, tone: 'green' },
    { to: '/app/cart', label: 'Cart', icon: CartIcon, cart: true, tone: 'red' },
    { to: '/app/profile', label: 'Account', icon: UserIcon, tone: 'green' },
  ],
  KITCHEN: [
    { to: '/kitchen', label: 'Queue', icon: FlameIcon, tone: 'red', emphasize: true },
    { to: '/kitchen/products', label: 'Products', icon: PackageIcon, tone: 'green' },
    { to: '/settings', label: 'Settings', icon: CogIcon, tone: 'red' },
  ],
  DRIVER: [
    { to: '/driver/deliveries', label: 'Deliveries', icon: TruckIcon, tone: 'red', emphasize: true },
    { to: '/driver/map', label: 'Map', icon: MapIcon, tone: 'green' },
    { to: '/driver/earnings', label: 'Earnings', icon: WalletIcon, tone: 'red' },
    { to: '/driver/profile', label: 'Profile', icon: UserIcon, tone: 'green' },
  ],
  ADMIN: [
    { to: '/admin', label: 'Dashboard', icon: GridIcon, tone: 'red' },
    { to: '/admin/orders', label: 'Orders', icon: ReceiptIcon, tone: 'green', emphasize: true },
    { to: '/admin/products', label: 'Products', icon: PackageIcon, tone: 'red' },
    { to: '/admin/reports', label: 'Reports', icon: ChartIcon, tone: 'green' },
    { to: '/admin/settings', label: 'Settings', icon: CogIcon, tone: 'red' },
  ],
};

function isExactRoute(to: string): boolean {
  return to === '/admin' || to === '/kitchen' || to === '/app/home' || to === '/driver/deliveries';
}

/** Active/idle classes per tone — equal red and green presence in the nav. */
const SIDEBAR_ACTIVE: Record<NavItem['tone'], string> = {
  red: 'bg-red-600 text-white shadow-brand-soft',
  green: 'bg-green-600 text-white shadow-green',
};
const SIDEBAR_IDLE_ACCENT: Record<NavItem['tone'], string> = {
  red: 'text-red-700 hover:bg-red-50',
  green: 'text-green-700 hover:bg-green-50',
};
const SIDEBAR_IDLE_ICON: Record<NavItem['tone'], string> = {
  red: 'text-red-600',
  green: 'text-green-600',
};
const BOTTOM_ACTIVE: Record<NavItem['tone'], string> = {
  red: 'text-red-700',
  green: 'text-green-700',
};
const BOTTOM_INDICATOR: Record<NavItem['tone'], string> = {
  red: 'bg-red-700',
  green: 'bg-green-700',
};

/** Desktop sidebar destination with a balanced red/green active state. */
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
            ? SIDEBAR_ACTIVE[item.tone]
            : item.emphasize
              ? SIDEBAR_IDLE_ACCENT[item.tone]
              : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900',
        )
      }
    >
      {({ isActive }) => (
        <>
          <Icon
            className={clsx(
              'flex-none',
              item.emphasize ? 'h-6 w-6' : 'h-5 w-5',
              isActive
                ? 'text-white'
                : item.emphasize
                  ? SIDEBAR_IDLE_ICON[item.tone]
                  : 'text-slate-400',
            )}
          />
          <span className="flex-1 truncate">{item.label}</span>
          {item.cart && cartCount > 0 && (
            <span
              className={clsx(
                'rounded-full px-2 py-0.5 text-sm font-bold',
                isActive
                  ? item.tone === 'red'
                    ? 'bg-white text-red-700'
                    : 'bg-white text-green-700'
                  : 'bg-red-600 text-white',
              )}
            >
              {cartCount}
            </span>
          )}
        </>
      )}
    </NavLink>
  );
}

/** Mobile bottom destination — large touch target, red or green active state. */
function BottomLink({ item, cartCount }: { item: NavItem; cartCount: number }) {
  const Icon = item.icon;
  return (
    <NavLink
      to={item.to}
      end={isExactRoute(item.to)}
      className={({ isActive }) =>
        clsx(
          'relative flex min-w-0 flex-1 flex-col items-center justify-center gap-1 px-1 py-1.5 transition',
          isActive ? BOTTOM_ACTIVE[item.tone] : 'text-slate-500',
        )
      }
    >
      {({ isActive }) => (
        <>
          <span
            className={clsx(
              'absolute inset-x-4 top-0 h-0.5 rounded-full',
              isActive ? BOTTOM_INDICATOR[item.tone] : 'bg-transparent',
            )}
          />
          <span
            className={clsx(
              'relative flex items-center justify-center',
              item.cart
                ? 'h-12 w-12 rounded-full bg-red-600 text-white shadow-lg shadow-red-600/25'
                : 'h-7 w-7',
            )}
          >
            <Icon className={clsx(item.cart ? 'h-6 w-6' : item.emphasize ? 'h-7 w-7' : 'h-5 w-5')} />
            {item.cart && cartCount > 0 && (
              <span className="absolute -right-2.5 -top-2 flex h-5 min-w-5 items-center justify-center rounded-full bg-red-600 px-1 text-sm font-bold text-white">
                {cartCount}
              </span>
            )}
          </span>
          <span
            className={clsx(
              'max-w-full truncate text-[11.5px]',
              isActive || item.emphasize ? 'font-bold' : 'font-semibold',
            )}
          >
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
  const { openSheet } = useGuestGate();
  const navigate = useNavigate();
  // Guests browse the full customer storefront with the customer navigation.
  const items = user ? NAV[user.role] : NAV.CUSTOMER;
  const roleLabel = user ? ROLE_LABELS[user.role] : 'Guest browsing';

  const signOut = () => {
    void logout().then(() => navigate('/', { replace: true }));
  };

  return (
    <div className="min-h-dvh bg-white lg:flex">
      {/* Desktop sidebar */}
      <aside className="sticky top-0 hidden h-dvh w-64 flex-none flex-col border-r border-slate-200 bg-white lg:flex xl:w-72">
        <div className="flex items-center gap-3 px-5 pb-5 pt-6">
          <img src={`${import.meta.env.BASE_URL}brand/maame-waakye-onyx.png`} alt="Maame’s Waakye App" className="h-11 w-11 rounded-2xl" />
          <div className="min-w-0">
            <p className="truncate text-base font-extrabold text-slate-900">Maame’s Waakye App</p>
            <p className="truncate text-xs font-medium text-slate-500">
              <span className="font-extrabold uppercase tracking-wide text-red-600">ONYX</span>
              <span aria-hidden="true"> · </span>
              <span className="font-semibold text-green-700">{roleLabel}</span>
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
          {!user && (
            <div className="rounded-2xl duo-top bg-green-50 p-3">
              <p className="text-xs font-bold text-green-800">Fresh waakye, delivered hot</p>
              <p className="mt-0.5 text-xs text-green-700">Sign in to order and track live.</p>
            </div>
          )}
          <InstallButton />
          {user ? (
            <button
              onClick={signOut}
              className="flex w-full items-center gap-3 rounded-xl px-3.5 py-3 text-[15px] font-semibold text-slate-600 transition hover:bg-slate-100 hover:text-slate-900"
            >
              <LogOutIcon className="h-5 w-5 flex-none text-slate-400" />
              Sign out
            </button>
          ) : (
            <Button block onClick={openSheet}>
              <UserIcon className="h-4 w-4" aria-hidden="true" />
              Sign in
            </Button>
          )}
        </div>
      </aside>

      <div className="flex min-h-dvh min-w-0 flex-1 flex-col">
        {/* Mobile top bar */}
        <header className="pt-safe sticky top-0 z-40 border-b border-slate-200 bg-white/95 px-4 backdrop-blur lg:hidden">
          <div className="flex items-center justify-between gap-3 pb-3 pt-2">
            <Link to="/" className="flex min-w-0 items-center gap-2.5">
              <img src={`${import.meta.env.BASE_URL}brand/maame-waakye-onyx.png`} alt="Maame’s Waakye App" className="h-10 w-10 rounded-xl" />
              <div className="min-w-0">
                <p className="truncate text-[15px] font-extrabold leading-tight text-slate-900">Maame’s Waakye App</p>
                <p className="truncate text-[10px] font-extrabold uppercase tracking-[0.22em]">
                  <span className="text-red-600">ONYX</span>
                  <span className="text-green-700"> · fresh daily</span>
                </p>
              </div>
            </Link>
            <div className="flex flex-none items-center gap-2">
              {user && <NotificationBell />}
              {user ? (
                <button
                  onClick={signOut}
                  aria-label="Sign out"
                  className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-100 text-slate-500 transition hover:bg-slate-200 hover:text-slate-700"
                >
                  <LogOutIcon className="h-5 w-5" />
                </button>
              ) : (
                <Button size="sm" onClick={openSheet}>
                  Sign in
                </Button>
              )}
            </div>
          </div>
        </header>

        {/* Desktop top bar */}
        <div className="sticky top-0 z-30 hidden items-center justify-end gap-3 border-b border-slate-200 bg-white/95 px-8 py-3 backdrop-blur lg:flex">
          {!user && (
            <span className="badge-fresh mr-auto" role="status">
              Open today · delivering across Mallam & Gbawe
            </span>
          )}
          <InstallButton />
          {user ? (
            <NotificationBell />
          ) : (
            <Button size="sm" variant="outline" onClick={openSheet}>
              Sign in
            </Button>
          )}
        </div>

        <OfflineBar />

        <main className="flex-1 px-4 py-5 pb-28 lg:px-8 lg:py-7 lg:pb-12">
          <Outlet />
        </main>

        {/* Mobile bottom navigation */}
        {items.length > 0 && (
          <nav
            className="pb-safe fixed inset-x-2 bottom-2 z-40 rounded-[1.5rem] border border-slate-200 bg-white/95 shadow-lift backdrop-blur lg:hidden"
            aria-label="Primary navigation"
          >
            <div className="mx-auto flex w-full max-w-md items-stretch justify-around rounded-[1.25rem] bg-white/95 px-1">
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

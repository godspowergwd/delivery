import { ROLE_LABELS } from '@delivery/shared';
import { useAuth } from '../lib/auth';
import { Card } from '../components/ui';
import { InstallButton } from '../components/Layout';
import { LogOutIcon, UserIcon } from '../components/icons';

/**
 * Lightweight account surface for staff roles (Kitchen and other operators).
 * Shows existing session data, device installation and sign-out; admins have
 * the full business settings under /admin/settings.
 */
export function AccountSettings() {
  const { user, logout } = useAuth();

  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-2xl font-extrabold text-slate-900">Settings</h1>
        <p className="mt-1 text-[15px] text-slate-500">Your account and this device.</p>
      </header>

      <Card className="flex items-center gap-4">
        <span className="flex h-12 w-12 flex-none items-center justify-center rounded-xl bg-red-50 text-red-600">
          <UserIcon className="h-6 w-6" aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <p className="truncate text-base font-bold text-slate-900">{user?.name ?? '—'}</p>
          <p className="truncate text-sm text-slate-500">{user?.email ?? ''}</p>
          <p className="mt-0.5 text-sm font-bold uppercase tracking-wide text-slate-400">
            {user ? ROLE_LABELS[user.role] : ''}
          </p>
        </div>
      </Card>

      <Card className="space-y-3">
        <h2 className="text-base font-bold text-slate-900">This device</h2>
        <p className="text-sm text-slate-500">
          Install the app on this device for fullscreen POS use and faster access.
        </p>
        <InstallButton />
      </Card>

      <Card className="!p-3">
        <button
          onClick={() => void logout()}
          className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-[15px] font-semibold text-slate-700 transition hover:bg-slate-100 hover:text-slate-900"
        >
          <LogOutIcon className="h-5 w-5 text-slate-400" aria-hidden="true" />
          Sign out
        </button>
      </Card>
    </div>
  );
}

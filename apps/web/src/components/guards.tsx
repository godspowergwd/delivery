import { useEffect } from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import type { Role } from '@delivery/shared';
import { useAuth } from '../lib/auth';
import { useGuestGate } from '../lib/guest';
import { Button, Spinner } from './ui';
import { LockIcon, UserIcon } from './icons';

/** Gate that keeps a staff route behind authentication (and optionally a role). */
export function ProtectedRoute({ roles }: { roles?: Role[] }) {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="flex min-h-dvh items-center justify-center">
        <Spinner className="h-8 w-8" />
      </div>
    );
  }
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  if (roles && !roles.includes(user.role)) {
    return <Navigate to="/" replace />;
  }
  return <Outlet />;
}

/**
 * Account-only customer surface (checkout, orders, tracking, profile).
 *
 * Guests are sent to the in-app login route, then return to this protected path
 * after signing in.
 */
export function RequireAccount({ roles }: { roles?: Role[] }) {
  const { user, loading } = useAuth();
  const { openLogin } = useGuestGate();

  useEffect(() => {
    if (!loading && !user) openLogin();
  }, [loading, user, openLogin]);

  if (loading) {
    return (
      <div className="flex min-h-dvh items-center justify-center">
        <Spinner className="h-8 w-8" />
      </div>
    );
  }
  if (user && roles && !roles.includes(user.role)) return <Navigate to="/" replace />;
  if (!user) {
    // Keep the protected view covered during the login route transition.
    return (
      <div className="mx-auto flex w-full max-w-md flex-col items-center gap-4 rounded-card border border-green-200 bg-white px-6 py-12 text-center shadow-card duo-top">
        <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-red-600 text-white shadow-brand">
          <LockIcon className="h-7 w-7" aria-hidden="true" />
        </span>
        <div>
          <p className="text-lg font-extrabold text-slate-900">Sign in to continue</p>
          <p className="mt-1 text-sm text-slate-500">
            This part of Maame’s Waakye App is linked to your account.
          </p>
        </div>
        <Button onClick={openLogin}>
          <UserIcon className="h-4 w-4" aria-hidden="true" />
          Sign in
        </Button>
      </div>
    );
  }
  return <Outlet />;
}

/** Sends each visitor to the right starting screen (guests browse the store). */
export function RoleHome() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex min-h-dvh items-center justify-center">
        <Spinner className="h-8 w-8" />
      </div>
    );
  }
  if (!user) return <Navigate to="/app/home" replace />;
  if (user.role === 'ADMIN') return <Navigate to="/admin" replace />;
  if (user.role === 'KITCHEN') return <Navigate to="/kitchen" replace />;
  if (user.role === 'DRIVER') return <Navigate to="/driver/deliveries" replace />;
  return <Navigate to="/app/home" replace />;
}

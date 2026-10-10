import { Navigate, Outlet, useLocation } from 'react-router-dom';
import type { Role } from '@delivery/shared';
import { useAuth } from '../lib/auth';
import { Spinner } from './ui';

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
 * Guests are bounced to the dedicated /login page with `from` preserved.
 * No modal/pop-up login is used anywhere: every Sign in button navigates.
 */
export function RequireAccount({ roles }: { roles?: Role[] }) {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="flex min-h-dvh items-center justify-center">
        <Spinner className="h-8 w-8" />
      </div>
    );
  }
  if (user && roles && !roles.includes(user.role)) return <Navigate to="/" replace />;
  if (!user) {
    return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />;
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

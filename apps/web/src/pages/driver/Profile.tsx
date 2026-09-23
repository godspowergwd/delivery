import { useQuery } from '@tanstack/react-query';
import { useAuth } from '../../lib/auth';
import { fetchDriverSummary } from '../../lib/driver-api';
import { formatMoney } from '@delivery/shared';
import { Card, Spinner, EmptyState } from '../../components/ui';

export default function DriverProfile() {
  const { user, logout } = useAuth();
  const { data, isLoading, isError } = useQuery({
    queryKey: ['driver-summary'],
    queryFn: fetchDriverSummary,
    refetchInterval: 30_000,
  });

  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-2xl font-extrabold text-slate-900">Driver profile</h1>
        <p className="text-sm text-slate-500">Your account and delivery performance.</p>
      </header>

      <Card className="!p-4">
        <h2 className="text-sm font-bold uppercase tracking-wide text-slate-500">Account</h2>
        <p className="mt-2 text-sm text-slate-800"><strong>Name:</strong> {user?.name ?? '—'}</p>
        <p className="text-sm text-slate-800"><strong>Email:</strong> {user?.email ?? '—'}</p>
        <p className="text-sm text-slate-800"><strong>Driver ID:</strong> {user?.id ?? '—'}</p>
      </Card>

      <Card className="!p-4">
        <h2 className="text-sm font-bold uppercase tracking-wide text-slate-500">Performance</h2>
        {isLoading ? (
          <div className="flex justify-center py-4">
            <Spinner className="h-6 w-6" />
          </div>
        ) : isError || !data ? (
          <EmptyState title="Could not load stats" hint="They will refresh automatically." />
        ) : (
          <div className="mt-2 grid grid-cols-2 gap-3">
            <div className="rounded-2xl bg-slate-100 p-3">
              <p className="text-xs uppercase tracking-wide text-slate-500">Completed today</p>
              <p className="text-lg font-extrabold text-slate-900">{data.completedToday}</p>
            </div>
            <div className="rounded-2xl bg-slate-100 p-3">
              <p className="text-xs uppercase tracking-wide text-slate-500">All-time deliveries</p>
              <p className="text-lg font-extrabold text-slate-900">{data.completedTotal}</p>
            </div>
            <div className="rounded-2xl bg-slate-100 p-3">
              <p className="text-xs uppercase tracking-wide text-slate-500">Active now</p>
              <p className="text-lg font-extrabold text-slate-900">{data.active}</p>
            </div>
            <div className="rounded-2xl bg-slate-100 p-3">
              <p className="text-xs uppercase tracking-wide text-slate-500">Delivery fees today</p>
              <p className="text-lg font-extrabold text-slate-900">{formatMoney(data.earningsToday)}</p>
            </div>
          </div>
        )}
      </Card>

      <Card className="!p-4">
        <button
          onClick={() => void logout()}
          className="w-full rounded-2xl bg-green-700 px-4 py-3 text-sm font-bold text-white hover:bg-green-800"
        >
          Sign out
        </button>
      </Card>
    </div>
  );
}

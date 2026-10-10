import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../../lib/auth';
import { fetchDriverSummary } from '../../lib/driver-api';
import { formatMoney } from '@delivery/shared';
import { api } from '../../lib/api';
import { toast } from '../../lib/realtime';
import { Button, Card, EmptyState, Field, Input, Spinner } from '../../components/ui';

interface VehicleProfile {
  vehiclePlateNumber: string | null;
  vehiclePlateColor: string | null;
}

export default function DriverProfile() {
  const { user, logout } = useAuth();
  const queryClient = useQueryClient();
  const [vehicle, setVehicle] = useState({ vehiclePlateNumber: '', vehiclePlateColor: '' });
  const { data, isLoading, isError } = useQuery({
    queryKey: ['driver-summary'],
    queryFn: fetchDriverSummary,
    refetchInterval: 30_000,
  });
  const profile = useQuery({
    queryKey: ['driver-profile'],
    queryFn: () => api.get<{ profile: VehicleProfile }>('/driver/profile'),
  });

  useEffect(() => {
    if (profile.data) {
      setVehicle({
        vehiclePlateNumber: profile.data.profile.vehiclePlateNumber ?? '',
        vehiclePlateColor: profile.data.profile.vehiclePlateColor ?? '',
      });
    }
  }, [profile.data]);

  const saveVehicle = useMutation({
    mutationFn: () => api.patch<{ profile: VehicleProfile }>('/driver/profile', vehicle),
    onSuccess: (result) => {
      queryClient.setQueryData(['driver-profile'], result);
      toast('Vehicle details saved.', 'success');
    },
    onError: (error) => toast(error instanceof Error ? error.message : 'Could not save vehicle details.', 'error'),
  });

  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-2xl font-extrabold text-slate-900">Driver profile</h1>
        <p className="text-sm text-slate-500">Your account and delivery performance.</p>
      </header>

      <Card className="!p-4">
        <h2 className="text-sm font-bold uppercase tracking-wide text-slate-500">Account</h2>
        <p className="mt-2 text-sm text-slate-800"><strong>Name:</strong> {user?.name ?? '-'}</p>
        <p className="text-sm text-slate-800"><strong>Email:</strong> {user?.email ?? '-'}</p>
        <p className="text-sm text-slate-800"><strong>Driver ID:</strong> {user?.id ?? '-'}</p>
      </Card>

      <Card className="space-y-3 !p-4">
        <div>
          <h2 className="text-sm font-bold uppercase tracking-wide text-slate-700">Vehicle details</h2>
          <p className="mt-1 text-xs text-slate-500">Customers with your assigned delivery can see these details.</p>
        </div>
        {profile.isLoading ? (
          <div className="flex justify-center py-3"><Spinner className="h-6 w-6" /></div>
        ) : profile.isError ? (
          <EmptyState title="Could not load vehicle details" hint="Try again shortly." />
        ) : (
          <>
            <Field label="Vehicle plate number">
              <Input
                autoComplete="off"
                value={vehicle.vehiclePlateNumber}
                onChange={(event) => setVehicle((current) => ({ ...current, vehiclePlateNumber: event.target.value }))}
                placeholder="Enter your registered plate"
              />
            </Field>
            <Field label="Plate color">
              <Input
                autoComplete="off"
                value={vehicle.vehiclePlateColor}
                onChange={(event) => setVehicle((current) => ({ ...current, vehiclePlateColor: event.target.value }))}
                placeholder="For example, white"
              />
            </Field>
            <Button
              loading={saveVehicle.isPending}
              onClick={() => saveVehicle.mutate()}
            >
              Save vehicle details
            </Button>
          </>
        )}
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
          className="w-full rounded-2xl brand-gradient px-4 py-3 text-sm font-bold text-white shadow-brand transition hover:brightness-105 active:scale-[0.98]"
        >
          Sign out
        </button>
      </Card>
    </div>
  );
}

import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { DriverLoginCredentials, KitchenDriverDTO } from '@delivery/shared';
import { formatRelativeTime } from '@delivery/shared';
import { api } from '../../lib/api';
import {
  copyText,
  driverLoginText,
  recallDriverLogin,
  rememberDriverLogin,
} from '../../lib/credentials';
import { toast, useRealtimeSync } from '../../lib/realtime';
import { Button, Card, EmptyState, Modal, Spinner } from '../../components/ui';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { DriverCredentialsCard } from '../../components/driver-credentials';
import {
  ArrowLeftIcon,
  CheckCircleIcon,
  CopyIcon,
  PhoneIcon,
  PlusIcon,
  RefreshIcon,
  ShieldIcon,
  UsersIcon,
} from '../../components/icons';

/**
 * Driver List (Kitchen > Settings > Driver Management > Driver List).
 *
 * Every driver account with its live state: name, username, online/offline and
 * active/disabled, plus the four kitchen actions — Copy Login, Reset Password,
 * Disable and Enable. Drivers are never deleted here: order history, earnings
 * and assignments must survive untouched, so disabling is the only "off switch".
 */

function StatusChip({
  tone,
  children,
}: {
  tone: 'green' | 'red' | 'slate';
  children: React.ReactNode;
}) {
  const styles = {
    green: 'bg-green-50 text-green-800 ring-green-200',
    red: 'bg-red-50 text-red-700 ring-red-200',
    slate: 'bg-slate-100 text-slate-600 ring-slate-200',
  } as const;
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-extrabold uppercase tracking-wide ring-1 ring-inset ${styles[tone]}`}
    >
      {children}
    </span>
  );
}

export function KitchenDrivers() {
  useRealtimeSync();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [issued, setIssued] = useState<{
    driver: KitchenDriverDTO;
    credentials: DriverLoginCredentials;
  } | null>(null);
  const [resetTarget, setResetTarget] = useState<KitchenDriverDTO | null>(null);
  const [copyTarget, setCopyTarget] = useState<KitchenDriverDTO | null>(null);
  const [toggleTarget, setToggleTarget] = useState<KitchenDriverDTO | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ['kitchen-drivers'],
    queryFn: () => api.get<{ drivers: KitchenDriverDTO[] }>('/kitchen/drivers'),
    refetchInterval: 20_000,
  });

  const drivers = data?.drivers ?? [];
  const term = search.trim().toLowerCase();
  const filtered = term
    ? drivers.filter((driver) =>
        `${driver.name} ${driver.username ?? ''} ${driver.phone ?? ''}`.toLowerCase().includes(term),
      )
    : drivers;

  const refresh = () => queryClient.invalidateQueries({ queryKey: ['kitchen-drivers'] });

  /** One tap when this device already holds the password; otherwise issue one. */
  const copyLogin = async (driver: KitchenDriverDTO): Promise<void> => {
    const remembered = recallDriverLogin(driver.id);
    if (remembered) {
      const ok = await copyText(driverLoginText(remembered));
      toast(ok ? 'Username and password copied' : 'Could not copy — try again.', ok ? 'success' : 'error');
      return;
    }
    setCopyTarget(driver);
  };

  /** Issues a fresh password, copies both values and remembers them here. */
  const generateAndCopy = async (driver: KitchenDriverDTO): Promise<void> => {
    setBusyId(driver.id);
    try {
      const result = await api.post<{ driver: KitchenDriverDTO; credentials: DriverLoginCredentials }>(
        `/kitchen/drivers/${driver.id}/reset-password`,
        {},
      );
      rememberDriverLogin(driver.id, result.credentials);
      const ok = await copyText(driverLoginText(result.credentials));
      await refresh();
      toast(
        ok
          ? 'New password generated and copied — send it to the driver.'
          : 'New password generated. Select it below to copy.',
        ok ? 'success' : 'warning',
      );
      setCopyTarget(null);
      setIssued(result);
    } catch (error) {
      toast(error instanceof Error ? error.message : 'Could not reset the password.', 'error');
    } finally {
      setBusyId(null);
    }
  };

  const resetPassword = async (driver: KitchenDriverDTO): Promise<void> => {
    setBusyId(driver.id);
    try {
      const result = await api.post<{ driver: KitchenDriverDTO; credentials: DriverLoginCredentials }>(
        `/kitchen/drivers/${driver.id}/reset-password`,
        {},
      );
      rememberDriverLogin(driver.id, result.credentials);
      await refresh();
      setResetTarget(null);
      setIssued(result);
      toast('New password issued — the driver must use it from now on.', 'success');
    } catch (error) {
      toast(error instanceof Error ? error.message : 'Could not reset the password.', 'error');
    } finally {
      setBusyId(null);
    }
  };

  const setEnabled = async (driver: KitchenDriverDTO, enabled: boolean): Promise<void> => {
    setBusyId(driver.id);
    try {
      await api.post(`/kitchen/drivers/${driver.id}/${enabled ? 'enable' : 'disable'}`);
      await refresh();
      setToggleTarget(null);
      toast(
        enabled ? `${driver.name} can sign in again.` : `${driver.name} was disabled.`,
        enabled ? 'success' : 'warning',
      );
    } catch (error) {
      toast(error instanceof Error ? error.message : 'Could not update the driver.', 'error');
    } finally {
      setBusyId(null);
    }
  };

  const online = drivers.filter((driver) => driver.isOnline).length;
  const active = drivers.filter((driver) => driver.isActive).length;

  return (
    <div className="space-y-4">
      <header className="space-y-3">
        <Link
          to="/kitchen/settings"
          className="inline-flex min-h-9 items-center gap-1.5 text-sm font-bold text-slate-500 transition hover:text-slate-800"
        >
          <ArrowLeftIcon className="h-4 w-4" aria-hidden="true" />
          Kitchen settings
        </Link>

        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-2xl font-extrabold tracking-tight text-slate-900">Driver List</h1>
            <p className="truncate text-sm text-slate-500">
              {drivers.length === 0
                ? 'No driver accounts yet.'
                : `${drivers.length} driver${drivers.length === 1 ? '' : 's'} · ${active} active · ${online} online`}
            </p>
          </div>
          <div className="flex flex-none items-center gap-2">
            <Button size="sm" variant="ghost" aria-label="Refresh driver list" onClick={() => void refresh()}>
              <RefreshIcon className={`h-4 w-4 ${isFetching ? 'animate-spin' : ''}`} aria-hidden="true" />
            </Button>
            <Link to="/kitchen/drivers/new">
              <Button size="sm">
                <PlusIcon className="h-4 w-4" aria-hidden="true" />
                Create
              </Button>
            </Link>
          </div>
        </div>

        <input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search name, username or phone"
          aria-label="Search drivers"
          className="min-h-11 w-full rounded-2xl border border-slate-200 bg-white px-4 text-[15px] text-slate-900 shadow-soft outline-none transition placeholder:text-slate-400 focus:border-red-600 focus:ring-4 focus:ring-red-600/10"
        />
      </header>

      {isLoading ? (
        <div className="flex justify-center py-16">
          <Spinner className="h-8 w-8" />
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState
          title={term ? 'No driver matches that search' : 'No drivers yet'}
          hint={
            term
              ? 'Try another name, username or phone number.'
              : 'Create the first driver account to start handing out logins.'
          }
          icon={<UsersIcon className="h-6 w-6" />}
        >
          {!term && (
            <Link to="/kitchen/drivers/new" className="mt-1 block">
              <Button size="lg">Create Driver</Button>
            </Link>
          )}
        </EmptyState>
      ) : (
        <div className="space-y-3">
          {filtered.map((driver) => (
            <Card key={driver.id} className="!p-4">
              <div className="flex items-start gap-3">
                <span
                  className={
                    driver.isActive
                      ? 'flex h-11 w-11 flex-none items-center justify-center rounded-2xl bg-red-50 text-red-600'
                      : 'flex h-11 w-11 flex-none items-center justify-center rounded-2xl bg-slate-100 text-slate-400'
                  }
                >
                  <UsersIcon className="h-5 w-5" aria-hidden="true" />
                </span>

                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <p className="text-[16px] font-extrabold leading-tight text-slate-900">
                      {driver.name}
                    </p>
                    <StatusChip tone={driver.isActive ? 'green' : 'red'}>
                      {driver.isActive ? 'Active' : 'Disabled'}
                    </StatusChip>
                    <StatusChip tone={driver.isOnline ? 'green' : 'slate'}>
                      {driver.isOnline ? 'Online' : 'Offline'}
                    </StatusChip>
                  </div>

                  <p className="mt-1 truncate text-[13px] font-semibold text-slate-600">
                    {driver.username ?? driver.email}
                  </p>

                  <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[12px] font-medium text-slate-500">
                    {driver.phone && (
                      <span className="inline-flex items-center gap-1">
                        <PhoneIcon className="h-3.5 w-3.5" aria-hidden="true" />
                        {driver.phone}
                      </span>
                    )}
                    <span>
                      {driver.activeDeliveries} active · {driver.completedDeliveries} completed
                    </span>
                    <span>
                      {driver.lastLoginAt
                        ? `Last sign-in ${formatRelativeTime(driver.lastLoginAt)}`
                        : 'Never signed in'}
                    </span>
                  </p>

                  {driver.notes && (
                    <p className="mt-1.5 rounded-lg bg-slate-50 px-2 py-1 text-[12px] font-medium text-slate-500">
                      {driver.notes}
                    </p>
                  )}
                </div>
              </div>

              <div className="mt-3 flex flex-wrap gap-2">
                <Button size="sm" variant="success" onClick={() => void copyLogin(driver)}>
                  <CopyIcon className="h-4 w-4" aria-hidden="true" />
                  Copy Login
                </Button>
                <Button size="sm" variant="secondary" onClick={() => setResetTarget(driver)}>
                  <RefreshIcon className="h-4 w-4" aria-hidden="true" />
                  Reset Password
                </Button>
                <Button
                  size="sm"
                  variant={driver.isActive ? 'danger' : 'outline'}
                  onClick={() => setToggleTarget(driver)}
                >
                  {driver.isActive ? (
                    <>
                      <ShieldIcon className="h-4 w-4" aria-hidden="true" />
                      Disable Driver
                    </>
                  ) : (
                    <>
                      <CheckCircleIcon className="h-4 w-4" aria-hidden="true" />
                      Enable Driver
                    </>
                  )}
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* ---------- Credentials handover ---------- */}
      <Modal open={Boolean(issued)} onClose={() => setIssued(null)} title="New login issued">
        {issued && (
          <DriverCredentialsCard
            title="New password issued"
            driverName={issued.driver.name}
            credentials={issued.credentials}
            className="overflow-hidden rounded-2xl border border-green-200 bg-white"
          />
        )}
        <div className="mt-4">
          <Button block onClick={() => setIssued(null)}>
            Done
          </Button>
        </div>
      </Modal>

      {/* ---------- Confirmations (no browser popups) ---------- */}
      <ConfirmDialog
        open={Boolean(copyTarget)}
        title="Generate a password to copy?"
        message={`No password for ${copyTarget?.name ?? 'this driver'} is stored on this device. Generate a new one so the full login can be copied?`}
        confirmLabel="Generate & copy"
        tone="primary"
        busy={busyId === copyTarget?.id}
        onCancel={() => setCopyTarget(null)}
        onConfirm={() => {
          if (copyTarget) void generateAndCopy(copyTarget);
        }}
      />

      <ConfirmDialog
        open={Boolean(resetTarget)}
        title={`Reset password for ${resetTarget?.name ?? 'driver'}?`}
        message="The driver is signed out of every device and must use the new password from now on."
        confirmLabel="Reset password"
        busy={busyId === resetTarget?.id}
        onCancel={() => setResetTarget(null)}
        onConfirm={() => {
          if (resetTarget) void resetPassword(resetTarget);
        }}
      />

      <ConfirmDialog
        open={Boolean(toggleTarget)}
        title={
          toggleTarget?.isActive
            ? `Disable ${toggleTarget.name}?`
            : `Enable ${toggleTarget?.name ?? 'driver'}?`
        }
        message={
          toggleTarget?.isActive
            ? 'Sign-in is blocked immediately. Deliveries, earnings and history are kept, and you can enable the driver again at any time.'
            : 'The driver can sign in again and pick up deliveries.'
        }
        confirmLabel={toggleTarget?.isActive ? 'Disable driver' : 'Enable driver'}
        tone={toggleTarget?.isActive ? 'danger' : 'primary'}
        busy={busyId === toggleTarget?.id}
        onCancel={() => setToggleTarget(null)}
        onConfirm={() => {
          if (toggleTarget) void setEnabled(toggleTarget, !toggleTarget.isActive);
        }}
      />
    </div>
  );
}


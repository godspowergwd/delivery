import { useEffect, useState, type ComponentType } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { SettingsDTO } from '@delivery/shared';
import { api } from '../../lib/api';
import { useRealtimeSync } from '../../lib/realtime';
import { Button, Card, Field, Input, Spinner, Textarea } from '../../components/ui';
import { toast } from '../../lib/realtime';
import {
  ChefHatIcon,
  ChevronRightIcon,
  CogIcon,
  FolderIcon,
  ScrollIcon,
  TruckIcon,
  UsersIcon,
} from '../../components/icons';

export function AdminSettings() {
  useRealtimeSync();
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ['admin-settings-full'],
    queryFn: () => api.get<{ settings: SettingsDTO }>('/settings/admin'),
    staleTime: 30_000,
  });

  const [form, setForm] = useState<Partial<SettingsDTO>>({});
  const [saving, setSaving] = useState(false);
  const settings = data?.settings;

  useEffect(() => {
    if (settings) setForm(settings);
  }, [settings]);

  const update = (patch: Partial<SettingsDTO>) => setForm((current) => ({ ...current, ...patch }));

  const save = async () => {
    setSaving(true);
    try {
      await api.patch('/settings', form);
      void queryClient.invalidateQueries({ queryKey: ['admin-settings-full'] });
      void queryClient.invalidateQueries({ queryKey: ['admin-settings'] });
      toast('Settings saved', 'success');
    } catch (error: any) {
      toast(error?.message ?? 'Failed to save settings', 'error');
    } finally {
      setSaving(false);
    }
  };

  if (isLoading || !settings) {
    return (
      <div className="flex justify-center py-12">
        <Spinner className="h-8 w-8" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
              <header>
        <h1 className="text-2xl font-extrabold text-slate-900 lg:text-3xl">Settings</h1>
        <p className="mt-1 text-sm text-slate-500">Business configuration and management.</p>
      </header>
        <label className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-slate-100 px-3 py-2 text-sm text-slate-700">
          <input
            type="checkbox"
            checked={form.acceptingOrders ?? false}
            onChange={(event) => update({ acceptingOrders: event.target.checked })}
            className="h-5 w-5 rounded border-slate-300 bg-slate-100"
          />
          Accepting orders
        </label>
      </div>

      <Card className="space-y-3">
        <h2 className="text-sm font-bold text-slate-600">Business</h2>
        <Field label="Business name">
          <Input value={form.businessName ?? ''} onChange={(event) => update({ businessName: event.target.value })} />
        </Field>
        <Field label="Address">
          <Textarea value={form.businessAddress ?? ''} rows={2} onChange={(event) => update({ businessAddress: event.target.value })} />
        </Field>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Phone">
            <Input value={form.businessPhone ?? ''} onChange={(event) => update({ businessPhone: event.target.value })} />
          </Field>
          <Field label="Email">
            <Input value={form.businessEmail ?? ''} onChange={(event) => update({ businessEmail: event.target.value })} />
          </Field>
        </div>
      </Card>

      <Card className="space-y-3">
        <h2 className="text-sm font-bold text-slate-600">Pricing & delivery</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Field label="Currency code">
            <Input value={form.currencyCode ?? ''} onChange={(event) => update({ currencyCode: event.target.value })} />
          </Field>
          <Field label="Symbol">
            <Input value={form.currencySymbol ?? ''} onChange={(event) => update({ currencySymbol: event.target.value })} />
          </Field>
          <Field label="Delivery fee">
            <Input
              type="number"
              min="0"
              step="0.01"
              value={form.deliveryFee ?? 0}
              onChange={(event) => update({ deliveryFee: Number(event.target.value) })}
            />
          </Field>
          <Field label="Tax rate (%)">
            <Input
              type="number"
              min="0"
              max="100"
              step="0.1"
              value={form.taxRate ?? 0}
              onChange={(event) => update({ taxRate: Number(event.target.value) })}
            />
          </Field>
          <Field label="Min order total">
            <Input
              type="number"
              min="0"
              step="0.01"
              value={form.minOrderTotal ?? 0}
              onChange={(event) => update({ minOrderTotal: Number(event.target.value) })}
            />
          </Field>
          <Field label="Delivery radius (km)" hint="Orders outside this radius of the kitchen are refused.">
            <Input
              type="number"
              min="1"
              max="50"
              step="0.5"
              value={form.deliveryRadiusKm ?? 0}
              onChange={(event) => update({ deliveryRadiusKm: Number(event.target.value) })}
            />
          </Field>
          <Field label="Low stock alert at">
            <Input
              type="number"
              min="0"
              value={form.lowStockThreshold ?? 0}
              onChange={(event) => update({ lowStockThreshold: Number(event.target.value) })}
            />
          </Field>
          <Field label="Support phone">
            <Input value={form.supportPhone ?? ''} onChange={(event) => update({ supportPhone: event.target.value })} />
          </Field>
          <Field label="Support email">
            <Input value={form.supportEmail ?? ''} onChange={(event) => update({ supportEmail: event.target.value })} />
          </Field>
        </div>
      </Card>

      <Card>
        <h2 className="mb-3 flex items-center gap-2 text-base font-bold text-slate-900">
          <CogIcon className="h-5 w-5 text-red-600" aria-hidden="true" />
          Management
        </h2>
        <div className="grid gap-2 sm:grid-cols-2">
          {MANAGE_LINKS.map((link) => (
            <Link
              key={link.to}
              to={link.to}
              className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 transition hover:border-red-200 hover:bg-red-50/50"
            >
              <span className="flex h-10 w-10 flex-none items-center justify-center rounded-xl bg-slate-100 text-slate-600">
                <link.icon className="h-5 w-5" aria-hidden="true" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[15px] font-bold text-slate-900">{link.label}</span>
                <span className="block truncate text-sm text-slate-500">{link.hint}</span>
              </span>
              <ChevronRightIcon className="h-5 w-5 flex-none text-slate-300" aria-hidden="true" />
            </Link>
          ))}
        </div>
      </Card>

      <div className="flex justify-end">
        <Button loading={saving} onClick={() => void save()}>
          Save settings
        </Button>
      </div>
    </div>
  );
}

interface ManageLink {
  to: string;
  label: string;
  hint: string;
  icon: ComponentType<{ className?: string }>;
}

const MANAGE_LINKS: ManageLink[] = [
  { to: '/admin/categories', label: 'Categories', hint: 'Organize the product catalogue', icon: FolderIcon },
  { to: '/admin/users', label: 'People', hint: 'Customers, staff and admins', icon: UsersIcon },
  { to: '/admin/logs', label: 'Activity logs', hint: 'Audit trail of every action', icon: ScrollIcon },
  { to: '/kitchen', label: 'Kitchen display', hint: 'Incoming order queue', icon: ChefHatIcon },
  { to: '/settings', label: 'My account', hint: 'Profile details and sign out', icon: TruckIcon },
];

import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import type { DriverLoginCredentials, KitchenDriverDTO } from '@delivery/shared';
import { api } from '../../lib/api';
import { rememberDriverLogin } from '../../lib/credentials';
import { toast, useRealtimeSync } from '../../lib/realtime';
import { Button, Card, Field, Input, Textarea } from '../../components/ui';
import { DriverCredentialsCard } from '../../components/driver-credentials';
import { ArrowLeftIcon, PlusIcon, UsersIcon } from '../../components/icons';

/**
 * Create Driver (Kitchen > Settings > Driver Management > Create Driver).
 *
 * Creates the real driver account immediately — no approval step — and lands on
 * the credentials handover screen so the login can be copied or shared before
 * the kitchen moves on. Usernames are unique across every account type and the
 * server re-checks that before writing anything.
 */

interface CreateForm {
  name: string;
  username: string;
  password: string;
  phone: string;
  notes: string;
}

const EMPTY: CreateForm = { name: '', username: '', password: '', phone: '', notes: '' };
const USERNAME_PATTERN = /^[a-z0-9][a-z0-9._-]{2,31}$/;
const PHONE_PATTERN = /^[+0-9()\-\s]+$/;

function validate(form: CreateForm): Record<string, string> {
  const errors: Record<string, string> = {};
  if (form.name.trim().length < 2) errors.name = 'Enter the driver’s full name.';
  const username = form.username.trim().toLowerCase();
  if (!username) errors.username = 'Choose a username for sign-in.';
  else if (!USERNAME_PATTERN.test(username)) {
    errors.username = '3–32 characters: letters, numbers, dots, dashes or underscores.';
  }
  if (!form.password) errors.password = 'Password is required.';
  else if (form.password.length < 8) errors.password = 'Password must be at least 8 characters.';
  else if (form.password.length > 72) errors.password = 'Password must be at most 72 characters.';
  if (form.phone.trim() && (form.phone.trim().length < 7 || !PHONE_PATTERN.test(form.phone.trim()))) {
    errors.phone = 'Enter a valid phone number.';
  }
  return errors;
}

export function KitchenDriverCreate() {
  useRealtimeSync();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [form, setForm] = useState<CreateForm>(EMPTY);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [created, setCreated] = useState<{
    driver: KitchenDriverDTO;
    credentials: DriverLoginCredentials;
  } | null>(null);

  const update = (key: keyof CreateForm) => (value: string) =>
    setForm((current) => ({ ...current, [key]: value }));

  const submit = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    const found = validate(form);
    setErrors(found);
    if (Object.keys(found).length > 0) {
      toast('Check the highlighted fields.', 'error');
      return;
    }

    setBusy(true);
    try {
      const payload = {
        name: form.name.trim(),
        username: form.username.trim().toLowerCase(),
        password: form.password,
        ...(form.phone.trim() ? { phone: form.phone.trim() } : {}),
        ...(form.notes.trim() ? { notes: form.notes.trim() } : {}),
      };
      const result = await api.post<{
        driver: KitchenDriverDTO;
        credentials: DriverLoginCredentials;
      }>('/kitchen/drivers', payload);

      // Remembered in memory only, so Copy Login / Share work right away.
      rememberDriverLogin(result.driver.id, result.credentials);
      void queryClient.invalidateQueries({ queryKey: ['kitchen-drivers'] });

      setCreated(result);
      toast('Driver account created', 'success');
    } catch (error) {
      setErrors({});
      toast(error instanceof Error ? error.message : 'Could not create the driver.', 'error');
    } finally {
      setBusy(false);
    }
  };

  if (created) {
    return (
      <div className="mx-auto max-w-lg space-y-4">
        <header>
          <h1 className="text-2xl font-extrabold tracking-tight text-slate-900">Driver created</h1>
          <p className="text-sm text-slate-500">Send these details over - no retyping needed.</p>
        </header>

        <DriverCredentialsCard
          title="Driver Created Successfully"
          driverName={created.driver.name}
          credentials={created.credentials}
        />

        <div className="grid gap-2 sm:grid-cols-2">
          <Button
            size="lg"
            variant="outline"
            onClick={() => {
              setCreated(null);
              setForm(EMPTY);
              setErrors({});
            }}
          >
            <PlusIcon className="h-5 w-5" aria-hidden="true" />
            Create another
          </Button>
          <Button size="lg" onClick={() => navigate('/kitchen/drivers')}>
            <UsersIcon className="h-5 w-5" aria-hidden="true" />
            Driver list
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-lg space-y-5">
      <header className="space-y-2">
        <Link
          to="/kitchen/drivers"
          className="inline-flex min-h-9 items-center gap-1.5 text-sm font-bold text-slate-500 transition hover:text-slate-800"
        >
          <ArrowLeftIcon className="h-4 w-4" aria-hidden="true" />
          Driver list
        </Link>
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight text-slate-900">Create Driver</h1>
          <p className="text-sm text-slate-500">
            The account is active immediately - sign the driver in with the details you set here.
          </p>
        </div>
      </header>

      <Card>
        <form onSubmit={submit} className="space-y-4" noValidate>
          <div>
            <Field label="Driver name" htmlFor="driver-name">
              <Input
                id="driver-name"
                value={form.name}
                onChange={(event) => update('name')(event.target.value)}
                placeholder="Joy Mensah"
                autoComplete="name"
                className={errors.name ? '!border-red-500' : undefined}
              />
            </Field>
            {errors.name && <p className="mt-1 text-sm font-semibold text-red-600">{errors.name}</p>}
          </div>

          <div>
            <Field
              label="Username"
              htmlFor="driver-username"
              hint="Unique across the whole app. The driver signs in with this."
            >
              <Input
                id="driver-username"
                value={form.username}
                onChange={(event) => update('username')(event.target.value.toLowerCase())}
                placeholder="driverjoy"
                autoComplete="off"
                spellCheck={false}
                className={errors.username ? '!border-red-500' : undefined}
              />
            </Field>
            {errors.username && (
              <p className="mt-1 text-sm font-semibold text-red-600">{errors.username}</p>
            )}
          </div>

          <div>
            <Field label="Password" htmlFor="driver-password" hint="At least 8 characters.">
              <Input
                id="driver-password"
                type="password"
                value={form.password}
                onChange={(event) => update('password')(event.target.value)}
                placeholder="At least 8 characters"
                autoComplete="new-password"
                className={errors.password ? '!border-red-500' : undefined}
              />
            </Field>
            {errors.password && (
              <p className="mt-1 text-sm font-semibold text-red-600">{errors.password}</p>
            )}
          </div>

          <div>
            <Field label="Phone number" htmlFor="driver-phone" hint="Optional.">
              <Input
                id="driver-phone"
                type="tel"
                value={form.phone}
                onChange={(event) => update('phone')(event.target.value)}
                placeholder="+233 20 123 4567"
                autoComplete="tel"
                className={errors.phone ? '!border-red-500' : undefined}
              />
            </Field>
            {errors.phone && (
              <p className="mt-1 text-sm font-semibold text-red-600">{errors.phone}</p>
            )}
          </div>

          <Field label="Notes" htmlFor="driver-notes" hint="Optional. Zone, vehicle, shift…">
            <Textarea
              id="driver-notes"
              value={form.notes}
              onChange={(event) => update('notes')(event.target.value)}
              rows={3}
              maxLength={240}
              placeholder="e.g. Covers Gbawe and Weija, works evenings"
            />
          </Field>

          <Button type="submit" size="lg" block loading={busy}>
            <PlusIcon className="h-5 w-5" aria-hidden="true" />
            Create driver account
          </Button>
        </form>
      </Card>
    </div>
  );
}

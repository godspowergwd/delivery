import { useState, type FormEvent } from 'react';
import { useAuth } from '../lib/auth';
import { useGuestGate } from '../lib/guest';
import { Button, ErrorText, Field, Input, Sheet } from './ui';
import { LeafIcon, LockIcon, UserIcon } from './icons';

/**
 * Premium sign-in bottom sheet shown to guests on their first protected
 * action. Balanced red-and-green branding: a duo header band with green
 * ingredient accents, a red primary sign-in action and a green create-account
 * action. Signing in here runs the remembered action immediately — the guest
 * never has to tap the original button twice.
 */
export function AuthSheet() {
  const { sheetOpen, closeSheet, flushPending, goRegister } = useGuestGate();
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await login({ email, password, rememberMe: true });
      setPassword('');
      flushPending();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sign in failed. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet open={sheetOpen} onClose={closeSheet} title="Sign in to continue your order.">
      <div className="space-y-4">
        {/* Balanced red-and-green branded header with food accents. */}
        <div className="duo-top rg-corners -mx-1 rounded-3xl bg-white px-4 pb-4 pt-5 ring-1 ring-inset ring-slate-200/70">
          <div className="flex items-start gap-3">
            <span className="flex h-11 w-11 flex-none items-center justify-center rounded-2xl bg-red-600 text-white shadow-brand">
              <LockIcon className="h-5 w-5" aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <p className="text-base font-extrabold leading-snug text-slate-900">
                Sign in to continue your order.
              </p>
              <p className="mt-0.5 text-sm text-slate-500">
                Your cart is kept safe — you will land right back where you were.
              </p>
            </div>
          </div>
          <div className="mt-3 flex flex-wrap gap-1.5" aria-hidden="true">
            <span className="food-chip">
              <LeafIcon className="h-3 w-3" /> beans
            </span>
            <span className="food-chip">gari</span>
            <span className="food-chip">shito</span>
            <span className="food-chip food-chip-red">fresh today</span>
          </div>
        </div>

        <form onSubmit={submit} className="space-y-3">
          <Field label="Email or username">
            <Input
              type="text"
              required
              autoComplete="username"
              inputMode="email"
              autoCapitalize="none"
              spellCheck={false}
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="you@example.com"
            />
          </Field>
          <Field label="Password">
            <Input
              type="password"
              required
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="••••••••"
            />
          </Field>
          <ErrorText message={error} />
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <Button type="submit" size="lg" loading={busy}>
              Sign in
            </Button>
            <Button type="button" variant="success" size="lg" onClick={goRegister}>
              <UserIcon className="h-4 w-4" aria-hidden="true" />
              Create account
            </Button>
          </div>
        </form>

        <button
          type="button"
          onClick={closeSheet}
          className="w-full rounded-2xl px-4 py-2.5 text-sm font-semibold text-slate-500 transition hover:bg-slate-100 hover:text-slate-700"
        >
          Maybe later
        </button>
      </div>
    </Sheet>
  );
}
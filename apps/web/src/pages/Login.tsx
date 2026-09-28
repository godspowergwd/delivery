import { useState, type FormEvent } from 'react';
import { Link, Navigate, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { Eye, EyeOff } from 'lucide-react';
import { useAuth } from '../lib/auth';
import { useGuestGate } from '../lib/guest';
import { Button, Card, ErrorText, Field, Input } from '../components/ui';
import { ArrowLeftIcon, LeafIcon } from '../components/icons';

export function Login() {
  const { login, user } = useAuth();
  const { flushPending } = useGuestGate();
  const navigate = useNavigate();
  const location = useLocation();
  const [params] = useSearchParams();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const from = (location.state as { from?: string } | null)?.from;

  // Already signed in? Never push sign-up or sign-in prompts again.
  if (user) {
    if (user.role === 'ADMIN') return <Navigate to="/admin" replace />;
    if (user.role === 'KITCHEN') return <Navigate to="/kitchen" replace />;
    if (user.role === 'DRIVER') return <Navigate to="/driver/deliveries" replace />;
    return <Navigate to={from ?? '/app/home'} replace />;
  }

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const signedIn = await login({ email, password });
      if (signedIn.role === 'ADMIN') navigate('/admin', { replace: true });
      else if (signedIn.role === 'KITCHEN') navigate('/kitchen', { replace: true });
      else if (signedIn.role === 'DRIVER') navigate('/driver/deliveries', { replace: true });
      else {
        // Resume whatever the guest was trying to do before authenticating.
        const resumed = flushPending();
        if (resumed === 'none') navigate(from ?? '/app/home', { replace: true });
        else if (resumed !== 'nav') navigate(from ?? '/app/home', { replace: true });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sign in failed. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  const goBack = () => navigate('/app/home', { replace: true });

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center bg-white px-5 py-8">
      <Button type="button" variant="ghost" size="sm" className="mb-4 self-start" onClick={goBack}>
        <ArrowLeftIcon className="h-4 w-4" />
        Back
      </Button>
      {params.get('expired') && (
        <p className="mb-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-2.5 text-sm text-red-700">
          Your session expired. Please sign in again.
        </p>
      )}
      <div className="mb-6 flex flex-col items-center gap-2 text-center">
        <img src={`${import.meta.env.BASE_URL}brand/maame-waakye-onyx.png`} alt="Maame’s Waakye App" className="h-16 w-16 rounded-2xl" />
        <h1 className="text-2xl font-extrabold text-slate-900">Maame’s Waakye App</h1>
        <p className="text-xs font-extrabold uppercase tracking-[0.28em]">
          <span className="text-red-600">Onyx</span>
          <span className="text-green-700"> · fresh daily</span>
        </p>
        <p className="text-sm text-slate-500">Hot waakye around Malam & Gbawe — sign in to order.</p>
      </div>
      <Card className="duo-top">
        {/* One real credential form: identifier first, password second — the
            exact order and semantics every password manager expects. */}
        <form onSubmit={submit} className="space-y-4" autoComplete="on">
          <Field label="Email or username" htmlFor="login-email">
            <Input
              id="login-email"
              name="email"
              type="text"
              required
              autoComplete="username"
              inputMode="email"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="you@example.com or admin"
            />
          </Field>
          <Field label="Password" htmlFor="login-password">
            <div className="relative">
              <Input
                id="login-password"
                name="password"
                type={showPassword ? 'text' : 'password'}
                required
                autoComplete="current-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="Password"
                className="pr-12"
              />
              <button
                type="button"
                onClick={() => setShowPassword((visible) => !visible)}
                className="absolute inset-y-0 right-0 inline-flex w-11 items-center justify-center text-slate-500 hover:text-slate-800"
                aria-label={showPassword ? 'Hide password' : 'Show password'}
                aria-pressed={showPassword}
                title={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
              </button>
            </div>
          </Field>
          <ErrorText message={error} />
          <Button type="submit" size="lg" loading={busy} className="w-full">
            Sign in
          </Button>
        </form>
      </Card>
      <p className="mt-5 text-center text-sm text-slate-500">
        New here?{' '}
        <Link to="/register" className="font-semibold text-green-700 hover:underline">
          Create a customer account
        </Link>
      </p>
      <p className="mt-3 flex items-center justify-center gap-1.5 text-xs text-slate-400">
        <LeafIcon className="h-3.5 w-3.5 text-green-600" aria-hidden="true" />
        You can also browse the menu without signing in.
      </p>
    </div>
  );
}

import { useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { Button, Card, ErrorText, Field, Input } from '../components/ui';

export function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const user = await login({ email, password, rememberMe });
      if (user.role === 'ADMIN') navigate('/admin', { replace: true });
      else if (user.role === 'KITCHEN') navigate('/kitchen', { replace: true });
      else navigate('/app/menu', { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sign in failed. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center bg-white px-5">
      {params.get('expired') && (
        <p className="mb-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-2.5 text-sm text-red-700">
          Your session expired. Please sign in again.
        </p>
      )}
      <div className="mb-6 flex flex-col items-center gap-2 text-center">
        <img src={`${import.meta.env.BASE_URL}logo.svg`} alt="" className="h-16 w-16 rounded-2xl" />
        <h1 className="text-2xl font-extrabold text-slate-900">Waakye App</h1>
        <p className="text-sm text-slate-500">Hot waakye around Malam & Gbawe — sign in to order.</p>
      </div>
      <Card>
        <form onSubmit={submit} className="space-y-4">
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
              placeholder="you@example.com or admin"
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
          <label className="flex items-center gap-2 text-sm text-slate-600">
            <input
              type="checkbox"
              checked={rememberMe}
              onChange={(event) => setRememberMe(event.target.checked)}
              className="h-5 w-5 rounded border-slate-300 bg-slate-200 accent-green-700"
            />
            Keep me signed in on this device
          </label>
          <ErrorText message={error} />
          <Button type="submit" size="lg" loading={busy} className="w-full">
            Sign in
          </Button>
        </form>
      </Card>
      <p className="mt-5 text-center text-sm text-slate-500">
        New here?{' '}
        <Link to="/register" className="font-semibold text-red-600 hover:underline">
          Create a customer account
        </Link>
      </p>
    </div>
  );
}

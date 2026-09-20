import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { Button, Card, ErrorText, Field, Input } from '../components/ui';

export function Register() {
  const { register } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ name: '', email: '', phone: '', password: '' });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const update = (key: keyof typeof form) => (value: string) =>
    setForm((current) => ({ ...current, [key]: value }));

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await register(form);
      navigate('/app/menu', { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Registration failed. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center px-5">
      <div className="mb-6 flex flex-col items-center gap-2 text-center">
        <img src={`${import.meta.env.BASE_URL}logo.svg`} alt="" className="h-16 w-16 rounded-2xl" />
        <h1 className="text-2xl font-extrabold text-slate-900">Create your account</h1>
        <p className="text-sm text-slate-500">Order in seconds and follow every delivery live.</p>
      </div>
      <Card>
        <form onSubmit={submit} className="space-y-4">
          <Field label="Full name">
            <Input required value={form.name} onChange={(e) => update('name')(e.target.value)} placeholder="Ama Mensah" autoComplete="name" />
          </Field>
          <Field label="Email">
            <Input required type="email" inputMode="email" autoComplete="email" value={form.email} onChange={(e) => update('email')(e.target.value)} placeholder="you@example.com" />
          </Field>
          <Field label="Phone" hint="Used by the courier to reach you on delivery.">
            <Input required inputMode="tel" autoComplete="tel" value={form.phone} onChange={(e) => update('phone')(e.target.value)} placeholder="+233 20 123 4567" />
          </Field>
          <Field label="Password" hint="At least 8 characters.">
            <Input required type="password" autoComplete="new-password" value={form.password} onChange={(e) => update('password')(e.target.value)} placeholder="••••••••" />
          </Field>
          <ErrorText message={error} />
          <Button type="submit" size="lg" loading={busy} className="w-full">
            Create account
          </Button>
        </form>
      </Card>
      <p className="mt-5 text-center text-sm text-slate-500">
        Already registered?{' '}
        <Link to="/login" className="font-semibold text-red-600 hover:underline">
          Sign in
        </Link>
      </p>
    </div>
  );
}

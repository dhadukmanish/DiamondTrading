import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { Button, Field, Input } from '../components/ui';

export function LoginPage() {
  const { login } = useAuth();
  const nav = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault(); setBusy(true); setError(null);
    try { await login(email, password); nav('/'); }
    catch (err) { setError(err instanceof Error ? err.message : 'Sign in failed'); }
    finally { setBusy(false); }
  };

  return (
    <div className="min-h-screen grid place-items-center bg-canvas">
      <form onSubmit={submit} className="card w-full max-w-sm p-8 grid gap-4">
        <div className="mb-2"><h1 className="text-2xl font-semibold text-brand">Diamond ERP</h1><p className="text-ink-muted">Sign in to continue</p></div>
        {error && <p className="text-sm text-red-600 bg-red-50 rounded px-3 py-2">{error}</p>}
        <Field label="Email" required><Input type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required /></Field>
        <Field label="Password" required><Input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required /></Field>
        <Button type="submit" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</Button>
      </form>
    </div>
  );
}

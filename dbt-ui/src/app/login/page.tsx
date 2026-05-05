'use client';

import { useState } from 'react';
import { signIn } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { Database, Loader2 } from 'lucide-react';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState<'signin' | 'bootstrap'>('signin');

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await signIn('credentials', { email, password, redirect: false });
      if (res?.error) {
        setError('Invalid email or password');
        return;
      }
      router.replace('/');
      router.refresh();
    } catch {
      setError('Sign-in failed');
    } finally {
      setLoading(false);
    }
  };

  const handleBootstrap = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const r = await fetch('/api/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, name: name || undefined }),
      });
      let data: { error?: string } = {};
      try {
        data = (await r.json()) as { error?: string };
      } catch {
        setError(
          r.status === 0
            ? 'Could not reach the server. Is `pnpm dev` running?'
            : `Registration failed (HTTP ${r.status}). Response was not JSON.`
        );
        return;
      }
      if (!r.ok) {
        setError(data.error ?? `Registration failed (HTTP ${r.status})`);
        return;
      }
      const res = await signIn('credentials', { email, password, redirect: false });
      if (res?.error) {
        setError('Account created but sign-in failed — try signing in manually.');
        return;
      }
      router.replace('/');
      router.refresh();
    } catch {
      setError('Registration failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#1e1e1e] text-[#d4d4d4] flex flex-col items-center justify-center p-6">
      <div className="flex items-center gap-2 mb-6">
        <Database size={24} className="text-[#007acc]" />
        <span className="text-lg font-semibold text-white">DBT DataArch Studio</span>
      </div>

      <div className="w-full max-w-sm border border-[#3e3e42] rounded-lg bg-[#252526] p-5 shadow-xl">
        <div className="flex gap-2 mb-4 text-xs">
          <button
            type="button"
            onClick={() => { setMode('signin'); setError(null); }}
            className={`flex-1 py-1.5 rounded border ${mode === 'signin' ? 'border-[#007acc] bg-[#007acc]/10 text-[#4fc3f7]' : 'border-[#3e3e42] text-[#8b8b8b]'}`}
          >
            Sign in
          </button>
          <button
            type="button"
            onClick={() => { setMode('bootstrap'); setError(null); }}
            className={`flex-1 py-1.5 rounded border ${mode === 'bootstrap' ? 'border-[#007acc] bg-[#007acc]/10 text-[#4fc3f7]' : 'border-[#3e3e42] text-[#8b8b8b]'}`}
          >
            First admin
          </button>
        </div>

        {error && (
          <div className="mb-3 text-xs text-[#f48771] border border-[#f48771]/30 rounded px-2 py-1.5 bg-[#f48771]/10">
            {error}
          </div>
        )}

        {mode === 'signin' ? (
          <form onSubmit={handleSignIn} className="space-y-3">
            <div>
              <label className="block text-[10px] uppercase text-[#8b8b8b] mb-1">Email</label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full bg-[#3c3c3c] border border-[#5a5a5a] rounded px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-[10px] uppercase text-[#8b8b8b] mb-1">Password</label>
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full bg-[#3c3c3c] border border-[#5a5a5a] rounded px-3 py-2 text-sm"
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="w-full py-2 rounded bg-[#0e639c] hover:bg-[#1177bb] text-white text-sm font-medium flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {loading && <Loader2 size={14} className="animate-spin" />}
              Sign in
            </button>
          </form>
        ) : (
          <form onSubmit={handleBootstrap} className="space-y-3">
            <p className="text-[11px] text-[#8b8b8b] leading-relaxed">
              Creates the first admin user only when no accounts exist yet. After that, admins add users from the Team
              panel.
            </p>
            <p className="text-[10px] text-[#6e6e6e] leading-relaxed">
              One-time setup: from the <span className="font-mono text-[#9cdcfe]">dbt-ui</span> folder run{' '}
              <span className="font-mono text-[#9cdcfe]">pnpm exec prisma db push</span> so the user database exists.
            </p>
            <div>
              <label className="block text-[10px] uppercase text-[#8b8b8b] mb-1">Display name (optional)</label>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full bg-[#3c3c3c] border border-[#5a5a5a] rounded px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-[10px] uppercase text-[#8b8b8b] mb-1">Email</label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full bg-[#3c3c3c] border border-[#5a5a5a] rounded px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-[10px] uppercase text-[#8b8b8b] mb-1">Password (min 8)</label>
              <input
                type="password"
                required
                minLength={8}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full bg-[#3c3c3c] border border-[#5a5a5a] rounded px-3 py-2 text-sm"
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="w-full py-2 rounded bg-[#1e7e34] hover:bg-[#28a745] text-white text-sm font-medium flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {loading && <Loader2 size={14} className="animate-spin" />}
              Create admin & sign in
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

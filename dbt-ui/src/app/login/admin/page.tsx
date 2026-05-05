'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { signIn } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { Database, Loader2, ArrowLeft } from 'lucide-react';

/**
 * One-time first-admin bootstrap — not linked from the normal sign-in page.
 * Direct URL only: `/login/admin`. Closed automatically once any user exists.
 */
export default function FirstAdminPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(true);
  const [bootstrapOpen, setBootstrapOpen] = useState<boolean | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = await fetch('/api/register');
        const d = (await r.json()) as { bootstrapOpen?: boolean };
        if (!cancelled) setBootstrapOpen(Boolean(d.bootstrapOpen));
      } catch {
        if (!cancelled) setBootstrapOpen(false);
      } finally {
        if (!cancelled) setChecking(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

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
        setError('Account created but sign-in failed — try signing in from /login.');
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
        <div className="flex items-center gap-2 mb-3">
          <Link
            href="/login"
            className="inline-flex items-center gap-1 text-[10px] text-[#8b8b8b] hover:text-[#d4d4d4]"
          >
            <ArrowLeft size={12} />
            Sign in
          </Link>
        </div>

        <h1 className="text-sm font-semibold text-white mb-1">First admin setup</h1>
        <p className="text-[10px] text-[#6e6e6e] mb-4">
          This page is only for initial deployment. It is not shown on the regular login screen.
        </p>

        {checking && (
          <div className="flex items-center gap-2 text-xs text-[#8b8b8b] py-6 justify-center">
            <Loader2 size={14} className="animate-spin" />
            Checking setup status…
          </div>
        )}

        {!checking && bootstrapOpen === false && (
          <div className="space-y-3 text-xs text-[#8b8b8b]">
            <p>
              First-admin registration is <span className="text-[#f48771]">closed</span> — user accounts already exist.
              Ask an administrator to invite you from the Team panel.
            </p>
            <Link
              href="/login"
              className="block w-full text-center py-2 rounded bg-[#3e3e42] hover:bg-[#505050] text-[#d4d4d4] text-sm"
            >
              Go to sign in
            </Link>
          </div>
        )}

        {!checking && bootstrapOpen === true && (
          <>
            {error && (
              <div className="mb-3 text-xs text-[#f48771] border border-[#f48771]/30 rounded px-2 py-1.5 bg-[#f48771]/10">
                {error}
              </div>
            )}
            <form onSubmit={handleBootstrap} className="space-y-3">
              <p className="text-[11px] text-[#8b8b8b] leading-relaxed">
                Creates the first admin user only when no accounts exist yet. After that, admins add users from the Team
                panel.
              </p>
              <p className="text-[10px] text-[#6e6e6e] leading-relaxed">
                Run <span className="font-mono text-[#9cdcfe]">pnpm exec prisma db push</span> from{' '}
                <span className="font-mono text-[#9cdcfe]">dbt-ui</span> so the user database exists.
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
          </>
        )}
      </div>
    </div>
  );
}

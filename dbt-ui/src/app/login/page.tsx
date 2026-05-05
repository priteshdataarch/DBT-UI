'use client';

import { useState } from 'react';
import { signIn } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { Database, Loader2 } from 'lucide-react';

/** Normal sign-in only. First-admin bootstrap lives at `/login/admin` (direct URL, not linked here). */
export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

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

  return (
    <div className="min-h-screen bg-[#1e1e1e] text-[#d4d4d4] flex flex-col items-center justify-center p-6">
      <div className="flex items-center gap-2 mb-6">
        <Database size={24} className="text-[#007acc]" />
        <span className="text-lg font-semibold text-white">DBT DataArch Studio</span>
      </div>

      <div className="w-full max-w-sm border border-[#3e3e42] rounded-lg bg-[#252526] p-5 shadow-xl">
        <h1 className="text-sm font-semibold text-white mb-4">Sign in</h1>

        {error && (
          <div className="mb-3 text-xs text-[#f48771] border border-[#f48771]/30 rounded px-2 py-1.5 bg-[#f48771]/10">
            {error}
          </div>
        )}

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
      </div>
    </div>
  );
}

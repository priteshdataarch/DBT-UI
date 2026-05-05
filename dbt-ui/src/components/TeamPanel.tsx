'use client';

import { useSession, signOut } from 'next-auth/react';
import { useCallback, useEffect, useState } from 'react';
import { Users, X, RefreshCw, Loader2, LogOut } from 'lucide-react';

type Member = { userId: string; email: string; name: string | null; role: string };

type TeamResponse =
  | {
      mode: 'single';
      members: Member[];
      hint?: string;
    }
  | {
      mode: 'team';
      teamName: string;
      teamId: string;
      members: Member[];
    };

interface Props {
  onClose: () => void;
}

export default function TeamPanel({ onClose }: Props) {
  const { data: session, status } = useSession();
  const [data, setData] = useState<TeamResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const [addEmail, setAddEmail] = useState('');
  const [addRole, setAddRole] = useState<'EDITOR' | 'VIEWER' | 'ADMIN'>('EDITOR');
  const [newEmail, setNewEmail] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newName, setNewName] = useState('');
  const [newRole, setNewRole] = useState<'EDITOR' | 'VIEWER' | 'ADMIN'>('EDITOR');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const res = await fetch('/api/team');
      if (!res.ok) {
        const j = (await res.json()) as { error?: string };
        throw new Error(j.error ?? res.statusText);
      }
      setData((await res.json()) as TeamResponse);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to load team');
      setData(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const isAdmin = session?.user?.role === 'ADMIN';

  const addExisting = async () => {
    if (!addEmail.trim()) return;
    setBusy(true);
    try {
      const res = await fetch('/api/team', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: addEmail.trim(), role: addRole }),
      });
      const j = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(j.error ?? 'Failed');
      setAddEmail('');
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Add failed');
    } finally {
      setBusy(false);
    }
  };

  const createUser = async () => {
    if (!newEmail.trim() || newPassword.length < 8) return;
    setBusy(true);
    try {
      const res = await fetch('/api/team/user', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: newEmail.trim(),
          password: newPassword,
          name: newName.trim() || undefined,
          role: newRole,
        }),
      });
      const j = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(j.error ?? 'Failed');
      setNewEmail('');
      setNewPassword('');
      setNewName('');
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Create failed');
    } finally {
      setBusy(false);
    }
  };

  const patchRole = async (userId: string, role: string) => {
    setBusy(true);
    try {
      const res = await fetch('/api/team', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, role }),
      });
      const j = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(j.error ?? 'Failed');
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Update failed');
    } finally {
      setBusy(false);
    }
  };

  const removeMember = async (userId: string) => {
    setBusy(true);
    try {
      const res = await fetch(`/api/team?userId=${encodeURIComponent(userId)}`, { method: 'DELETE' });
      const j = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(j.error ?? 'Failed');
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Remove failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col h-full bg-[#252526] border-l border-[#3e3e42] overflow-hidden">
      <div className="flex items-center justify-between px-3 py-2.5 border-b border-[#3e3e42] shrink-0">
        <div className="flex items-center gap-2">
          <Users size={13} className="text-[#007acc]" />
          <span className="text-xs font-semibold text-[#d4d4d4]">Team</span>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => void load()}
            title="Refresh"
            className="p-1 rounded text-[#8b8b8b] hover:text-[#d4d4d4] hover:bg-[#3e3e42]"
          >
            <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
          </button>
          {status === 'authenticated' && (
            <button
              type="button"
              title="Sign out"
              onClick={() => void signOut({ callbackUrl: '/login' })}
              className="p-1 rounded text-[#8b8b8b] hover:text-[#d4d4d4] hover:bg-[#3e3e42]"
            >
              <LogOut size={12} />
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded text-[#8b8b8b] hover:text-[#d4d4d4] hover:bg-[#3e3e42]"
          >
            <X size={14} />
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto min-h-0 p-3 text-[11px] space-y-3">
        {err && (
          <div className="text-[#f48771] border border-[#f48771]/30 rounded px-2 py-1.5 bg-[#f48771]/10">{err}</div>
        )}

        {loading && (
          <div className="flex items-center gap-2 text-[#8b8b8b]">
            <Loader2 size={12} className="animate-spin" /> Loading…
          </div>
        )}

        {!loading && data?.mode === 'single' && (
          <div className="text-[#8b8b8b] leading-relaxed">
            <p className="text-[#d4d4d4] font-medium mb-1">Single-user mode</p>
            <p>{data.hint ?? 'Schedules still use a default workspace. Enable login for RBAC.'}</p>
            {status === 'unauthenticated' && (
              <a href="/login" className="inline-block mt-2 text-[#007acc] hover:underline">
                Sign in
              </a>
            )}
          </div>
        )}

        {!loading && data?.mode === 'team' && (
          <>
            <div className="text-[#8b8b8b]">
              <span className="text-[#d4d4d4] font-medium">{data.teamName}</span>
              <span className="ml-2 font-mono text-[10px]">{data.teamId.slice(0, 8)}…</span>
            </div>
            {session?.user && (
              <div className="text-[10px] text-[#6e6e6e]">
                Signed in as <span className="text-[#d4d4d4]">{session.user.email}</span> — role{' '}
                <span className="text-[#89d185]">{session.user.role}</span>
              </div>
            )}

            <div className="space-y-1">
              <div className="text-[10px] font-semibold text-[#8b8b8b] uppercase tracking-wide">Members</div>
              {data.members.map((m) => (
                <div
                  key={m.userId}
                  className="flex items-center gap-2 py-1 border-b border-[#3e3e42]/60 last:border-0"
                >
                  <div className="flex-1 min-w-0">
                    <div className="truncate text-[#d4d4d4]">{m.email}</div>
                    {m.name && <div className="text-[10px] text-[#6e6e6e] truncate">{m.name}</div>}
                  </div>
                  {isAdmin ? (
                    <>
                      <select
                        value={m.role}
                        disabled={busy}
                        onChange={(e) => void patchRole(m.userId, e.target.value)}
                        className="bg-[#3c3c3c] border border-[#5a5a5a] rounded px-1 py-0.5 text-[10px] text-[#d4d4d4]"
                      >
                        <option value="VIEWER">VIEWER</option>
                        <option value="EDITOR">EDITOR</option>
                        <option value="ADMIN">ADMIN</option>
                      </select>
                      <button
                        type="button"
                        disabled={busy || m.userId === session?.user?.id}
                        onClick={() => void removeMember(m.userId)}
                        className="text-[#f48771] text-[10px] disabled:opacity-30"
                      >
                        Remove
                      </button>
                    </>
                  ) : (
                    <span className="text-[10px] text-[#89d185]">{m.role}</span>
                  )}
                </div>
              ))}
            </div>

            {isAdmin && (
              <div className="space-y-3 pt-2 border-t border-[#3e3e42]">
                <div>
                  <div className="text-[10px] font-semibold text-[#8b8b8b] uppercase mb-1">Add existing user</div>
                  <div className="flex gap-1">
                    <input
                      value={addEmail}
                      onChange={(e) => setAddEmail(e.target.value)}
                      placeholder="email"
                      className="flex-1 min-w-0 bg-[#3c3c3c] border border-[#5a5a5a] rounded px-2 py-1 text-[11px]"
                    />
                    <select
                      value={addRole}
                      onChange={(e) => setAddRole(e.target.value as typeof addRole)}
                      className="bg-[#3c3c3c] border border-[#5a5a5a] rounded px-1 text-[10px]"
                    >
                      <option value="EDITOR">EDITOR</option>
                      <option value="VIEWER">VIEWER</option>
                      <option value="ADMIN">ADMIN</option>
                    </select>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void addExisting()}
                      className="px-2 py-1 rounded bg-[#0e639c] text-white text-[10px] shrink-0"
                    >
                      Add
                    </button>
                  </div>
                </div>
                <div>
                  <div className="text-[10px] font-semibold text-[#8b8b8b] uppercase mb-1">Create user</div>
                  <input
                    value={newEmail}
                    onChange={(e) => setNewEmail(e.target.value)}
                    placeholder="email"
                    className="w-full bg-[#3c3c3c] border border-[#5a5a5a] rounded px-2 py-1 text-[11px] mb-1"
                  />
                  <input
                    type="password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="password (min 8)"
                    className="w-full bg-[#3c3c3c] border border-[#5a5a5a] rounded px-2 py-1 text-[11px] mb-1"
                  />
                  <input
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    placeholder="display name (optional)"
                    className="w-full bg-[#3c3c3c] border border-[#5a5a5a] rounded px-2 py-1 text-[11px] mb-1"
                  />
                  <div className="flex gap-1 items-center">
                    <select
                      value={newRole}
                      onChange={(e) => setNewRole(e.target.value as typeof newRole)}
                      className="bg-[#3c3c3c] border border-[#5a5a5a] rounded px-1 text-[10px]"
                    >
                      <option value="EDITOR">EDITOR</option>
                      <option value="VIEWER">VIEWER</option>
                      <option value="ADMIN">ADMIN</option>
                    </select>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void createUser()}
                      className="px-2 py-1 rounded bg-[#1e7e34] text-white text-[10px]"
                    >
                      Create
                    </button>
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

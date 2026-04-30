'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  GitBranch,
  RefreshCw,
  GitCommit,
  Upload,
  Download,
  Plus,
  Minus,
  X,
  CheckCircle2,
  AlertCircle,
  ChevronDown,
  ChevronRight,
  ArrowUp,
  ArrowDown,
  Loader2,
  GitMerge,
  Trash2,
  Radio,
} from 'lucide-react';
import type { GitFileEntry, GitStatus, GitBranch as GitBranchType } from '@/app/api/git/route';

interface Props {
  onClose: () => void;
  onRefreshTree?: () => void;
}

// ── Status badge ──────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; color: string }> = {
    M: { label: 'M', color: 'text-[#e2c08d] bg-[#e2c08d]/10 border-[#e2c08d]/30' },
    A: { label: 'A', color: 'text-[#89d185] bg-[#89d185]/10 border-[#89d185]/30' },
    D: { label: 'D', color: 'text-[#f48771] bg-[#f48771]/10 border-[#f48771]/30' },
    R: { label: 'R', color: 'text-[#9cdcfe] bg-[#9cdcfe]/10 border-[#9cdcfe]/30' },
    '?': { label: 'U', color: 'text-[#8b8b8b] bg-[#8b8b8b]/10 border-[#8b8b8b]/30' },
  };
  const s = map[status] ?? { label: status, color: 'text-[#8b8b8b] bg-[#3e3e42] border-[#5a5a5a]' };
  return (
    <span className={`shrink-0 text-[9px] font-bold px-1 py-0.5 rounded border font-mono ${s.color}`}>
      {s.label}
    </span>
  );
}

// ── File list section ─────────────────────────────────────────────────────────

function FileSection({
  title,
  files,
  defaultOpen = true,
  onStage,
  onUnstage,
  onDiscard,
  area,
}: {
  title: string;
  files: GitFileEntry[];
  defaultOpen?: boolean;
  onStage?: (f: GitFileEntry) => void;
  onUnstage?: (f: GitFileEntry) => void;
  onDiscard?: (f: GitFileEntry) => void;
  area: 'staged' | 'unstaged' | 'untracked';
}) {
  const [open, setOpen] = useState(defaultOpen);
  if (files.length === 0) return null;

  return (
    <div>
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 w-full px-3 py-1.5 text-[10px] font-semibold text-[#8b8b8b] uppercase tracking-wider hover:text-[#d4d4d4] transition-colors"
      >
        {open ? <ChevronDown size={10} /> : <ChevronRight size={10} />}
        {title}
        <span className="ml-auto text-[#5a5a5a] font-normal normal-case tracking-normal">
          {files.length}
        </span>
      </button>

      {open && (
        <div className="pb-1">
          {files.map((f) => (
            <div
              key={f.path}
              className="group flex items-center gap-2 px-3 py-1 hover:bg-[#2a2d2e] transition-colors"
            >
              <StatusBadge status={f.status} />
              <span className="flex-1 text-[11px] text-[#d4d4d4] truncate font-mono" title={f.path}>
                {f.path.split('/').pop()}
                <span className="text-[#5a5a5a] ml-1 text-[10px]">
                  {f.path.includes('/') ? f.path.substring(0, f.path.lastIndexOf('/') + 1) : ''}
                </span>
              </span>

              <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                {area !== 'staged' && onStage && (
                  <button
                    onClick={() => onStage(f)}
                    title="Stage file"
                    className="p-0.5 rounded text-[#89d185] hover:bg-[#89d185]/20 transition-colors"
                  >
                    <Plus size={10} />
                  </button>
                )}
                {area === 'staged' && onUnstage && (
                  <button
                    onClick={() => onUnstage(f)}
                    title="Unstage file"
                    className="p-0.5 rounded text-[#e2c08d] hover:bg-[#e2c08d]/20 transition-colors"
                  >
                    <Minus size={10} />
                  </button>
                )}
                {area !== 'staged' && onDiscard && (
                  <button
                    onClick={() => onDiscard(f)}
                    title="Discard changes"
                    className="p-0.5 rounded text-[#f48771] hover:bg-[#f48771]/20 transition-colors"
                  >
                    <X size={10} />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Toast ─────────────────────────────────────────────────────────────────────

function Toast({ message, type }: { message: string; type: 'success' | 'error' }) {
  return (
    <div
      className={`flex items-start gap-2 px-3 py-2 rounded text-xs border ${
        type === 'success'
          ? 'bg-[#89d185]/10 border-[#89d185]/30 text-[#89d185]'
          : 'bg-[#f48771]/10 border-[#f48771]/30 text-[#f48771]'
      }`}
    >
      {type === 'success' ? <CheckCircle2 size={13} className="shrink-0 mt-0.5" /> : <AlertCircle size={13} className="shrink-0 mt-0.5" />}
      <span className="break-all">{message}</span>
    </div>
  );
}

// ── Branch row ────────────────────────────────────────────────────────────────

function BranchRow({
  branch,
  currentBranch,
  actionLoading,
  onSwitch,
  onDelete,
  onDeleteForce,
  onMerge,
}: {
  branch: GitBranchType;
  currentBranch: string;
  actionLoading: string | null;
  onSwitch: () => void;
  onDelete: () => void;
  onDeleteForce: () => void;
  onMerge: () => void;
}) {
  const [showMenu, setShowMenu] = useState(false);
  const isCurrent = branch.name === currentBranch;

  return (
    <div
      className={`group flex items-center gap-2 px-3 py-1.5 hover:bg-[#2a2d2e] transition-colors ${isCurrent ? 'bg-[#007acc]/5' : ''}`}
    >
      <span className={`shrink-0 w-2 h-2 rounded-full ${isCurrent ? 'bg-[#007acc]' : 'bg-[#3e3e42]'}`} />
      <span className={`flex-1 text-[11px] font-mono truncate ${isCurrent ? 'text-[#007acc]' : 'text-[#d4d4d4]'}`}>
        {branch.name}
        {isCurrent && <span className="ml-1 text-[9px] text-[#007acc]/70">current</span>}
      </span>
      {branch.upstream && (
        <span className="text-[9px] text-[#5a5a5a] truncate max-w-[60px]">{branch.upstream}</span>
      )}

      {/* Action menu */}
      <div className="relative shrink-0">
        <button
          onClick={() => setShowMenu((v) => !v)}
          className="opacity-0 group-hover:opacity-100 transition-opacity p-0.5 rounded text-[#555] hover:text-[#888]"
        >
          <ChevronDown size={10} />
        </button>
        {showMenu && (
          <>
            <div className="fixed inset-0 z-10" onClick={() => setShowMenu(false)} />
            <div className="absolute right-0 top-5 z-20 bg-[#252526] border border-[#3e3e42] rounded shadow-xl py-1 w-36 text-[11px]">
              {!isCurrent && (
                <button
                  onClick={() => { setShowMenu(false); onSwitch(); }}
                  disabled={!!actionLoading}
                  className="flex items-center gap-2 w-full px-3 py-1.5 text-[#d4d4d4] hover:bg-[#2a2d2e] transition-colors disabled:opacity-40"
                >
                  <GitBranch size={10} /> Switch to
                </button>
              )}
              {!isCurrent && (
                <button
                  onClick={() => { setShowMenu(false); onMerge(); }}
                  disabled={!!actionLoading}
                  className="flex items-center gap-2 w-full px-3 py-1.5 text-[#d4d4d4] hover:bg-[#2a2d2e] transition-colors disabled:opacity-40"
                >
                  <GitMerge size={10} /> Merge into current
                </button>
              )}
              {!isCurrent && (
                <>
                  <div className="border-t border-[#3e3e42] my-1" />
                  <button
                    onClick={() => { setShowMenu(false); onDelete(); }}
                    disabled={!!actionLoading}
                    className="flex items-center gap-2 w-full px-3 py-1.5 text-[#e2c08d] hover:bg-[#2a2d2e] transition-colors disabled:opacity-40"
                  >
                    <Trash2 size={10} /> Delete
                  </button>
                  <button
                    onClick={() => { setShowMenu(false); onDeleteForce(); }}
                    disabled={!!actionLoading}
                    className="flex items-center gap-2 w-full px-3 py-1.5 text-[#f48771] hover:bg-[#2a2d2e] transition-colors disabled:opacity-40"
                  >
                    <Trash2 size={10} /> Force delete
                  </button>
                </>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ── Panel tabs ────────────────────────────────────────────────────────────────

type GitTab = 'changes' | 'branches';

// ── Main component ────────────────────────────────────────────────────────────

export default function GitPanel({ onClose, onRefreshTree }: Props) {
  const [status, setStatus]             = useState<GitStatus | null>(null);
  const [loading, setLoading]           = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [commitMsg, setCommitMsg]       = useState('');
  const [toast, setToast]               = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const [activeTab, setActiveTab]       = useState<GitTab>('changes');

  // Branch creation
  const [showNewBranch, setShowNewBranch] = useState(false);
  const [newBranchName, setNewBranchName] = useState('');

  const showToast = (message: string, type: 'success' | 'error') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 5000);
  };

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/git');
      const data = await res.json() as GitStatus;
      setStatus(data);
    } catch {
      setStatus(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const act = async (action: string, extra: Record<string, unknown> = {}) => {
    setActionLoading(action);
    try {
      const res = await fetch('/api/git', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, ...extra }),
      });
      const data = await res.json() as { ok?: boolean; error?: string; output?: string };
      if (!res.ok || data.error) {
        showToast(data.error ?? 'Operation failed', 'error');
      } else {
        const msgs: Record<string, string> = {
          'stage-all':    'All changes staged',
          'unstage-all':  'All changes unstaged',
          'unstage-files':'File unstaged',
          commit:         'Committed successfully',
          push:           'Pushed to remote',
          'commit-push':  'Committed and pushed',
          pull:           data.output || 'Pulled from remote',
          'pull-rebase':  data.output || 'Pulled with rebase',
          fetch:          data.output || 'Fetched all remotes',
          'create-branch': data.output || 'Branch created',
          'switch-branch': data.output || 'Switched branch',
          'delete-branch': data.output || 'Branch deleted',
          'delete-branch-force': data.output || 'Branch force-deleted',
          'merge-branch': data.output || 'Branch merged',
        };
        showToast(msgs[action] ?? data.output ?? 'Done', 'success');
        if (action === 'commit' || action === 'commit-push') setCommitMsg('');
        if (['commit-push', 'push', 'pull', 'pull-rebase', 'create-branch', 'switch-branch'].includes(action)) {
          onRefreshTree?.();
        }
        setShowNewBranch(false);
        setNewBranchName('');
        await refresh();
      }
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Network error', 'error');
    } finally {
      setActionLoading(null);
    }
  };

  const stageFile   = (f: GitFileEntry) => act('stage-files',   { files: [f.path] });
  const unstageFile = (f: GitFileEntry) => act('unstage-files', { files: [f.path] });
  const discardFile = (f: GitFileEntry) => act('discard',       { files: [f.path] });

  const totalChanges = status
    ? status.staged.length + status.unstaged.length + status.untracked.length
    : 0;

  const canCommit = (status?.staged.length ?? 0) > 0 && commitMsg.trim().length > 0;
  const canPush   = (status?.ahead ?? 0) > 0;
  const canPull   = (status?.behind ?? 0) > 0;

  return (
    <div className="flex flex-col h-full bg-[#252526] border-l border-[#3e3e42] overflow-hidden">

      {/* ── Header ── */}
      <div className="flex items-center justify-between px-3 py-2.5 border-b border-[#3e3e42] shrink-0">
        <div className="flex items-center gap-2">
          <GitBranch size={13} className="text-[#007acc]" />
          <span className="text-xs font-semibold text-[#d4d4d4]">Source Control</span>
          {totalChanges > 0 && (
            <span className="text-[10px] bg-[#007acc] text-white rounded-full px-1.5 py-0.5 font-medium min-w-[18px] text-center leading-none">
              {totalChanges}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          <button onClick={refresh} disabled={loading} title="Refresh"
            className="p-1 rounded text-[#8b8b8b] hover:text-[#d4d4d4] hover:bg-[#3e3e42] transition-colors disabled:opacity-40">
            <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
          </button>
          <button onClick={onClose} title="Close"
            className="p-1 rounded text-[#8b8b8b] hover:text-[#d4d4d4] hover:bg-[#3e3e42] transition-colors">
            <X size={12} />
          </button>
        </div>
      </div>

      {/* ── Loading ── */}
      {loading && !status && (
        <div className="flex flex-col items-center justify-center flex-1 gap-3 text-[#5a5a5a]">
          <Loader2 size={20} className="animate-spin" />
          <span className="text-xs">Reading git status…</span>
        </div>
      )}

      {/* ── Not a repo ── */}
      {!loading && status && !status.isRepo && (
        <div className="flex flex-col items-center justify-center flex-1 gap-2 text-[#5a5a5a] px-4 text-center">
          <GitBranch size={28} className="opacity-30" />
          <p className="text-xs">No git repository found</p>
          <p className="text-[10px] opacity-60">Run <span className="font-mono bg-[#3e3e42] px-1 rounded">git init</span> in the project root</p>
        </div>
      )}

      {status?.isRepo && (
        <div className="flex flex-col flex-1 overflow-hidden min-h-0">

          {/* ── Branch bar ── */}
          <div className="px-3 py-2 border-b border-[#3e3e42] shrink-0">
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1.5 flex-1 min-w-0">
                <GitBranch size={11} className="text-[#007acc] shrink-0" />
                <span className="text-xs text-[#d4d4d4] font-mono truncate">{status.branch}</span>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                {status.ahead > 0 && (
                  <span className="flex items-center gap-0.5 text-[10px] text-[#89d185]">
                    <ArrowUp size={10} />{status.ahead}
                  </span>
                )}
                {status.behind > 0 && (
                  <span className="flex items-center gap-0.5 text-[10px] text-[#f48771]">
                    <ArrowDown size={10} />{status.behind}
                  </span>
                )}
                {status.ahead === 0 && status.behind === 0 && (
                  <span className="text-[10px] text-[#5a5a5a]">in sync</span>
                )}
              </div>
            </div>

            {/* Fetch / Pull / Push quick actions */}
            <div className="flex gap-1 mt-2">
              <button
                onClick={() => act('fetch')}
                disabled={!!actionLoading}
                title="Fetch all remotes"
                className="flex items-center gap-1 px-2 py-1 text-[10px] rounded border border-[#4a4a4a] text-[#8b8b8b] hover:text-[#d4d4d4] hover:border-[#5a5a5a] transition-colors disabled:opacity-40"
              >
                {actionLoading === 'fetch' ? <Loader2 size={9} className="animate-spin" /> : <Radio size={9} />}
                Fetch
              </button>
              <button
                onClick={() => act('pull')}
                disabled={!!actionLoading}
                title={canPull ? `Pull ${status.behind} commit${status.behind !== 1 ? 's' : ''} from remote` : 'Pull from remote'}
                className={`flex items-center gap-1 px-2 py-1 text-[10px] rounded border transition-colors disabled:opacity-40 ${
                  canPull
                    ? 'border-[#f48771]/40 text-[#f48771] hover:bg-[#f48771]/10'
                    : 'border-[#4a4a4a] text-[#8b8b8b] hover:border-[#5a5a5a] hover:text-[#d4d4d4]'
                }`}
              >
                {actionLoading === 'pull' ? <Loader2 size={9} className="animate-spin" /> : <Download size={9} />}
                Pull {status.behind > 0 ? `(${status.behind})` : ''}
              </button>
              <button
                onClick={() => act('push')}
                disabled={!canPush || !!actionLoading}
                title={canPush ? `Push ${status.ahead} commit${status.ahead !== 1 ? 's' : ''}` : 'Nothing to push'}
                className="flex items-center gap-1 px-2 py-1 text-[10px] rounded border border-[#89d185]/40 text-[#89d185] hover:bg-[#89d185]/10 transition-colors disabled:opacity-40"
              >
                {actionLoading === 'push' ? <Loader2 size={9} className="animate-spin" /> : <Upload size={9} />}
                Push {status.ahead > 0 ? `(${status.ahead})` : ''}
              </button>
            </div>
          </div>

          {/* ── Tab bar ── */}
          <div className="flex border-b border-[#3e3e42] shrink-0">
            {([
              { id: 'changes',  label: `Changes${totalChanges > 0 ? ` (${totalChanges})` : ''}` },
              { id: 'branches', label: `Branches${status.branches?.length ? ` (${status.branches.length})` : ''}` },
            ] as { id: GitTab; label: string }[]).map(({ id, label }) => (
              <button
                key={id}
                onClick={() => setActiveTab(id)}
                className={`flex-1 py-1.5 text-[10px] font-medium transition-colors border-b-2 ${
                  activeTab === id
                    ? 'border-[#007acc] text-[#d4d4d4]'
                    : 'border-transparent text-[#6e6e6e] hover:text-[#aaa]'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {/* ══ CHANGES TAB ══ */}
          {activeTab === 'changes' && (
            <div className="flex flex-col flex-1 overflow-hidden min-h-0">

              {/* Commit area */}
              <div className="px-3 py-3 border-b border-[#3e3e42] space-y-2 shrink-0">
                <textarea
                  value={commitMsg}
                  onChange={(e) => setCommitMsg(e.target.value)}
                  placeholder="Commit message (Ctrl+Enter)"
                  rows={2}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && canCommit) {
                      e.preventDefault();
                      act('commit', { message: commitMsg });
                    }
                  }}
                  className="w-full bg-[#3c3c3c] border border-[#5a5a5a] focus:border-[#007acc] rounded px-2.5 py-2 text-xs text-[#d4d4d4] placeholder-[#5a5a5a] outline-none resize-none transition-colors"
                />

                <div className="grid grid-cols-2 gap-1.5">
                  <button
                    disabled={!canCommit || !!actionLoading}
                    onClick={() => act('commit', { message: commitMsg })}
                    className="flex items-center justify-center gap-1.5 px-2 py-1.5 text-[11px] rounded font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed bg-[#0e639c]/20 border border-[#0e639c]/40 text-[#4fc3f7] hover:bg-[#0e639c]/40"
                  >
                    {actionLoading === 'commit' ? <Loader2 size={11} className="animate-spin" /> : <GitCommit size={11} />}
                    Commit
                  </button>
                  <button
                    disabled={!canCommit || !!actionLoading}
                    onClick={() => act('commit-push', { message: commitMsg })}
                    className="flex items-center justify-center gap-1.5 px-2 py-1.5 text-[11px] rounded font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed bg-[#007acc]/10 border border-[#007acc]/30 text-[#007acc] hover:bg-[#007acc]/20"
                  >
                    {actionLoading === 'commit-push' ? <Loader2 size={11} className="animate-spin" /> : <><GitCommit size={11} /><Upload size={11} /></>}
                    Commit+Push
                  </button>
                </div>
              </div>

              {/* Stage all / unstage all */}
              {totalChanges > 0 && (
                <div className="flex gap-1.5 px-3 py-2 border-b border-[#3e3e42] shrink-0">
                  <button
                    onClick={() => act('stage-all')}
                    disabled={!!actionLoading}
                    className="flex items-center gap-1 px-2 py-1 text-[10px] rounded border border-[#89d185]/30 text-[#89d185] hover:bg-[#89d185]/10 transition-colors disabled:opacity-40"
                  >
                    {actionLoading === 'stage-all' ? <Loader2 size={9} className="animate-spin" /> : <Plus size={9} />}
                    Stage All
                  </button>
                  <button
                    onClick={() => act('unstage-all')}
                    disabled={!!actionLoading || status.staged.length === 0}
                    className="flex items-center gap-1 px-2 py-1 text-[10px] rounded border border-[#e2c08d]/30 text-[#e2c08d] hover:bg-[#e2c08d]/10 transition-colors disabled:opacity-40"
                  >
                    {actionLoading === 'unstage-all' ? <Loader2 size={9} className="animate-spin" /> : <Minus size={9} />}
                    Unstage All
                  </button>
                </div>
              )}

              {/* File lists */}
              <div className="flex-1 overflow-y-auto min-h-0">
                {totalChanges === 0 && !loading && (
                  <div className="flex flex-col items-center justify-center h-full gap-2 text-[#5a5a5a]">
                    <CheckCircle2 size={24} className="opacity-40" />
                    <p className="text-xs">Working tree clean</p>
                  </div>
                )}
                <FileSection title="Staged Changes" files={status.staged} area="staged" onUnstage={unstageFile} />
                <FileSection title="Changes" files={status.unstaged} area="unstaged" onStage={stageFile} onDiscard={discardFile} />
                <FileSection title="Untracked" files={status.untracked} defaultOpen={false} area="untracked" onStage={stageFile} />
              </div>
            </div>
          )}

          {/* ══ BRANCHES TAB ══ */}
          {activeTab === 'branches' && (
            <div className="flex flex-col flex-1 overflow-hidden min-h-0">

              {/* New branch input */}
              <div className="px-3 py-2 border-b border-[#3e3e42] shrink-0">
                {showNewBranch ? (
                  <div className="flex gap-1.5">
                    <input
                      autoFocus
                      value={newBranchName}
                      onChange={(e) => setNewBranchName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && newBranchName.trim()) {
                          act('create-branch', { branch: newBranchName.trim() });
                        }
                        if (e.key === 'Escape') { setShowNewBranch(false); setNewBranchName(''); }
                      }}
                      placeholder="New branch name…"
                      className="flex-1 bg-[#3c3c3c] border border-[#007acc]/50 focus:border-[#007acc] rounded px-2 py-1 text-xs text-[#d4d4d4] placeholder-[#5a5a5a] outline-none"
                    />
                    <button
                      onClick={() => newBranchName.trim() && act('create-branch', { branch: newBranchName.trim() })}
                      disabled={!newBranchName.trim() || !!actionLoading}
                      className="px-2 py-1 text-[10px] rounded bg-[#007acc]/20 border border-[#007acc]/40 text-[#007acc] hover:bg-[#007acc]/30 disabled:opacity-40"
                    >
                      {actionLoading === 'create-branch' ? <Loader2 size={9} className="animate-spin" /> : 'Create'}
                    </button>
                    <button
                      onClick={() => { setShowNewBranch(false); setNewBranchName(''); }}
                      className="p-1 text-[#555] hover:text-[#888] rounded"
                    >
                      <X size={11} />
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => setShowNewBranch(true)}
                    className="flex items-center gap-1.5 w-full px-2 py-1.5 text-[11px] rounded border border-[#3e3e42] text-[#8b8b8b] hover:border-[#007acc]/40 hover:text-[#007acc] transition-colors"
                  >
                    <Plus size={11} />
                    New branch
                  </button>
                )}
              </div>

              {/* Branch list */}
              <div className="flex-1 overflow-y-auto min-h-0">
                {(status.branches ?? []).length === 0 && (
                  <p className="text-[11px] text-[#5a5a5a] px-3 py-4 text-center">No branches found</p>
                )}
                {(status.branches ?? []).map((b: GitBranchType) => (
                  <BranchRow
                    key={b.name}
                    branch={b}
                    currentBranch={status.branch}
                    actionLoading={actionLoading}
                    onSwitch={() => act('switch-branch', { branch: b.name })}
                    onDelete={() => act('delete-branch', { branch: b.name })}
                    onDeleteForce={() => act('delete-branch-force', { branch: b.name })}
                    onMerge={() => act('merge-branch', { branch: b.name })}
                  />
                ))}
              </div>
            </div>
          )}

          {/* ── Toast ── */}
          {toast && (
            <div className="px-3 py-2 border-t border-[#3e3e42] shrink-0">
              <Toast message={toast.message} type={toast.type} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

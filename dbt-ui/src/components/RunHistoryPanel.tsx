'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  X, RefreshCw, Trash2, ChevronDown, ChevronRight,
  CheckCircle2, XCircle, AlertCircle, Clock, Terminal,
  Loader2, History,
} from 'lucide-react';
import type { RunEntry } from '@/app/api/runs/route';

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.floor(ms / 60_000)}m ${Math.floor((ms % 60_000) / 1000)}s`;
}

function fmtDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString(undefined, {
    month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
}

function fmtAgo(iso: string): string {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

// ── Status badge ──────────────────────────────────────────────────────────────

function StatusIcon({ status }: { status: RunEntry['status'] }) {
  if (status === 'success')   return <CheckCircle2 size={13} className="text-[#4caf50] shrink-0" />;
  if (status === 'failed')    return <XCircle      size={13} className="text-[#f48771] shrink-0" />;
  return                             <AlertCircle  size={13} className="text-[#d7ba7d] shrink-0" />;
}

function StatusBadge({ status }: { status: RunEntry['status'] }) {
  const cfg = {
    success:   'bg-[#4caf50]/10 text-[#4caf50] border-[#4caf50]/30',
    failed:    'bg-[#f48771]/10 text-[#f48771] border-[#f48771]/30',
    cancelled: 'bg-[#d7ba7d]/10 text-[#d7ba7d] border-[#d7ba7d]/30',
  }[status];
  return (
    <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded border ${cfg}`}>
      {status.toUpperCase()}
    </span>
  );
}

function TargetBadge({ target }: { target: string }) {
  const isProd = target === 'prod' || target === 'production';
  return (
    <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded border ${
      isProd
        ? 'bg-[#f59e0b]/10 text-[#f59e0b] border-[#f59e0b]/30'
        : 'bg-[#4ade80]/10 text-[#4ade80] border-[#4ade80]/30'
    }`}>
      {target}
    </span>
  );
}

// ── Run row ───────────────────────────────────────────────────────────────────

function RunRow({ run, onRerun }: { run: RunEntry; onRerun: (cmd: string) => void }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="border-b border-[#1e1e1e] last:border-b-0">
      {/* Summary row */}
      <div
        className="flex items-center gap-3 px-4 py-2.5 hover:bg-[#222] transition-colors cursor-pointer select-none"
        onClick={() => setExpanded(v => !v)}
      >
        <StatusIcon status={run.status} />

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[11px] font-mono text-[#d4d4d4] truncate">{run.command}</span>
            <TargetBadge target={run.target} />
            <StatusBadge status={run.status} />
          </div>
          {run.summary && (
            <p className="text-[10px] text-[#5a5a5a] mt-0.5 truncate">{run.summary}</p>
          )}
        </div>

        <div className="flex items-center gap-3 shrink-0 text-[10px] text-[#5a5a5a]">
          <span className="flex items-center gap-1">
            <Clock size={9} />
            {fmtDuration(run.durationMs)}
          </span>
          <span title={fmtDate(run.startedAt)}>{fmtAgo(run.startedAt)}</span>
          {expanded ? <ChevronDown size={10} /> : <ChevronRight size={10} />}
        </div>
      </div>

      {/* Expanded output */}
      {expanded && (
        <div className="bg-[#111] border-t border-[#1e1e1e] px-4 py-3">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] text-[#5a5a5a]">
              Started {fmtDate(run.startedAt)} · exit code {run.exitCode} · {fmtDuration(run.durationMs)}
            </span>
            <button
              onClick={(e) => { e.stopPropagation(); onRerun(run.command); }}
              className="text-[10px] text-[#007acc] hover:underline"
            >
              ↺ Re-run
            </button>
          </div>
          {run.lines && run.lines.length > 0 ? (
            <div className="max-h-64 overflow-y-auto rounded bg-[#0d0d0d] p-2">
              {run.lines.map((line, i) => (
                <div key={i} className={`text-[11px] font-mono leading-5 ${
                  line.lineType === 'success' ? 'text-[#4caf50]'
                  : line.lineType === 'error'   ? 'text-[#f48771]'
                  : line.lineType === 'warning'  ? 'text-[#d7ba7d]'
                  : 'text-[#9a9a9a]'
                }`}>
                  {line.text}
                </div>
              ))}
            </div>
          ) : (
            <p className="text-[10px] text-[#3a3a3a] italic">No output captured</p>
          )}
        </div>
      )}
    </div>
  );
}

// ── Main panel ────────────────────────────────────────────────────────────────

interface Props {
  onClose: () => void;
  onRerun?: (command: string) => void;
}

export default function RunHistoryPanel({ onClose, onRerun }: Props) {
  const [runs, setRuns]       = useState<RunEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter]   = useState<'all' | 'success' | 'failed'>('all');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/runs');
      const data = await res.json() as RunEntry[];
      setRuns(data);
    } catch { setRuns([]); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const clearHistory = async () => {
    await fetch('/api/runs', { method: 'DELETE' });
    setRuns([]);
  };

  const filtered = filter === 'all' ? runs : runs.filter(r => r.status === filter);

  const successCount  = runs.filter(r => r.status === 'success').length;
  const failedCount   = runs.filter(r => r.status === 'failed').length;

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-[#1a1a1a] font-mono">

      {/* Title bar */}
      <div className="flex items-center gap-3 px-4 h-10 bg-[#252526] border-b border-[#1e1e1e] shrink-0">
        <History size={13} className="text-[#569cd6]" />
        <span className="text-sm font-semibold text-[#d4d4d4]">Run History</span>
        <span className="text-[11px] text-[#5a5a5a]">{runs.length} runs</span>
        {runs.length > 0 && (
          <>
            <span className="text-[10px] text-[#4caf50]">{successCount} passed</span>
            <span className="text-[10px] text-[#f48771]">{failedCount} failed</span>
          </>
        )}
        <div className="ml-auto flex items-center gap-1">
          <button onClick={load} disabled={loading} title="Refresh"
            className="p-1.5 rounded text-[#6a6a6a] hover:text-[#d4d4d4] hover:bg-[#3e3e42] transition-colors disabled:opacity-40">
            <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
          </button>
          {runs.length > 0 && (
            <button onClick={clearHistory} title="Clear all history"
              className="p-1.5 rounded text-[#6a6a6a] hover:text-[#f48771] hover:bg-[#f48771]/10 transition-colors">
              <Trash2 size={12} />
            </button>
          )}
          <button onClick={onClose}
            className="p-1.5 rounded text-[#6a6a6a] hover:text-[#d4d4d4] hover:bg-[#3e3e42] transition-colors">
            <X size={13} />
          </button>
        </div>
      </div>

      {/* Filter bar */}
      <div className="flex items-center gap-1 px-4 py-1.5 border-b border-[#1e1e1e] bg-[#252526] shrink-0">
        {(['all', 'success', 'failed'] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-2.5 py-0.5 text-[10px] rounded transition-colors ${
              filter === f
                ? 'bg-[#007acc] text-white'
                : 'text-[#6a6a6a] hover:text-[#d4d4d4] hover:bg-[#3e3e42]'
            }`}
          >
            {f === 'all' ? `All (${runs.length})` : f === 'success' ? `✓ Passed (${successCount})` : `✗ Failed (${failedCount})`}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto min-h-0">
        {loading && (
          <div className="flex items-center justify-center h-full gap-3 text-[#5a5a5a]">
            <Loader2 size={20} className="animate-spin" />
            <span className="text-xs">Loading run history…</span>
          </div>
        )}

        {!loading && filtered.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full gap-3 text-[#3a3a3a] select-none">
            <Terminal size={32} className="opacity-30" />
            <p className="text-sm text-[#5a5a5a]">
              {filter === 'all' ? 'No runs yet — execute a dbt command to start' : `No ${filter} runs`}
            </p>
          </div>
        )}

        {!loading && filtered.length > 0 && (
          <div>
            {filtered.map((run) => (
              <RunRow
                key={run.id}
                run={run}
                onRerun={(cmd) => onRerun?.(cmd)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

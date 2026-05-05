'use client';

import { useCallback, useEffect, useState } from 'react';
import { CalendarClock, X, RefreshCw, Loader2, Play, Trash2 } from 'lucide-react';
import type { DbtCommand } from '@/components/OutputPanel';

type ScheduleRow = {
  id: string;
  name: string;
  cronExpr: string;
  timezone: string;
  enabled: boolean;
  dbtTarget: string;
  command: string;
  selectArg: string | null;
  lastRunAt: string | null;
  createdAt: string;
  logs: { id: string; startedAt: string; exitCode: number | null; summary: string | null }[];
};

interface Props {
  onClose: () => void;
  onRunNow: (cmd: DbtCommand) => void;
}

export default function SchedulesPanel({ onClose, onRunNow }: Props) {
  const [rows, setRows] = useState<ScheduleRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [name, setName] = useState('');
  const [cronExpr, setCronExpr] = useState('0 9 * * *');
  const [timezone, setTimezone] = useState('UTC');
  const [dbtTarget, setDbtTarget] = useState('dev');
  const [command, setCommand] = useState('run');
  const [selectArg, setSelectArg] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const res = await fetch('/api/schedules');
      if (!res.ok) {
        const j = (await res.json()) as { error?: string };
        throw new Error(j.error ?? res.statusText);
      }
      const j = (await res.json()) as { schedules: ScheduleRow[] };
      setRows(j.schedules);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to load');
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const create = async () => {
    if (!name.trim()) return;
    setBusy(true);
    try {
      const res = await fetch('/api/schedules', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          cronExpr,
          timezone,
          dbtTarget,
          command,
          selectArg: selectArg.trim() || null,
        }),
      });
      const j = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(j.error ?? 'Failed');
      setName('');
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Create failed');
    } finally {
      setBusy(false);
    }
  };

  const toggle = async (row: ScheduleRow) => {
    setBusy(true);
    try {
      const res = await fetch('/api/schedules', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: row.id, enabled: !row.enabled }),
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

  const remove = async (id: string) => {
    setBusy(true);
    try {
      const res = await fetch(`/api/schedules?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
      const j = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(j.error ?? 'Failed');
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Delete failed');
    } finally {
      setBusy(false);
    }
  };

  const runNow = (row: ScheduleRow) => {
    const args: string[] = [];
    const modelName = row.selectArg?.trim() || undefined;
    const labelParts = [`dbt ${row.command}`, ...args];
    if (modelName) labelParts.push('--select', modelName);
    if (row.dbtTarget) labelParts.push('--target', row.dbtTarget);
    onRunNow({
      command: row.command,
      args,
      modelName,
      target: row.dbtTarget,
      label: labelParts.join(' '),
    });
  };

  return (
    <div className="flex flex-col h-full bg-[#252526] border-l border-[#3e3e42] overflow-hidden">
      <div className="flex items-center justify-between px-3 py-2.5 border-b border-[#3e3e42] shrink-0">
        <div className="flex items-center gap-2">
          <CalendarClock size={13} className="text-[#007acc]" />
          <span className="text-xs font-semibold text-[#d4d4d4]">Schedules</span>
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
          <button type="button" onClick={onClose} className="p-1 rounded text-[#8b8b8b] hover:text-[#d4d4d4] hover:bg-[#3e3e42]">
            <X size={14} />
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto min-h-0 p-3 text-[11px] space-y-3">
        {err && (
          <div className="text-[#f48771] border border-[#f48771]/30 rounded px-2 py-1.5 bg-[#f48771]/10">{err}</div>
        )}

        <div className="text-[10px] text-[#6e6e6e] leading-relaxed border border-[#3e3e42] rounded p-2 bg-[#1e1e1e]">
          Call{' '}
          <code className="text-[#9cdcfe]">POST /api/cron/tick</code> with{' '}
          <code className="text-[#9cdcfe]">Authorization: Bearer $CRON_SECRET</code> on a timer (e.g. crontab every
          minute). Each due job runs <code className="text-[#9cdcfe]">dbt</code> synchronously on the server.
        </div>

        <div className="space-y-2 border border-[#3e3e42] rounded p-2 bg-[#1e1e1e]">
          <div className="text-[10px] font-semibold text-[#8b8b8b] uppercase">New schedule</div>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Name"
            className="w-full bg-[#3c3c3c] border border-[#5a5a5a] rounded px-2 py-1"
          />
          <div className="grid grid-cols-2 gap-1">
            <input
              value={cronExpr}
              onChange={(e) => setCronExpr(e.target.value)}
              placeholder="cron"
              title="Cron expression"
              className="bg-[#3c3c3c] border border-[#5a5a5a] rounded px-2 py-1 font-mono text-[10px]"
            />
            <input
              value={timezone}
              onChange={(e) => setTimezone(e.target.value)}
              placeholder="TZ"
              className="bg-[#3c3c3c] border border-[#5a5a5a] rounded px-2 py-1 text-[10px]"
            />
          </div>
          <div className="grid grid-cols-2 gap-1">
            <select
              value={command}
              onChange={(e) => setCommand(e.target.value)}
              className="bg-[#3c3c3c] border border-[#5a5a5a] rounded px-2 py-1 text-[10px]"
            >
              <option value="run">run</option>
              <option value="test">test</option>
              <option value="build">build</option>
              <option value="seed">seed</option>
              <option value="snapshot">snapshot</option>
            </select>
            <input
              value={dbtTarget}
              onChange={(e) => setDbtTarget(e.target.value)}
              placeholder="target"
              className="bg-[#3c3c3c] border border-[#5a5a5a] rounded px-2 py-1 text-[10px]"
            />
          </div>
          <input
            value={selectArg}
            onChange={(e) => setSelectArg(e.target.value)}
            placeholder="--select (optional model)"
            className="w-full bg-[#3c3c3c] border border-[#5a5a5a] rounded px-2 py-1 font-mono text-[10px]"
          />
          <button
            type="button"
            disabled={busy || !name.trim()}
            onClick={() => void create()}
            className="w-full py-1.5 rounded bg-[#0e639c] text-white text-[11px] font-medium disabled:opacity-40"
          >
            Save schedule
          </button>
        </div>

        {loading && (
          <div className="flex items-center gap-2 text-[#8b8b8b]">
            <Loader2 size={12} className="animate-spin" /> Loading…
          </div>
        )}

        {!loading && rows.length === 0 && <div className="text-[#6e6e6e]">No schedules yet.</div>}

        {!loading &&
          rows.map((row) => (
            <div key={row.id} className="border border-[#3e3e42] rounded p-2 space-y-1 bg-[#1e1e1e]">
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium text-[#d4d4d4] truncate">{row.name}</span>
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    type="button"
                    title="Run now in UI"
                    onClick={() => runNow(row)}
                    className="p-1 rounded text-[#89d185] hover:bg-[#89d185]/10"
                  >
                    <Play size={12} />
                  </button>
                  <button
                    type="button"
                    title={row.enabled ? 'Disable' : 'Enable'}
                    onClick={() => void toggle(row)}
                    disabled={busy}
                    className={`text-[10px] px-1.5 py-0.5 rounded border ${
                      row.enabled
                        ? 'border-[#89d185]/40 text-[#89d185]'
                        : 'border-[#5a5a5a] text-[#8b8b8b]'
                    }`}
                  >
                    {row.enabled ? 'on' : 'off'}
                  </button>
                  <button
                    type="button"
                    title="Delete"
                    onClick={() => void remove(row.id)}
                    disabled={busy}
                    className="p-1 rounded text-[#f48771] hover:bg-[#f48771]/10"
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
              </div>
              <div className="font-mono text-[10px] text-[#9cdcfe]">
                {row.cronExpr} <span className="text-[#6e6e6e]">{row.timezone}</span>
              </div>
              <div className="text-[10px] text-[#8b8b8b]">
                dbt {row.command}
                {row.selectArg ? ` --select ${row.selectArg}` : ''} — target {row.dbtTarget}
              </div>
              {row.lastRunAt && (
                <div className="text-[9px] text-[#5a5a5a]">Last run: {new Date(row.lastRunAt).toLocaleString()}</div>
              )}
              {row.logs?.length > 0 && (
                <div className="text-[9px] text-[#6e6e6e] border-t border-[#3e3e42] pt-1 mt-1 space-y-0.5">
                  {row.logs.map((l) => (
                    <div key={l.id} className="truncate" title={l.summary ?? ''}>
                      {l.exitCode === 0 ? '✓' : l.exitCode != null ? '✗' : '·'}{' '}
                      {l.summary?.slice(0, 120) ?? '—'}
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
      </div>
    </div>
  );
}

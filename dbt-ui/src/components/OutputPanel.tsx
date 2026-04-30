'use client';

import {
  useState,
  useRef,
  useEffect,
  useCallback,
  forwardRef,
  useImperativeHandle,
} from 'react';
import {
  Terminal,
  ChevronUp,
  ChevronDown,
  CheckCircle,
  XCircle,
  Loader2,
  Trash2,
  Table2,
  ExternalLink,
  StopCircle,
  FlaskConical,
  RefreshCw,
  AlertTriangle,
  SkipForward,
} from 'lucide-react';
import type { TestResultRow, TestResultsResponse } from '@/app/api/test-results/route';
import type { FreshnessRow, FreshnessResponse } from '@/app/api/freshness/route';

export interface DbtCommand {
  command: string;
  args?: string[];
  modelName?: string;
  label: string;
  target?: string;  // dbt --target <env>
}

export interface PreviewResult {
  columns: string[];
  rows: Record<string, string>[];
}

export interface OutputPanelRef {
  runCommand: (cmd: DbtCommand) => void;
}

export interface OutputLine {
  text: string;
  lineType: 'info' | 'success' | 'error' | 'warning';
}

export interface CommandCompletePayload {
  exitCode: number;
  durationMs: number;
  label: string;
  target: string;
  lines: OutputLine[];
}

type OutputTab = 'output' | 'preview' | 'tests' | 'freshness';

interface Props {
  open: boolean;
  onToggle: () => void;
  onCommandComplete: (payload: CommandCompletePayload) => void;
  previewResult: PreviewResult | null;
  previewLoading: boolean;
  previewError: string | null;
  activeOutputTab: OutputTab;
  onOutputTabChange: (tab: OutputTab) => void;
  /** Active dbt `--target` for toolbar + typed dbt commands in the terminal */
  dbtTarget: string;
}

// ─── Test Results sub-component ───────────────────────────────────────────────

type TestFilter = 'all' | 'fail' | 'error' | 'warn' | 'pass';

function statusIcon(status: TestResultRow['status'], size = 12) {
  if (status === 'pass')    return <CheckCircle    size={size} className="text-green-400 shrink-0" />;
  if (status === 'fail')    return <XCircle        size={size} className="text-red-400 shrink-0" />;
  if (status === 'error')   return <AlertTriangle  size={size} className="text-orange-400 shrink-0" />;
  if (status === 'warn')    return <AlertTriangle  size={size} className="text-yellow-400 shrink-0" />;
  return                           <SkipForward    size={size} className="text-[#555] shrink-0" />;
}

function statusBadge(status: TestResultRow['status']) {
  const map = {
    pass:    'bg-green-900/50 text-green-400 border-green-800',
    fail:    'bg-red-900/50 text-red-400 border-red-800',
    error:   'bg-orange-900/50 text-orange-400 border-orange-800',
    warn:    'bg-yellow-900/50 text-yellow-400 border-yellow-800',
    skipped: 'bg-[#1a1a1a] text-[#555] border-[#333]',
  } as const;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded border text-[10px] font-semibold uppercase ${map[status]}`}>
      {statusIcon(status, 10)}
      {status}
    </span>
  );
}

// ─── Freshness tab sub-component ─────────────────────────────────────────────

function freshnessStatusBadge(status: FreshnessRow['status']) {
  const map = {
    pass:           'bg-green-900/50 text-green-400 border-green-800',
    warn:           'bg-yellow-900/50 text-yellow-400 border-yellow-800',
    error:          'bg-red-900/50 text-red-400 border-red-800',
    'runtime error':'bg-orange-900/50 text-orange-400 border-orange-800',
    skipped:        'bg-[#1a1a1a] text-[#555] border-[#333]',
  } as const;
  const cls = map[status] ?? map.skipped;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded border text-[10px] font-semibold uppercase ${cls}`}>
      {status}
    </span>
  );
}

function fmtAgo(seconds: number | null): string {
  if (seconds == null) return '—';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0) return `${h}h ${m}m ago`;
  if (m > 0) return `${m}m ago`;
  return `${Math.floor(seconds)}s ago`;
}

function FreshnessTab() {
  const [data, setData]       = useState<FreshnessResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const res = await fetch('/api/freshness');
      const json = await res.json();
      if (!res.ok) { setError(json.error ?? 'Failed to load'); setData(null); }
      else setData(json as FreshnessResponse);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Network error');
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="flex items-center gap-2 px-3 py-1.5 border-b border-[#2a2a2a] bg-[#111] shrink-0">
        <button onClick={load} disabled={loading}
          className="flex items-center gap-1 text-[10px] text-[#666] hover:text-[#aaa] transition-colors disabled:opacity-40">
          <RefreshCw size={10} className={loading ? 'animate-spin' : ''} /> Refresh
        </button>
        {data && (
          <>
            <div className="w-px h-3 bg-[#2a2a2a]" />
            <span className="text-green-400 text-[10px] font-mono">✓ {data.summary.pass} pass</span>
            {data.summary.warn  > 0 && <span className="text-yellow-400 text-[10px] font-mono">▲ {data.summary.warn} warn</span>}
            {data.summary.error > 0 && <span className="text-red-400 text-[10px] font-mono">✗ {data.summary.error} error</span>}
            {data.generatedAt && <span className="ml-auto text-[#333] text-[10px]">{new Date(data.generatedAt).toLocaleTimeString()}</span>}
          </>
        )}
      </div>
      <div className="flex-1 overflow-auto min-h-0">
        {loading && <div className="flex items-center justify-center h-full gap-2 text-[#555] text-xs"><Loader2 size={14} className="animate-spin" /> Loading…</div>}
        {!loading && error && <div className="flex flex-col items-center justify-center h-full gap-2 text-[#555] text-xs px-4 text-center"><p>{error}</p></div>}
        {!loading && !error && data && (
          <table className="w-full text-xs border-collapse font-mono">
            <thead className="sticky top-0 z-10">
              <tr className="bg-[#1a1a1a]">
                <th className="px-3 py-1.5 text-left text-[#555] font-semibold border-b border-r border-[#2a2a2a] w-24">Status</th>
                <th className="px-3 py-1.5 text-left text-[#555] font-semibold border-b border-r border-[#2a2a2a]">Source</th>
                <th className="px-3 py-1.5 text-left text-[#555] font-semibold border-b border-r border-[#2a2a2a]">Table</th>
                <th className="px-3 py-1.5 text-left text-[#555] font-semibold border-b border-r border-[#2a2a2a]">Last Loaded</th>
                <th className="px-3 py-1.5 text-left text-[#555] font-semibold border-b border-r border-[#2a2a2a]">Age</th>
                <th className="px-3 py-1.5 text-left text-[#555] font-semibold border-b border-r border-[#2a2a2a]">Warn After</th>
                <th className="px-3 py-1.5 text-left text-[#555] font-semibold border-b border-[#2a2a2a]">Error After</th>
              </tr>
            </thead>
            <tbody>
              {data.results.map((row, i) => (
                <tr key={row.uniqueId} className={`${i % 2 === 0 ? 'bg-[#0d0d0d]' : 'bg-[#111]'} hover:bg-[#181818]`}>
                  <td className="px-3 py-1.5 border-b border-r border-[#1a1a1a]">{freshnessStatusBadge(row.status)}</td>
                  <td className="px-3 py-1.5 border-b border-r border-[#1a1a1a] text-[#9cdcfe]">{row.sourceName}</td>
                  <td className="px-3 py-1.5 border-b border-r border-[#1a1a1a] text-[#d4d4d4]">{row.tableName}</td>
                  <td className="px-3 py-1.5 border-b border-r border-[#1a1a1a] text-[#ce9178] whitespace-nowrap">
                    {row.maxLoadedAt ? new Date(row.maxLoadedAt).toLocaleString() : '—'}
                  </td>
                  <td className="px-3 py-1.5 border-b border-r border-[#1a1a1a] text-[#888]">{fmtAgo(row.agoSeconds)}</td>
                  <td className="px-3 py-1.5 border-b border-r border-[#1a1a1a] text-[#555]">{row.warnAfter ?? '—'}</td>
                  <td className="px-3 py-1.5 border-b border-[#1a1a1a] text-[#555]">{row.errorAfter ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function TestResultsTab() {
  const [data, setData]           = useState<TestResultsResponse | null>(null);
  const [loading, setLoading]     = useState(false);
  const [error, setError]         = useState<string | null>(null);
  const [filter, setFilter]       = useState<TestFilter>('all');
  const [search, setSearch]       = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/test-results');
      const json = await res.json();
      if (!res.ok) { setError(json.error ?? 'Failed to load'); setData(null); }
      else setData(json as TestResultsResponse);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Network error');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = (data?.results ?? []).filter((r) => {
    if (filter !== 'all' && r.status !== filter) return false;
    if (search) {
      const q = search.toLowerCase();
      return r.model.toLowerCase().includes(q) || r.testType.toLowerCase().includes(q) || r.column.toLowerCase().includes(q);
    }
    return true;
  });

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* toolbar */}
      <div className="flex items-center gap-2 px-3 py-1.5 border-b border-[#2a2a2a] bg-[#111] shrink-0">
        <button
          onClick={load}
          disabled={loading}
          className="flex items-center gap-1 text-[10px] text-[#666] hover:text-[#aaa] transition-colors disabled:opacity-40"
        >
          <RefreshCw size={10} className={loading ? 'animate-spin' : ''} />
          Refresh
        </button>

        <div className="w-px h-3 bg-[#2a2a2a]" />

        {/* filter pills */}
        {(['all', 'fail', 'error', 'warn', 'pass'] as TestFilter[]).map((f) => {
          const count = f === 'all'
            ? data?.summary.total
            : data?.summary[f as keyof typeof data.summary];
          return (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-2 py-0.5 text-[10px] rounded border transition-colors ${
                filter === f
                  ? 'bg-[#007acc] border-[#007acc] text-white'
                  : 'border-[#2a2a2a] text-[#555] hover:text-[#888] hover:border-[#444]'
              }`}
            >
              {f === 'all' ? 'All' : f.toUpperCase()} {count != null ? `(${count})` : ''}
            </button>
          );
        })}

        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Filter model / test / column…"
          className="ml-auto bg-[#1a1a1a] border border-[#2a2a2a] rounded px-2 py-0.5 text-[10px] text-[#aaa] placeholder-[#333] outline-none w-44"
        />
      </div>

      {/* summary bar */}
      {data && (
        <div className="flex items-center gap-4 px-3 py-1 border-b border-[#2a2a2a] bg-[#0d0d0d] text-[10px] font-mono shrink-0">
          <span className="text-green-400">✓ {data.summary.pass} passed</span>
          {data.summary.fail  > 0 && <span className="text-red-400">✗ {data.summary.fail} failed</span>}
          {data.summary.error > 0 && <span className="text-orange-400">⚠ {data.summary.error} errors</span>}
          {data.summary.warn  > 0 && <span className="text-yellow-400">▲ {data.summary.warn} warnings</span>}
          <span className="text-[#444]">·</span>
          <span className="text-[#444]">{data.elapsedSec.toFixed(2)}s total</span>
          {data.generatedAt && (
            <span className="ml-auto text-[#333]">
              {new Date(data.generatedAt).toLocaleTimeString()}
            </span>
          )}
        </div>
      )}

      {/* content */}
      <div className="flex-1 overflow-auto min-h-0">
        {loading && (
          <div className="flex items-center justify-center h-full gap-2 text-[#555] text-xs">
            <Loader2 size={14} className="animate-spin" /> Loading test results…
          </div>
        )}

        {!loading && error && (
          <div className="flex flex-col items-center justify-center h-full gap-2 text-[#555] text-xs px-4 text-center">
            <FlaskConical size={24} className="text-[#333]" />
            <p className="text-[#555]">{error}</p>
          </div>
        )}

        {!loading && !error && filtered.length === 0 && data && (
          <div className="flex items-center justify-center h-full text-[#444] text-xs italic">
            No tests match the current filter.
          </div>
        )}

        {!loading && !error && filtered.length > 0 && (
          <table className="w-full text-xs border-collapse font-mono">
            <thead className="sticky top-0 z-10">
              <tr className="bg-[#1a1a1a]">
                <th className="px-3 py-1.5 text-left text-[#555] font-semibold border-b border-r border-[#2a2a2a] whitespace-nowrap w-24">Status</th>
                <th className="px-3 py-1.5 text-left text-[#555] font-semibold border-b border-r border-[#2a2a2a] whitespace-nowrap">Model</th>
                <th className="px-3 py-1.5 text-left text-[#555] font-semibold border-b border-r border-[#2a2a2a] whitespace-nowrap">Test</th>
                <th className="px-3 py-1.5 text-left text-[#555] font-semibold border-b border-r border-[#2a2a2a] whitespace-nowrap">Column</th>
                <th className="px-3 py-1.5 text-left text-[#555] font-semibold border-b border-r border-[#2a2a2a] whitespace-nowrap w-16">Time</th>
                <th className="px-3 py-1.5 text-left text-[#555] font-semibold border-b border-[#2a2a2a]">Message</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((row, i) => (
                <tr key={i} className={`${i % 2 === 0 ? 'bg-[#0d0d0d]' : 'bg-[#111]'} hover:bg-[#181818]`}>
                  <td className="px-3 py-1.5 border-b border-r border-[#1a1a1a]">{statusBadge(row.status)}</td>
                  <td className="px-3 py-1.5 border-b border-r border-[#1a1a1a] text-[#9cdcfe] whitespace-nowrap">{row.model || '—'}</td>
                  <td className="px-3 py-1.5 border-b border-r border-[#1a1a1a] text-[#d4d4d4] whitespace-nowrap">{row.testType}</td>
                  <td className="px-3 py-1.5 border-b border-r border-[#1a1a1a] text-[#ce9178] whitespace-nowrap">{row.column || '—'}</td>
                  <td className="px-3 py-1.5 border-b border-r border-[#1a1a1a] text-[#555] whitespace-nowrap tabular-nums">
                    {row.executionMs > 0 ? `${(row.executionMs / 1000).toFixed(2)}s` : '—'}
                  </td>
                  <td className="px-3 py-1.5 border-b border-[#1a1a1a] text-[#888] max-w-xs truncate" title={row.message}>
                    {row.failures > 0 && <span className="text-red-400 mr-2">{row.failures} failures</span>}
                    {row.message || '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

// Parse "dbt run --select foo" or "run --select foo" into a DbtCommand
function parseUserCommand(raw: string): DbtCommand | null {
  const parts = raw.trim().replace(/^dbt\s+/, '').split(/\s+/).filter(Boolean);
  if (!parts.length) return null;
  const [command, ...rest] = parts;
  const allowed = [
    'run', 'test', 'compile', 'debug', 'deps', 'docs', 'source',
    'seed', 'snapshot', 'build', 'clean', 'list', 'ls', 'parse',
    'run-operation', 'retry',
  ];
  if (!allowed.includes(command)) return null;

  let modelName: string | undefined;
  const args: string[] = [];
  for (let i = 0; i < rest.length; i++) {
    if (rest[i] === '--select' && rest[i + 1]) {
      modelName = rest[i + 1];
      i++;
    } else {
      args.push(rest[i]);
    }
  }
  const label = `dbt ${command}${args.length ? ' ' + args.join(' ') : ''}${modelName ? ' --select ' + modelName : ''}`;
  return { command, args, modelName, label };
}

const lineClass = (t: OutputLine['lineType']) => {
  if (t === 'success') return 'text-green-400';
  if (t === 'error')   return 'text-red-400';
  if (t === 'warning') return 'text-yellow-300';
  return 'text-[#d4d4d4]';
};

// ─── Component ────────────────────────────────────────────────────────────────

const OutputPanel = forwardRef<OutputPanelRef, Props>(function OutputPanel(
  {
    open,
    onToggle,
    onCommandComplete,
    previewResult,
    previewLoading,
    previewError,
    activeOutputTab,
    onOutputTabChange,
    dbtTarget,
  },
  ref
) {
  const [lines, setLines]         = useState<OutputLine[]>([]);
  const [running, setRunning]     = useState(false);
  const [exitCode, setExitCode]   = useState<number | null>(null);
  const [displayCmd, setDisplayCmd] = useState('');
  const [elapsed, setElapsed]     = useState(0);
  const [docsUrl, setDocsUrl]     = useState<string | null>(null);
  const [cmdInput, setCmdInput]   = useState('');
  const [history, setHistory]     = useState<string[]>([]);
  const [historyIdx, setHistoryIdx] = useState(-1);

  const bottomRef     = useRef<HTMLDivElement>(null);
  const inputRef      = useRef<HTMLInputElement>(null);
  const startRef      = useRef(0);
  const timerRef      = useRef<ReturnType<typeof setInterval> | null>(null);
  const abortRef      = useRef<AbortController | null>(null);
  const linesRef      = useRef<OutputLine[]>([]);   // mirror of `lines` state for capture at done-time
  const onCompleteRef = useRef(onCommandComplete);
  useEffect(() => { onCompleteRef.current = onCommandComplete; }, [onCommandComplete]);

  // Auto-scroll on new lines
  useEffect(() => {
    if (open && activeOutputTab === 'output') {
      bottomRef.current?.scrollIntoView({ behavior: 'auto' });
    }
  }, [lines, open, activeOutputTab]);

  const stopTimer = useCallback(() => {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
  }, []);

  const runCommand = useCallback(async (cmd: DbtCommand) => {
    abortRef.current?.abort();
    abortRef.current = new AbortController();

    linesRef.current = [];
    setLines([]);
    setRunning(true);
    setExitCode(null);
    setDisplayCmd(cmd.label);
    setElapsed(0);
    setDocsUrl(null);
    startRef.current = Date.now();
    stopTimer();
    timerRef.current = setInterval(
      () => setElapsed(Math.floor((Date.now() - startRef.current) / 1000)),
      500
    );

    try {
      const res = await fetch('/api/dbt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          command: cmd.command,
          args: cmd.args,
          modelName: cmd.modelName,
          target: cmd.target ?? dbtTarget,
        }),
        signal: abortRef.current.signal,
      });

      if (!res.body) throw new Error('No response body');

      const reader = res.body.getReader();
      const dec    = new TextDecoder();
      let buf      = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        const parts = buf.split('\n\n');
        buf = parts.pop() ?? '';
        for (const part of parts) {
          if (!part.startsWith('data: ')) continue;
          try {
            const evt = JSON.parse(part.slice(6));
            if (evt.type === 'start') {
              setDisplayCmd(evt.command);
            } else if (evt.type === 'line') {
              const text: string = evt.text ?? '';
              const urlMatch = text.match(/https?:\/\/\S+/);
              if (urlMatch && cmd.command === 'docs') setDocsUrl(urlMatch[0]);
              const newLine: OutputLine = { text, lineType: evt.lineType ?? 'info' };
              linesRef.current = [...linesRef.current, newLine];
              setLines(linesRef.current);
            } else if (evt.type === 'done') {
              const code = evt.exitCode ?? 1;
              setExitCode(code);
              setRunning(false);
              stopTimer();
              // Defer so parent setState fires after this render cycle completes
              const capturedLines = [...linesRef.current];
              const capturedDuration = Date.now() - startRef.current;
              setTimeout(() => {
                onCompleteRef.current({
                  exitCode: code,
                  durationMs: capturedDuration,
                  label: cmd.label,
                  target: cmd.target ?? dbtTarget,
                  lines: capturedLines,
                });
              }, 0);
            }
          } catch { /* skip malformed JSON */ }
        }
      }
    } catch (err: unknown) {
      if (err instanceof Error && err.name === 'AbortError') {
        setRunning(false);
        stopTimer();
        return;
      }
      const msg = err instanceof Error ? err.message : 'Unknown error';
      const errLine: OutputLine = { text: `Error: ${msg}`, lineType: 'error' };
      linesRef.current = [...linesRef.current, errLine];
      setLines(linesRef.current);
      setRunning(false);
      stopTimer();
      const capturedLines = [...linesRef.current];
      const capturedDuration = Date.now() - startRef.current;
      setTimeout(() => {
        onCompleteRef.current({
          exitCode: 1,
          durationMs: capturedDuration,
          label: cmd.label,
          target: cmd.target ?? dbtTarget,
          lines: capturedLines,
        });
      }, 0);
    }
  }, [stopTimer, dbtTarget]);

  const runShellLine = useCallback(async (line: string) => {
    const trimmed = line.trim();
    if (!trimmed) return;

    abortRef.current?.abort();
    abortRef.current = new AbortController();

    linesRef.current = [];
    setLines([]);
    setRunning(true);
    setExitCode(null);
    setDisplayCmd(trimmed);
    setElapsed(0);
    setDocsUrl(null);
    startRef.current = Date.now();
    stopTimer();
    timerRef.current = setInterval(
      () => setElapsed(Math.floor((Date.now() - startRef.current) / 1000)),
      500
    );

    try {
      const res = await fetch('/api/shell', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ command: trimmed }),
        signal: abortRef.current.signal,
      });

      if (!res.body) throw new Error('No response body');

      const reader = res.body.getReader();
      const dec    = new TextDecoder();
      let buf      = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        const parts = buf.split('\n\n');
        buf = parts.pop() ?? '';
        for (const part of parts) {
          if (!part.startsWith('data: ')) continue;
          try {
            const evt = JSON.parse(part.slice(6));
            if (evt.type === 'start') {
              setDisplayCmd(evt.command);
            } else if (evt.type === 'line') {
              const text: string = evt.text ?? '';
              const newLine: OutputLine = { text, lineType: evt.lineType ?? 'info' };
              linesRef.current = [...linesRef.current, newLine];
              setLines(linesRef.current);
            } else if (evt.type === 'done') {
              const code = evt.exitCode ?? 1;
              setExitCode(code);
              setRunning(false);
              stopTimer();
              const capturedLines = [...linesRef.current];
              const capturedDuration = Date.now() - startRef.current;
              setTimeout(() => {
                onCompleteRef.current({
                  exitCode: code,
                  durationMs: capturedDuration,
                  label: trimmed,
                  target: dbtTarget,
                  lines: capturedLines,
                });
              }, 0);
            }
          } catch { /* skip */ }
        }
      }
    } catch (err: unknown) {
      if (err instanceof Error && err.name === 'AbortError') {
        setRunning(false);
        stopTimer();
        return;
      }
      const msg = err instanceof Error ? err.message : 'Unknown error';
      const errLine: OutputLine = { text: `Error: ${msg}`, lineType: 'error' };
      linesRef.current = [...linesRef.current, errLine];
      setLines(linesRef.current);
      setRunning(false);
      stopTimer();
      const capturedLines = [...linesRef.current];
      const capturedDuration = Date.now() - startRef.current;
      setTimeout(() => {
        onCompleteRef.current({
          exitCode: 1,
          durationMs: capturedDuration,
          label: trimmed,
          target: dbtTarget,
          lines: capturedLines,
        });
      }, 0);
    }
  }, [stopTimer, dbtTarget]);

  // Expose runCommand to parent via ref so buttons call it directly
  useImperativeHandle(ref, () => ({ runCommand }), [runCommand]);

  useEffect(() => () => stopTimer(), [stopTimer]);

  const handleStop = () => {
    abortRef.current?.abort();
    setRunning(false);
    stopTimer();
    setLines((prev) => [...prev, { text: '— Stopped by user —', lineType: 'warning' }]);
  };

  const submitCommand = (raw: string) => {
    const trimmed = raw.trim();
    if (!trimmed) return;

    const dbtCmd = parseUserCommand(trimmed);
    setHistory((h) => [trimmed, ...h.slice(0, 49)]);
    setHistoryIdx(-1);
    setCmdInput('');
    onOutputTabChange('output');
    if (!open) onToggle();

    if (dbtCmd) {
      runCommand({ ...dbtCmd, target: dbtCmd.target ?? dbtTarget });
    } else {
      void runShellLine(trimmed);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      submitCommand(cmdInput);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      const next = Math.min(historyIdx + 1, history.length - 1);
      setHistoryIdx(next);
      setCmdInput(history[next] ?? '');
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      const next = Math.max(historyIdx - 1, -1);
      setHistoryIdx(next);
      setCmdInput(next === -1 ? '' : history[next]);
    }
  };

  return (
    <div className="flex flex-col bg-[#0d0d0d] border-t border-[#3e3e42] h-full">

      {/* ── Header bar ── */}
      <div
        className="flex items-center gap-0 px-2 h-9 border-b border-[#2a2a2a] shrink-0 select-none bg-[#1a1a1a] cursor-pointer"
        onClick={() => { if (!open) onToggle(); }}
      >
        {/* Tabs */}
        {([
          { id: 'output',    icon: <Terminal size={11} />,      label: 'Output' },
          { id: 'preview',   icon: <Table2 size={11} />,        label: 'Preview' },
          { id: 'tests',     icon: <FlaskConical size={11} />,  label: 'Tests' },
          { id: 'freshness', icon: <RefreshCw size={11} />,     label: 'Freshness' },
        ] as const).map(({ id, icon, label }) => (
          <button
            key={id}
            onClick={(e) => { e.stopPropagation(); onOutputTabChange(id); if (!open) onToggle(); }}
            className={`flex items-center gap-1.5 h-full px-3 text-[10px] font-semibold uppercase tracking-widest border-b-2 transition-colors ${
              activeOutputTab === id
                ? 'border-[#007acc] text-[#d4d4d4]'
                : 'border-transparent text-[#555] hover:text-[#888]'
            }`}
          >
            {icon}
            {label}
            {id === 'preview' && previewLoading && <Loader2 size={10} className="animate-spin ml-0.5" />}
          </button>
        ))}

        <div className="w-px h-4 bg-[#2a2a2a] mx-2" />

        {activeOutputTab === 'output' && displayCmd && (
          <span className="text-[10px] text-[#555] font-mono truncate max-w-[260px]">
            {displayCmd}
          </span>
        )}
        {activeOutputTab === 'preview' && previewResult && !previewLoading && (
          <span className="text-[10px] text-[#555] font-mono">
            {previewResult.rows.length} rows × {previewResult.columns.length} cols
          </span>
        )}

        <div className="flex items-center gap-2 ml-auto shrink-0">
          {activeOutputTab === 'output' && running && (
            <>
              <span className="flex items-center gap-1 text-[10px] text-[#888]">
                <Loader2 size={11} className="animate-spin" />{elapsed}s
              </span>
              <button onClick={(e) => { e.stopPropagation(); handleStop(); }} title="Stop"
                className="text-red-500 hover:text-red-400 transition-colors">
                <StopCircle size={13} />
              </button>
            </>
          )}
          {activeOutputTab === 'output' && !running && exitCode !== null && (
            exitCode === 0
              ? <span className="flex items-center gap-1 text-[10px] text-green-400"><CheckCircle size={12} /> passed</span>
              : <span className="flex items-center gap-1 text-[10px] text-red-400"><XCircle size={12} /> exit {exitCode}</span>
          )}
          {docsUrl && (
            <a href={docsUrl} target="_blank" rel="noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="flex items-center gap-1 text-[10px] text-[#4ec9b0] hover:underline">
              <ExternalLink size={11} /> Open Docs
            </a>
          )}
          {activeOutputTab === 'output' && lines.length > 0 && !running && (
            <button title="Clear"
              onClick={(e) => { e.stopPropagation(); setLines([]); setExitCode(null); setDisplayCmd(''); setDocsUrl(null); }}
              className="text-[#444] hover:text-[#888] transition-colors">
              <Trash2 size={11} />
            </button>
          )}
          <button onClick={(e) => { e.stopPropagation(); onToggle(); }}
            title={open ? 'Collapse' : 'Expand'}
            className="text-[#444] hover:text-[#888] transition-colors ml-1">
            {open ? <ChevronDown size={13} /> : <ChevronUp size={13} />}
          </button>
        </div>
      </div>

      {/* ── Body ── */}
      {open && (
        <div className="flex flex-col flex-1 min-h-0">

          {/* Output tab */}
          {activeOutputTab === 'output' && (
            <div className="flex flex-col flex-1 min-h-0">
              {/* Terminal input — top so it stays visible above long logs */}
              <div
                className="shrink-0 border-b border-[#2a2a2a] bg-[#111] px-3 py-2"
                onClick={() => inputRef.current?.focus()}
              >
                <div className="flex items-center gap-2 font-mono text-xs">
                  <span className="text-[#569cd6] shrink-0 select-none">$</span>
                  <input
                    ref={inputRef}
                    value={cmdInput}
                    onChange={(e) => setCmdInput(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="dbt run --select my_model  ·  git status  ·  ls -la"
                    className="flex-1 bg-transparent text-[#d4d4d4] outline-none placeholder-[#444] caret-[#d4d4d4]"
                    spellCheck={false}
                    disabled={running}
                    autoComplete="off"
                  />
                  {running ? (
                    <Loader2 size={11} className="animate-spin text-[#555] shrink-0" />
                  ) : (
                    cmdInput.trim() && (
                      <button
                        type="button"
                        onClick={() => submitCommand(cmdInput)}
                        className="text-[#569cd6] hover:text-[#79b8ff] text-[10px] shrink-0 transition-colors"
                      >
                        ↵
                      </button>
                    )
                  )}
                </div>
                <p className="text-[10px] text-[#4a4a4a] mt-1 select-none">
                  Recognized dbt lines go to dbt; everything else runs in a shell (cwd = project root). ↑ ↓ history · Enter
                </p>
              </div>

              {/* Scrollable output */}
              <div
                className="flex-1 overflow-y-auto px-4 py-2 font-mono text-xs leading-[1.6] min-h-0 select-text cursor-text"
                onClick={() => inputRef.current?.focus()}
              >
                {lines.length === 0 && !running && (
                  <p className="text-[#3a3a3a] italic mt-2">
                    No output yet. Use the toolbar or type a command above (dbt, git, shell).
                  </p>
                )}
                {lines.map((line, i) => (
                  <div key={i} className={`${lineClass(line.lineType)} whitespace-pre-wrap break-all`}>
                    {line.text}
                  </div>
                ))}
                <div ref={bottomRef} />
              </div>
            </div>
          )}

          {/* Tests tab */}
          {activeOutputTab === 'tests' && <TestResultsTab />}

          {/* Freshness tab */}
          {activeOutputTab === 'freshness' && <FreshnessTab />}

          {/* Preview tab */}
          {activeOutputTab === 'preview' && (
            <div className="flex-1 overflow-auto min-h-0 select-text">
              {previewLoading && (
                <div className="flex items-center justify-center h-full gap-2 text-[#666] text-xs">
                  <Loader2 size={16} className="animate-spin" />Running query on Athena…
                </div>
              )}
              {!previewLoading && previewError && (
                <div className="p-4 text-red-400 text-xs font-mono whitespace-pre-wrap">
                  <XCircle size={14} className="inline mr-1.5 mb-0.5" />{previewError}
                </div>
              )}
              {!previewLoading && !previewError && previewResult && previewResult.columns.length === 0 && (
                <div className="flex items-center justify-center h-full text-[#555] text-xs italic">
                  Query returned no rows.
                </div>
              )}
              {!previewLoading && !previewError && previewResult && previewResult.columns.length > 0 && (
                <table className="w-full text-xs border-collapse font-mono">
                  <thead className="sticky top-0 z-10">
                    <tr>
                      {previewResult.columns.map((col) => (
                        <th key={col}
                          className="px-3 py-1.5 text-left text-[#9cdcfe] font-semibold bg-[#1a1a1a] border-b border-r border-[#2a2a2a] whitespace-nowrap">
                          {col}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {previewResult.rows.map((row, ri) => (
                      <tr key={ri} className={ri % 2 === 0 ? 'bg-[#0d0d0d]' : 'bg-[#131313]'}>
                        {previewResult.columns.map((col) => (
                          <td key={col}
                            className="px-3 py-1 text-[#d4d4d4] border-r border-[#2a2a2a] max-w-[240px] truncate"
                            title={row[col]}>
                            {row[col] === '' || row[col] == null
                              ? <span className="text-[#3a3a3a] italic">null</span>
                              : row[col]}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
              {!previewLoading && !previewError && !previewResult && (
                <div className="flex items-center justify-center h-full text-[#3a3a3a] text-xs italic">
                  Open a .sql model and click "Preview Data" to query Athena.
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
});

export default OutputPanel;

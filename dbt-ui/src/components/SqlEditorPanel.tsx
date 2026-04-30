'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Editor, { type Monaco } from '@monaco-editor/react';
import {
  X,
  Play,
  Square,
  Loader2,
  AlertCircle,
  Download,
  Database,
  Table2,
  ChevronDown,
  ChevronRight,
  Search,
  Info,
  History,
  Sparkles,
  Clock,
  Trash2,
} from 'lucide-react';

// ─── Types ───────────────────────────────────────────────────────────────────

interface QueryResponse {
  columns: string[];
  rows: Record<string, string>[];
  rowCount: number;
  executionMs: number;
  queryExecutionId?: string;
  state?: string;
  dataScanned?: string;
  dataScannedInBytes?: number;
  submissionDateTime?: string;
  completionDateTime?: string;
  appliedLimit?: number;
  error?: string;
}

interface CatalogInfo {
  database: string;
  region: string;
  tables: string[];
}

type QueryState = 'idle' | 'running' | 'succeeded' | 'failed' | 'cancelled';
type ResultTab  = 'results' | 'info' | 'history';
type RowLimit   = 100 | 500 | 1000 | 5000 | -1; // -1 = no auto-limit

const ROW_LIMIT_OPTIONS: { label: string; value: RowLimit }[] = [
  { label: '100 rows',  value: 100 },
  { label: '500 rows',  value: 500 },
  { label: '1 000 rows', value: 1000 },
  { label: '5 000 rows', value: 5000 },
  { label: 'No limit',  value: -1 },
];

// ─── Query history (localStorage) ────────────────────────────────────────────

const HISTORY_KEY = 'dbt-ui:sql-history';
const HISTORY_MAX = 50;

interface HistoryEntry {
  id: string;
  sql: string;
  executedAt: string;
  executionMs: number;
  rowCount: number;
  status: 'succeeded' | 'failed';
}

function loadHistory(): HistoryEntry[] {
  try {
    return JSON.parse(localStorage.getItem(HISTORY_KEY) ?? '[]') as HistoryEntry[];
  } catch { return []; }
}

function saveHistory(entries: HistoryEntry[]): void {
  try { localStorage.setItem(HISTORY_KEY, JSON.stringify(entries.slice(0, HISTORY_MAX))); } catch { /* quota */ }
}

function pushHistory(entry: Omit<HistoryEntry, 'id'>): HistoryEntry[] {
  const prev = loadHistory();
  const next = [{ ...entry, id: crypto.randomUUID() }, ...prev].slice(0, HISTORY_MAX);
  saveHistory(next);
  return next;
}

function fmtAgo(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const s = Math.floor(diffMs / 1000);
  if (s < 60)  return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function toCsv(columns: string[], rows: Record<string, string>[]): string {
  const esc = (v: string) => {
    const value = String(v ?? '');
    if (value.includes('"') || value.includes(',') || value.includes('\n')) {
      return `"${value.replace(/"/g, '""')}"`;
    }
    return value;
  };
  return [columns.map(esc).join(','), ...rows.map((r) => columns.map((c) => esc(r[c] ?? '')).join(','))].join('\n');
}

function fmtTime(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
}

function fmtDateTime(iso?: string): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleTimeString();
}

// ─── State badge ─────────────────────────────────────────────────────────────

function StateBadge({ state }: { state: QueryState }) {
  const cfg: Record<QueryState, { label: string; dot: string; text: string }> = {
    idle:      { label: 'IDLE',      dot: 'bg-[#6e6e6e]', text: 'text-[#8b8b8b]' },
    running:   { label: 'RUNNING',   dot: 'bg-[#4ec9b0] animate-pulse', text: 'text-[#4ec9b0]' },
    succeeded: { label: 'SUCCEEDED', dot: 'bg-[#4caf50]', text: 'text-[#4caf50]' },
    failed:    { label: 'FAILED',    dot: 'bg-[#f48771]', text: 'text-[#f48771]' },
    cancelled: { label: 'CANCELLED', dot: 'bg-[#d7ba7d]', text: 'text-[#d7ba7d]' },
  };
  const { label, dot, text } = cfg[state];
  return (
    <span className={`flex items-center gap-1.5 text-[11px] font-mono font-semibold ${text}`}>
      <span className={`w-2 h-2 rounded-full shrink-0 ${dot}`} />
      {label}
    </span>
  );
}

// ─── Table browser (left sidebar) ────────────────────────────────────────────

function TableBrowser({
  catalog,
  loading,
  onInsert,
}: {
  catalog: CatalogInfo | null;
  loading: boolean;
  onInsert: (name: string) => void;
}) {
  const [expanded, setExpanded] = useState(true);
  const [filter, setFilter] = useState('');

  const filtered = useMemo(() => {
    if (!catalog) return [];
    const q = filter.toLowerCase();
    return q ? catalog.tables.filter((t) => t.toLowerCase().includes(q)) : catalog.tables;
  }, [catalog, filter]);

  return (
    <div className="flex flex-col h-full bg-[#1e1e1e] border-r border-[#2e2e2e] w-52 shrink-0">
      {/* header */}
      <div className="flex items-center gap-1.5 px-3 py-2 border-b border-[#2e2e2e]">
        <Database size={12} className="text-[#4ec9b0] shrink-0" />
        <span className="text-[11px] text-[#9cdcfe] font-semibold truncate">
          {catalog?.database ?? 'Loading…'}
        </span>
        {catalog?.region && (
          <span className="ml-auto text-[10px] text-[#5a5a5a] shrink-0">{catalog.region}</span>
        )}
      </div>

      {/* search */}
      <div className="px-2 py-1.5 border-b border-[#2e2e2e]">
        <div className="flex items-center gap-1 bg-[#2d2d2d] rounded px-2 py-1">
          <Search size={10} className="text-[#6e6e6e] shrink-0" />
          <input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Filter tables…"
            className="bg-transparent text-[11px] text-[#d4d4d4] placeholder-[#5a5a5a] outline-none flex-1 min-w-0"
          />
        </div>
      </div>

      {/* section */}
      <button
        onClick={() => setExpanded((v) => !v)}
        className="flex items-center gap-1.5 px-2 py-1.5 text-[11px] text-[#8b8b8b] hover:bg-[#2a2a2a] transition-colors w-full text-left"
      >
        {expanded ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
        <Table2 size={11} />
        Tables ({loading ? '…' : filtered.length})
      </button>

      {/* table list */}
      <div className="flex-1 overflow-y-auto">
        {loading && (
          <div className="flex items-center gap-2 px-3 py-2 text-[11px] text-[#6e6e6e]">
            <Loader2 size={10} className="animate-spin" /> Loading…
          </div>
        )}
        {expanded && !loading &&
          filtered.map((tbl) => (
            <button
              key={tbl}
              onDoubleClick={() => onInsert(tbl)}
              title={`Double-click to insert "${tbl}" into editor`}
              className="w-full text-left px-3 py-1 text-[11px] text-[#d4d4d4] hover:bg-[#2a2d2e] truncate transition-colors"
            >
              {tbl}
            </button>
          ))}
        {expanded && !loading && filtered.length === 0 && !loading && (
          <p className="px-3 py-2 text-[10px] text-[#5a5a5a]">No tables found</p>
        )}
      </div>
    </div>
  );
}

// ─── Results table ────────────────────────────────────────────────────────────

const PAGE_SIZE = 50;

function ResultsTable({ columns, rows }: { columns: string[]; rows: Record<string, string>[] }) {
  const [page, setPage] = useState(0);
  const totalPages = Math.ceil(rows.length / PAGE_SIZE);
  const pageRows = rows.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-auto">
        <table className="min-w-full text-xs border-collapse">
          <thead className="sticky top-0 z-10 bg-[#252526]">
            <tr>
              {/* row number column */}
              <th className="px-2 py-1.5 text-right text-[#5a5a5a] border-b border-r border-[#3e3e42] w-10 select-none font-normal">
                #
              </th>
              {columns.map((col) => (
                <th
                  key={col}
                  className="px-3 py-1.5 text-left text-[#9cdcfe] font-semibold border-b border-r border-[#3e3e42] whitespace-nowrap last:border-r-0"
                >
                  {col}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {pageRows.map((row, i) => {
              const globalIdx = page * PAGE_SIZE + i + 1;
              return (
                <tr key={i} className="odd:bg-[#1e1e1e] even:bg-[#222222] hover:bg-[#2a2d2e] group">
                  <td className="px-2 py-1 text-right text-[#5a5a5a] border-r border-[#2e2e2e] select-none tabular-nums text-[10px]">
                    {globalIdx}
                  </td>
                  {columns.map((col) => (
                    <td
                      key={`${i}-${col}`}
                      className="px-3 py-1 border-r border-[#2e2e2e] text-[#d4d4d4] whitespace-nowrap last:border-r-0 max-w-xs truncate"
                      title={row[col] ?? ''}
                    >
                      {row[col] === '' || row[col] == null ? (
                        <span className="text-[#5a5a5a] italic">null</span>
                      ) : (
                        row[col]
                      )}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* pagination */}
      {totalPages > 1 && (
        <div className="flex items-center gap-2 px-3 py-1.5 border-t border-[#2e2e2e] bg-[#1e1e1e] text-[11px] text-[#8b8b8b] shrink-0">
          <button
            disabled={page === 0}
            onClick={() => setPage((p) => p - 1)}
            className="px-2 py-0.5 rounded border border-[#3e3e42] hover:bg-[#2e2e2e] disabled:opacity-40 transition-colors"
          >
            ‹ Prev
          </button>
          <span>
            Page {page + 1} of {totalPages}
          </span>
          <button
            disabled={page >= totalPages - 1}
            onClick={() => setPage((p) => p + 1)}
            className="px-2 py-0.5 rounded border border-[#3e3e42] hover:bg-[#2e2e2e] disabled:opacity-40 transition-colors"
          >
            Next ›
          </button>
          <span className="ml-auto">{rows.length} total rows</span>
        </div>
      )}
    </div>
  );
}

// ─── Query Info tab ───────────────────────────────────────────────────────────

function QueryInfoPanel({ result, state }: { result: QueryResponse | null; state: QueryState }) {
  const rows: { label: string; value: string }[] = [
    { label: 'State',             value: state.toUpperCase() },
    { label: 'Execution ID',      value: result?.queryExecutionId ?? '—' },
    { label: 'Submission time',   value: fmtDateTime(result?.submissionDateTime) },
    { label: 'Completion time',   value: fmtDateTime(result?.completionDateTime) },
    { label: 'Execution time',    value: result ? fmtTime(result.executionMs) : '—' },
    { label: 'Data scanned',      value: result?.dataScanned ?? '—' },
    { label: 'Rows returned',     value: result ? String(result.rowCount) : '—' },
  ];

  return (
    <div className="p-4 overflow-auto">
      <div className="max-w-xl border border-[#3e3e42] rounded overflow-hidden">
        {rows.map(({ label, value }, i) => (
          <div
            key={label}
            className={`flex items-start gap-4 px-4 py-2 text-xs ${
              i % 2 === 0 ? 'bg-[#1e1e1e]' : 'bg-[#222222]'
            }`}
          >
            <span className="text-[#8b8b8b] w-36 shrink-0">{label}</span>
            <span className="text-[#d4d4d4] font-mono break-all">{value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

interface Props {
  onClose: () => void;
}

export default function SqlEditorPanel({ onClose }: Props) {
  const [sql, setSql]                   = useState('SELECT * FROM f_score LIMIT 100');
  const [queryState, setQueryState]     = useState<QueryState>('idle');
  const [result, setResult]             = useState<QueryResponse | null>(null);
  const [errorMsg, setErrorMsg]         = useState<string | null>(null);
  const [activeTab, setActiveTab]       = useState<ResultTab>('results');
  const [catalog, setCatalog]           = useState<CatalogInfo | null>(null);
  const [catalogLoading, setCatalogLoading] = useState(true);
  const [rowLimit, setRowLimit]         = useState<RowLimit>(100);

  // Always-current refs — fixes stale closure in editor.addCommand
  const sqlRef      = useRef(sql);
  const rowLimitRef = useRef(rowLimit);
  sqlRef.current      = sql;
  rowLimitRef.current = rowLimit;

  // Query history
  const [history, setHistory]           = useState<HistoryEntry[]>([]);
  useEffect(() => { setHistory(loadHistory()); }, []);

  // AI Explainer
  const [explaining, setExplaining]     = useState(false);
  const [explanation, setExplanation]   = useState<string | null>(null);
  const [explainError, setExplainError] = useState<string | null>(null);
  const [showExplain, setShowExplain]   = useState(false);

  const abortRef = useRef<AbortController | null>(null);
  const editorRef = useRef<Parameters<NonNullable<React.ComponentProps<typeof Editor>['onMount']>>[0] | null>(null);

  // load catalog on mount
  useEffect(() => {
    fetch('/api/query')
      .then((r) => r.json())
      .then((d: CatalogInfo) => setCatalog(d))
      .catch(() => setCatalog({ database: 'dbt', region: 'us-west-2', tables: [] }))
      .finally(() => setCatalogLoading(false));
  }, []);

  const run = useCallback(async () => {
    if (queryState === 'running') return;

    // Always read from refs so this never captures stale closure values
    const currentSql   = sqlRef.current.trim();
    const currentLimit = rowLimitRef.current;

    if (!currentSql) return;
    setQueryState('running');
    setErrorMsg(null);
    setResult(null);
    setActiveTab('results');

    const ctrl = new AbortController();
    abortRef.current = ctrl;

    try {
      const res = await fetch('/api/query', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // Pass limit: -1 means "don't auto-append LIMIT" (user controls it)
        body: JSON.stringify({ sql: currentSql, limit: currentLimit === -1 ? undefined : currentLimit }),
        signal: ctrl.signal,
      });
      const data = (await res.json()) as QueryResponse;
      if (!res.ok) {
        setErrorMsg(data.error ?? 'Query execution failed');
        setQueryState('failed');
        if (data.queryExecutionId) setResult(data);
        setHistory(pushHistory({ sql: currentSql, executedAt: new Date().toISOString(), executionMs: data.executionMs ?? 0, rowCount: 0, status: 'failed' }));
      } else {
        setResult(data);
        setQueryState('succeeded');
        setHistory(pushHistory({ sql: currentSql, executedAt: new Date().toISOString(), executionMs: data.executionMs, rowCount: data.rowCount, status: 'succeeded' }));
      }
    } catch (err) {
      if ((err as Error).name === 'AbortError') {
        setQueryState('cancelled');
      } else {
        setErrorMsg(err instanceof Error ? err.message : 'Network error');
        setQueryState('failed');
      }
    } finally {
      abortRef.current = null;
    }
  // queryState is the only real dep — sql/limit are read via refs
  }, [queryState]); // eslint-disable-line react-hooks/exhaustive-deps

  const stop = () => {
    abortRef.current?.abort();
  };

  const downloadCsv = () => {
    if (!result?.rows?.length) return;
    const csv = toCsv(result.columns, result.rows);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `query-${result.queryExecutionId ?? Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const explainSql = async () => {
    const currentSql = sqlRef.current.trim();
    if (!currentSql || explaining) return;
    setExplaining(true);
    setExplainError(null);
    setExplanation(null);
    setShowExplain(true);
    try {
      const res = await fetch('/api/explain', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sql: currentSql }),
      });
      const data = await res.json() as { explanation?: string; error?: string };
      if (!res.ok) setExplainError(data.error ?? 'Failed to explain');
      else setExplanation(data.explanation ?? '');
    } catch (e) {
      setExplainError(e instanceof Error ? e.message : 'Network error');
    } finally {
      setExplaining(false);
    }
  };

  // Ctrl+Enter to run
  const handleEditorMount = (editor: Parameters<NonNullable<React.ComponentProps<typeof Editor>['onMount']>>[0], monaco: Monaco) => {
    editorRef.current = editor;
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, () => {
      run();
    });
  };

  // Insert table name at cursor
  const insertTableName = (name: string) => {
    const editor = editorRef.current;
    if (!editor) return;
    const pos = editor.getPosition();
    if (!pos) return;
    editor.executeEdits('', [{ range: { startLineNumber: pos.lineNumber, startColumn: pos.column, endLineNumber: pos.lineNumber, endColumn: pos.column }, text: name }]);
    editor.focus();
  };

  // Status bar values
  const statusBar = useMemo(() => {
    if (queryState === 'running') return null;
    if (!result && !errorMsg) return null;
    return {
      time:    result ? fmtTime(result.executionMs) : '—',
      scanned: result?.dataScanned ?? '—',
      rows:    result ? `${result.rowCount} rows` : '—',
    };
  }, [queryState, result, errorMsg]);

  const resultTabLabel =
    result && result.rowCount > 0 ? `Results (${result.rowCount})` : 'Results';

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-[#181818] font-mono">

      {/* ── Title bar ─────────────────────────────────────────────── */}
      <div className="flex items-center gap-3 px-4 h-10 bg-[#252526] border-b border-[#1e1e1e] shrink-0 select-none">
        <Database size={13} className="text-[#4ec9b0] shrink-0" />
        <span className="text-sm font-semibold text-[#d4d4d4] tracking-wide">Query editor</span>
        {catalog && (
          <>
            <span className="text-[#3e3e42]">|</span>
            <span className="text-[11px] text-[#9cdcfe]">{catalog.database}</span>
            <span className="text-[#3e3e42]">|</span>
            <span className="text-[11px] text-[#6e6e6e]">{catalog.region}</span>
          </>
        )}
        <button
          onClick={onClose}
          className="ml-auto p-1.5 rounded text-[#8b8b8b] hover:text-[#d4d4d4] hover:bg-[#3e3e42] transition-colors"
          title="Close (Esc)"
        >
          <X size={13} />
        </button>
      </div>

      {/* ── Toolbar ───────────────────────────────────────────────── */}
      <div className="flex items-center gap-2 px-3 py-1.5 border-b border-[#1e1e1e] bg-[#2d2d2d] shrink-0">
        {queryState === 'running' ? (
          <button
            onClick={stop}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded bg-[#c72e2e] hover:bg-[#d9534f] text-white transition-colors"
          >
            <Square size={11} fill="currentColor" />
            Stop
          </button>
        ) : (
          <button
            onClick={run}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded bg-[#0e639c] hover:bg-[#1177bb] text-white transition-colors"
          >
            <Play size={11} fill="currentColor" />
            Run
          </button>
        )}

        <span className="text-[10px] text-[#5a5a5a] select-none ml-1">Ctrl+Enter to run</span>

        <span className="text-[#3e3e42] text-xs select-none">|</span>

        {/* Row limit selector */}
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] text-[#5a5a5a] select-none">Limit:</span>
          <select
            value={rowLimit}
            onChange={(e) => setRowLimit(Number(e.target.value) as RowLimit)}
            className="bg-[#1e1e1e] border border-[#4a4a4a] text-[11px] text-[#d4d4d4] rounded px-1.5 py-0.5 outline-none focus:border-[#007acc] cursor-pointer"
            title="Auto-append LIMIT when SQL has no LIMIT clause"
          >
            {ROW_LIMIT_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>

        <span className="text-[#3e3e42] text-xs select-none">|</span>

        {/* AI Explain */}
        <button
          onClick={explainSql}
          disabled={explaining || !sql.trim()}
          className="flex items-center gap-1.5 px-2.5 py-1 text-[11px] rounded border border-[#7c3aed]/50 text-[#a78bfa] hover:bg-[#7c3aed]/10 disabled:opacity-40 transition-colors"
          title="Explain this SQL in plain English using AI"
        >
          {explaining ? <Loader2 size={11} className="animate-spin" /> : <Sparkles size={11} />}
          Explain
        </button>

        {result && result.rowCount > 0 && (
          <button
            onClick={downloadCsv}
            className="ml-auto flex items-center gap-1.5 px-2.5 py-1 text-[11px] rounded border border-[#4a4a4a] text-[#d4d4d4] hover:bg-[#3e3e42] transition-colors"
          >
            <Download size={11} />
            Download CSV
          </button>
        )}
      </div>

      {/* ── Body: sidebar + editor ────────────────────────────────── */}
      <div className="flex flex-1 min-h-0">

        {/* left sidebar */}
        <TableBrowser
          catalog={catalog}
          loading={catalogLoading}
          onInsert={insertTableName}
        />

        {/* editor pane */}
        <div className="flex flex-col flex-1 min-w-0">

          {/* monaco */}
          <div className="h-[42%] border-b border-[#1e1e1e] shrink-0">
            <Editor
              height="100%"
              defaultLanguage="sql"
              theme="vs-dark"
              value={sql}
              onChange={(v) => setSql(v ?? '')}
              onMount={handleEditorMount}
              options={{
                minimap: { enabled: false },
                fontSize: 13,
                lineHeight: 20,
                wordWrap: 'on',
                automaticLayout: true,
                scrollBeyondLastLine: false,
                renderLineHighlight: 'line',
                tabSize: 2,
                fontFamily: "'JetBrains Mono', 'Fira Code', 'Cascadia Code', Menlo, monospace",
                suggest: { showKeywords: true },
              }}
            />
          </div>

          {/* ── Status bar ──────────────────────────────────────── */}
          <div className="flex items-center gap-4 px-4 h-8 bg-[#007acc]/10 border-b border-[#1e1e1e] shrink-0">
            <StateBadge state={queryState} />
            {queryState === 'running' && (
              <Loader2 size={11} className="text-[#4ec9b0] animate-spin" />
            )}
            {statusBar && (
              <>
                <span className="text-[#3e3e42] text-xs select-none">|</span>
                <span className="text-[11px] text-[#8b8b8b]">
                  {statusBar.time}
                </span>
                <span className="text-[#3e3e42] text-xs select-none">|</span>
                <span className="text-[11px] text-[#8b8b8b]">
                  {statusBar.scanned} scanned
                </span>
                <span className="text-[#3e3e42] text-xs select-none">|</span>
                <span className="text-[11px] text-[#8b8b8b]">
                  {statusBar.rows}
                </span>
              </>
            )}
          </div>

          {/* ── Result tabs ─────────────────────────────────────── */}
          <div className="flex items-center gap-0 px-3 border-b border-[#1e1e1e] bg-[#252526] shrink-0">
            {([
              { id: 'results', icon: <Table2   size={11} />, label: resultTabLabel },
              { id: 'info',    icon: <Info     size={11} />, label: 'Query info' },
              { id: 'history', icon: <History  size={11} />, label: `History${history.length ? ` (${history.length})` : ''}` },
            ] as { id: ResultTab; icon: React.ReactNode; label: string }[]).map(({ id, icon, label }) => (
              <button
                key={id}
                onClick={() => setActiveTab(id)}
                className={`flex items-center gap-1.5 px-3 py-1.5 text-[11px] border-b-2 transition-colors ${
                  activeTab === id
                    ? 'border-[#007acc] text-[#d4d4d4]'
                    : 'border-transparent text-[#8b8b8b] hover:text-[#d4d4d4]'
                }`}
              >
                {icon}
                {label}
              </button>
            ))}
          </div>

          {/* ── Result content ──────────────────────────────────── */}
          <div className="flex-1 min-h-0 overflow-auto bg-[#1e1e1e]">

            {/* error */}
            {errorMsg && activeTab === 'results' && (
              <div className="m-4 p-3 rounded border border-[#f48771]/40 bg-[#f48771]/10 text-[#f48771] text-xs flex items-start gap-2">
                <AlertCircle size={13} className="mt-0.5 shrink-0" />
                <pre className="whitespace-pre-wrap font-mono">{errorMsg}</pre>
              </div>
            )}

            {/* empty result */}
            {!errorMsg && result && result.columns.length === 0 && activeTab === 'results' && (
              <div className="m-4 text-xs text-[#8b8b8b]">Query executed successfully. No rows returned.</div>
            )}

            {/* idle placeholder */}
            {queryState === 'idle' && !result && !errorMsg && (
              <div className="flex flex-col items-center justify-center h-full gap-2 text-[#5a5a5a] select-none">
                <Play size={32} className="text-[#3e3e42]" />
                <p className="text-xs">Run a query to see results</p>
                <p className="text-[10px]">Press Ctrl+Enter or click Run</p>
              </div>
            )}

            {/* running placeholder */}
            {queryState === 'running' && !result && (
              <div className="flex flex-col items-center justify-center h-full gap-3 text-[#5a5a5a] select-none">
                <Loader2 size={28} className="text-[#4ec9b0] animate-spin" />
                <p className="text-xs text-[#8b8b8b]">Executing query on Athena…</p>
              </div>
            )}

            {/* results table */}
            {!errorMsg && result && result.columns.length > 0 && activeTab === 'results' && (
              <ResultsTable columns={result.columns} rows={result.rows} />
            )}

            {/* query info */}
            {activeTab === 'info' && (
              <QueryInfoPanel result={result} state={queryState} />
            )}

            {/* history */}
            {activeTab === 'history' && (
              <div className="h-full overflow-auto">
                {history.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-full gap-2 text-[#555] select-none">
                    <Clock size={24} className="text-[#333]" />
                    <p className="text-xs">No query history yet</p>
                  </div>
                ) : (
                  <div>
                    <div className="flex items-center justify-between px-4 py-2 border-b border-[#2e2e2e]">
                      <span className="text-[11px] text-[#555]">{history.length} queries</span>
                      <button
                        onClick={() => { saveHistory([]); setHistory([]); }}
                        className="flex items-center gap-1 text-[11px] text-[#555] hover:text-[#888] transition-colors"
                      >
                        <Trash2 size={10} /> Clear
                      </button>
                    </div>
                    {history.map((entry) => (
                      <button
                        key={entry.id}
                        onClick={() => { setSql(entry.sql); setActiveTab('results'); }}
                        className="w-full text-left px-4 py-3 border-b border-[#1e1e1e] hover:bg-[#2a2d2e] transition-colors group"
                      >
                        <div className="flex items-center gap-2 mb-1">
                          <span className={`text-[10px] font-semibold ${entry.status === 'succeeded' ? 'text-green-400' : 'text-red-400'}`}>
                            {entry.status === 'succeeded' ? '✓' : '✗'}
                          </span>
                          <span className="text-[10px] text-[#555]">{fmtAgo(entry.executedAt)}</span>
                          <span className="text-[10px] text-[#555]">·</span>
                          <span className="text-[10px] text-[#555]">{fmtTime(entry.executionMs)}</span>
                          {entry.rowCount > 0 && (
                            <>
                              <span className="text-[10px] text-[#555]">·</span>
                              <span className="text-[10px] text-[#555]">{entry.rowCount} rows</span>
                            </>
                          )}
                          <span className="ml-auto text-[10px] text-[#555] opacity-0 group-hover:opacity-100 transition-opacity">↺ restore</span>
                        </div>
                        <pre className="text-[11px] text-[#d4d4d4] font-mono whitespace-pre-wrap line-clamp-2 leading-relaxed">{entry.sql}</pre>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── AI Explain drawer ─────────────────────────────── */}
      {showExplain && (
        <div className="fixed bottom-0 right-0 w-[420px] max-h-[55vh] z-[70] flex flex-col bg-[#1e1e1e] border border-[#7c3aed]/40 rounded-tl-xl shadow-2xl overflow-hidden">
          <div className="flex items-center gap-2 px-4 py-2.5 border-b border-[#7c3aed]/30 bg-[#252526] shrink-0">
            <Sparkles size={13} className="text-[#a78bfa]" />
            <span className="text-sm font-semibold text-[#d4d4d4]">SQL Explanation</span>
            {explaining && <Loader2 size={11} className="animate-spin text-[#a78bfa] ml-1" />}
            <button onClick={() => setShowExplain(false)} className="ml-auto text-[#555] hover:text-[#888] transition-colors">
              <X size={13} />
            </button>
          </div>
          <div className="flex-1 overflow-auto p-4 text-sm text-[#c8c8c8] leading-relaxed">
            {explaining && (
              <div className="flex items-center gap-2 text-[#8b8b8b] text-xs">
                <Loader2 size={12} className="animate-spin" /> Analysing your SQL…
              </div>
            )}
            {explainError && (
              <div className="flex items-start gap-2 text-[#f48771] text-xs">
                <AlertCircle size={12} className="mt-0.5 shrink-0" /> {explainError}
              </div>
            )}
            {explanation && (
              <div className="text-[13px] leading-relaxed">
                {explanation.split('\n').map((line, i) => {
                  if (!line.trim()) return <div key={i} className="h-2" />;
                  const boldLine = line.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
                  return <p key={i} className="mb-1" dangerouslySetInnerHTML={{ __html: boldLine }} />;
                })}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

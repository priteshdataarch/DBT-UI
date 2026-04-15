'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
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
  Send,
  StopCircle,
} from 'lucide-react';

export interface DbtCommand {
  command: string;
  args?: string[];
  modelName?: string;
  label: string;
}

export interface PreviewResult {
  columns: string[];
  rows: Record<string, string>[];
}

interface OutputLine {
  text: string;
  lineType: 'info' | 'success' | 'error' | 'warning';
}

interface Props {
  open: boolean;
  onToggle: () => void;
  pendingCommand: (DbtCommand & { _ts?: number }) | null;
  onCommandComplete: (exitCode: number) => void;
  previewResult: PreviewResult | null;
  previewLoading: boolean;
  previewError: string | null;
  activeOutputTab: 'output' | 'preview';
  onOutputTabChange: (tab: 'output' | 'preview') => void;
}

// Parse "dbt run --select foo" or "run --select foo" into a DbtCommand
function parseUserCommand(raw: string): DbtCommand | null {
  const parts = raw.trim().replace(/^dbt\s+/, '').split(/\s+/).filter(Boolean);
  if (!parts.length) return null;
  const [command, ...rest] = parts;
  const allowed = ['run', 'test', 'compile', 'debug', 'deps', 'docs', 'source', 'seed', 'snapshot', 'build', 'clean', 'list', 'ls'];
  if (!allowed.includes(command)) return null;

  // Pull out --select <model> if present
  const selIdx = rest.indexOf('--select');
  let modelName: string | undefined;
  const args: string[] = [];
  for (let i = 0; i < rest.length; i++) {
    if (rest[i] === '--select' && rest[i + 1]) {
      modelName = rest[i + 1];
      i++; // skip value
    } else {
      args.push(rest[i]);
    }
  }

  const label = `dbt ${command}${args.length ? ' ' + args.join(' ') : ''}${modelName ? ' --select ' + modelName : ''}`;
  return { command, args, modelName, label };
}

export default function OutputPanel({
  open,
  onToggle,
  pendingCommand,
  onCommandComplete,
  previewResult,
  previewLoading,
  previewError,
  activeOutputTab,
  onOutputTabChange,
}: Props) {
  const [lines, setLines] = useState<OutputLine[]>([]);
  const [running, setRunning] = useState(false);
  const [exitCode, setExitCode] = useState<number | null>(null);
  const [displayCmd, setDisplayCmd] = useState('');
  const [elapsed, setElapsed] = useState(0);
  const [docsUrl, setDocsUrl] = useState<string | null>(null);
  const [cmdInput, setCmdInput] = useState('');

  const bottomRef = useRef<HTMLDivElement>(null);
  const startRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Store onCommandComplete in a ref so runCommand never needs it as a dep
  const onCommandCompleteRef = useRef(onCommandComplete);
  useEffect(() => { onCommandCompleteRef.current = onCommandComplete; }, [onCommandComplete]);

  useEffect(() => {
    if (open && activeOutputTab === 'output')
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [lines, open, activeOutputTab]);

  const stopTimer = useCallback(() => {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
  }, []);

  // Stable runCommand — no external deps that change between renders
  const runCommand = useCallback(async (cmd: DbtCommand) => {
    abortRef.current?.abort();
    abortRef.current = new AbortController();

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
        body: JSON.stringify({ command: cmd.command, args: cmd.args, modelName: cmd.modelName }),
        signal: abortRef.current.signal,
      });

      if (!res.body) throw new Error('No response body from server');

      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = '';

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
              // Detect docs serve URL
              const urlMatch = text.match(/https?:\/\/\S+/);
              if (urlMatch && cmd.command === 'docs') setDocsUrl(urlMatch[0]);
              setLines((prev) => [
                ...prev,
                { text, lineType: evt.lineType ?? 'info' },
              ]);
            } else if (evt.type === 'done') {
              setExitCode(evt.exitCode ?? 1);
              setRunning(false);
              stopTimer();
              onCommandCompleteRef.current(evt.exitCode ?? 1);
            }
          } catch { /* skip malformed JSON */ }
        }
      }
    } catch (err: unknown) {
      if (err instanceof Error && err.name === 'AbortError') return;
      const msg = err instanceof Error ? err.message : 'Unknown error';
      setLines((prev) => [...prev, { text: `Error: ${msg}`, lineType: 'error' }]);
      setRunning(false);
      stopTimer();
    }
  }, [stopTimer]); // ← no onCommandComplete dep — uses ref instead

  // Only fire when pendingCommand reference actually changes (page.tsx stamps _ts)
  const lastRunTs = useRef<number | undefined>(undefined);
  useEffect(() => {
    if (!pendingCommand) return;
    const ts = pendingCommand._ts ?? 0;
    if (ts === lastRunTs.current) return; // same command, don't re-run
    lastRunTs.current = ts;
    runCommand(pendingCommand);
  }, [pendingCommand, runCommand]);

  useEffect(() => () => stopTimer(), [stopTimer]);

  const handleStop = () => {
    abortRef.current?.abort();
    setRunning(false);
    stopTimer();
    setLines((prev) => [...prev, { text: '— Stopped by user —', lineType: 'warning' }]);
  };

  const handleUserCommand = () => {
    const cmd = parseUserCommand(cmdInput.trim());
    if (!cmd) return;
    setCmdInput('');
    onOutputTabChange('output');
    if (!open) onToggle();
    runCommand(cmd);
  };

  const lineClass = (t: OutputLine['lineType']) => {
    if (t === 'success') return 'text-green-400';
    if (t === 'error') return 'text-red-400';
    if (t === 'warning') return 'text-yellow-400';
    return 'text-[#d4d4d4]';
  };

  return (
    <div className="flex flex-col bg-[#1e1e1e] border-t border-[#3e3e42] h-full">
      {/* ── Header bar ── */}
      <div className="flex items-center gap-0 px-2 h-9 border-b border-[#3e3e42] shrink-0 select-none">
        {/* Tabs */}
        {(['output', 'preview'] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => { onOutputTabChange(tab); if (!open) onToggle(); }}
            className={`flex items-center gap-1.5 h-full px-3 text-[10px] font-semibold uppercase tracking-widest border-b-2 transition-colors ${
              activeOutputTab === tab
                ? 'border-[#007acc] text-[#bdbdbd]'
                : 'border-transparent text-[#5a5a5a] hover:text-[#8b8b8b]'
            }`}
          >
            {tab === 'output' ? <Terminal size={11} /> : <Table2 size={11} />}
            {tab}
            {tab === 'preview' && previewLoading && <Loader2 size={10} className="animate-spin ml-0.5" />}
          </button>
        ))}

        <div className="w-px h-4 bg-[#3e3e42] mx-2" />

        {/* Contextual label */}
        {activeOutputTab === 'output' && displayCmd && (
          <span className="text-[10px] text-[#5a5a5a] font-mono truncate max-w-[220px]">
            {displayCmd}
          </span>
        )}
        {activeOutputTab === 'preview' && previewResult && !previewLoading && (
          <span className="text-[10px] text-[#5a5a5a] font-mono">
            {previewResult.rows.length} rows × {previewResult.columns.length} cols
          </span>
        )}

        {/* Right side controls */}
        <div className="flex items-center gap-2 ml-auto shrink-0">
          {activeOutputTab === 'output' && running && (
            <>
              <span className="flex items-center gap-1 text-[10px] text-[#8b8b8b]">
                <Loader2 size={11} className="animate-spin" />{elapsed}s
              </span>
              <button onClick={handleStop} title="Stop" className="text-red-400 hover:text-red-300 transition-colors">
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
              className="flex items-center gap-1 text-[10px] text-[#4ec9b0] hover:underline">
              <ExternalLink size={11} /> Open Docs
            </a>
          )}
          {activeOutputTab === 'output' && lines.length > 0 && !running && (
            <button title="Clear" onClick={() => { setLines([]); setExitCode(null); setDisplayCmd(''); setDocsUrl(null); }}
              className="text-[#5a5a5a] hover:text-[#8b8b8b] transition-colors">
              <Trash2 size={11} />
            </button>
          )}
          <button onClick={onToggle} title={open ? 'Collapse' : 'Expand'}
            className="text-[#5a5a5a] hover:text-[#8b8b8b] transition-colors ml-1">
            {open ? <ChevronDown size={13} /> : <ChevronUp size={13} />}
          </button>
        </div>
      </div>

      {/* ── Body ── */}
      {open && (
        <div className="flex flex-col flex-1 min-h-0">
          {/* Output tab */}
          {activeOutputTab === 'output' && (
            <>
              <div className="flex-1 overflow-y-auto p-3 font-mono text-xs leading-5 min-h-0 select-text cursor-text">
                {lines.length === 0 && !running && (
                  <p className="text-[#5a5a5a] italic">
                    Run a dbt command or type one below.
                  </p>
                )}
                {lines.map((line, i) => (
                  <div key={i} className={`${lineClass(line.lineType)} whitespace-pre-wrap break-all`}>
                    {line.text}
                  </div>
                ))}
                <div ref={bottomRef} />
              </div>

              {/* ── Command input bar ── */}
              <div className="flex items-center gap-1 px-2 py-1.5 border-t border-[#3e3e42] bg-[#252526] shrink-0">
                <span className="text-[10px] text-[#5a5a5a] font-mono shrink-0">dbt&nbsp;▸</span>
                <input
                  value={cmdInput}
                  onChange={(e) => setCmdInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') handleUserCommand(); }}
                  placeholder="run --select model_name   or   compile   or   test"
                  className="flex-1 bg-transparent text-xs font-mono text-[#d4d4d4] outline-none placeholder-[#4a4a4a]"
                  spellCheck={false}
                  disabled={running}
                />
                <button
                  onClick={handleUserCommand}
                  disabled={running || !cmdInput.trim()}
                  title="Run command (Enter)"
                  className="text-[#5a5a5a] hover:text-[#007acc] disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                >
                  <Send size={12} />
                </button>
              </div>
            </>
          )}

          {/* Preview tab */}
          {activeOutputTab === 'preview' && (
            <div className="flex-1 overflow-auto min-h-0 select-text">
              {previewLoading && (
                <div className="flex items-center justify-center h-full gap-2 text-[#8b8b8b] text-xs">
                  <Loader2 size={16} className="animate-spin" />Running query on Athena…
                </div>
              )}
              {!previewLoading && previewError && (
                <div className="p-4 text-red-400 text-xs font-mono whitespace-pre-wrap">
                  <XCircle size={14} className="inline mr-1.5 mb-0.5" />{previewError}
                </div>
              )}
              {!previewLoading && !previewError && previewResult && previewResult.columns.length === 0 && (
                <div className="flex items-center justify-center h-full text-[#5a5a5a] text-xs italic">
                  Query returned no rows.
                </div>
              )}
              {!previewLoading && !previewError && previewResult && previewResult.columns.length > 0 && (
                <table className="w-full text-xs border-collapse font-mono">
                  <thead className="sticky top-0 z-10">
                    <tr>
                      {previewResult.columns.map((col) => (
                        <th key={col}
                          className="px-3 py-1.5 text-left text-[#9cdcfe] font-semibold bg-[#252526] border-b border-r border-[#3e3e42] whitespace-nowrap">
                          {col}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {previewResult.rows.map((row, ri) => (
                      <tr key={ri} className={ri % 2 === 0 ? 'bg-[#1e1e1e]' : 'bg-[#252526]'}>
                        {previewResult.columns.map((col) => (
                          <td key={col}
                            className="px-3 py-1 text-[#d4d4d4] border-r border-[#3e3e42] max-w-[240px] truncate"
                            title={row[col]}>
                            {row[col] === '' || row[col] == null
                              ? <span className="text-[#5a5a5a] italic">null</span>
                              : row[col]}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
              {!previewLoading && !previewError && !previewResult && (
                <div className="flex items-center justify-center h-full text-[#5a5a5a] text-xs italic">
                  Open a .sql model and click "Preview Data" to query Athena.
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

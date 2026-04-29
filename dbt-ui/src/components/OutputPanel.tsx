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

export interface OutputPanelRef {
  runCommand: (cmd: DbtCommand) => void;
}

interface OutputLine {
  text: string;
  lineType: 'info' | 'success' | 'error' | 'warning';
}

interface Props {
  open: boolean;
  onToggle: () => void;
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
  const allowed = [
    'run', 'test', 'compile', 'debug', 'deps', 'docs', 'source',
    'seed', 'snapshot', 'build', 'clean', 'list', 'ls',
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

  const bottomRef  = useRef<HTMLDivElement>(null);
  const inputRef   = useRef<HTMLInputElement>(null);
  const startRef   = useRef(0);
  const timerRef   = useRef<ReturnType<typeof setInterval> | null>(null);
  const abortRef   = useRef<AbortController | null>(null);
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
              setLines((prev) => [...prev, { text, lineType: evt.lineType ?? 'info' }]);
            } else if (evt.type === 'done') {
              setExitCode(evt.exitCode ?? 1);
              setRunning(false);
              stopTimer();
              onCompleteRef.current(evt.exitCode ?? 1);
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
  }, [stopTimer]);

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
    const cmd = parseUserCommand(raw.trim());
    if (!cmd) return;
    setHistory((h) => [raw.trim(), ...h.slice(0, 49)]);
    setHistoryIdx(-1);
    setCmdInput('');
    onOutputTabChange('output');
    if (!open) onToggle();
    runCommand(cmd);
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
        {(['output', 'preview'] as const).map((tab) => (
          <button
            key={tab}
            onClick={(e) => { e.stopPropagation(); onOutputTabChange(tab); if (!open) onToggle(); }}
            className={`flex items-center gap-1.5 h-full px-3 text-[10px] font-semibold uppercase tracking-widest border-b-2 transition-colors ${
              activeOutputTab === tab
                ? 'border-[#007acc] text-[#d4d4d4]'
                : 'border-transparent text-[#555] hover:text-[#888]'
            }`}
          >
            {tab === 'output' ? <Terminal size={11} /> : <Table2 size={11} />}
            {tab}
            {tab === 'preview' && previewLoading && <Loader2 size={10} className="animate-spin ml-0.5" />}
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
              {/* Scrollable output area — clicking focuses the input */}
              <div
                className="flex-1 overflow-y-auto px-4 py-2 font-mono text-xs leading-[1.6] min-h-0 select-text cursor-text"
                onClick={() => inputRef.current?.focus()}
              >
                {lines.length === 0 && !running && (
                  <p className="text-[#3a3a3a] italic mt-2">
                    No output yet. Run a dbt command using the buttons above or type below.
                  </p>
                )}
                {lines.map((line, i) => (
                  <div key={i} className={`${lineClass(line.lineType)} whitespace-pre-wrap break-all`}>
                    {line.text}
                  </div>
                ))}
                <div ref={bottomRef} />
              </div>

              {/* ── Terminal-style prompt input ── */}
              <div
                className="shrink-0 border-t border-[#2a2a2a] bg-[#111] px-3 py-2"
                onClick={() => inputRef.current?.focus()}
              >
                <div className="flex items-center gap-2 font-mono text-xs">
                  {/* Shell-style prompt */}
                  <span className="text-[#569cd6] shrink-0 select-none">$</span>
                  <span className="text-[#4ec9b0] shrink-0 select-none">dbt</span>
                  <span className="text-[#555] shrink-0 select-none">▸</span>
                  <input
                    ref={inputRef}
                    value={cmdInput}
                    onChange={(e) => setCmdInput(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="run --select model_name   |   compile   |   docs generate   |   test"
                    className="flex-1 bg-transparent text-[#d4d4d4] outline-none placeholder-[#333] caret-[#d4d4d4]"
                    spellCheck={false}
                    disabled={running}
                    autoComplete="off"
                  />
                  {running ? (
                    <Loader2 size={11} className="animate-spin text-[#555] shrink-0" />
                  ) : (
                    cmdInput.trim() && (
                      <button
                        onClick={() => submitCommand(cmdInput)}
                        className="text-[#569cd6] hover:text-[#79b8ff] text-[10px] shrink-0 transition-colors"
                      >
                        ↵
                      </button>
                    )
                  )}
                </div>
                <p className="text-[10px] text-[#2a2a2a] mt-1 select-none">
                  ↑ ↓ history &nbsp;·&nbsp; Enter to run &nbsp;·&nbsp; e.g. run --select my_model
                </p>
              </div>
            </div>
          )}

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

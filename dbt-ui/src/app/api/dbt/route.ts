import { NextRequest, NextResponse } from 'next/server';
import { spawn, execSync } from 'child_process';
import { accessSync, constants } from 'fs';
import path from 'path';
import { DBT_ROOT } from '@/lib/fileSystem';
import { invalidateCache } from '@/lib/manifest';
import { requireEditor } from '@/lib/apiAuth';

// Resolve dbt binary: env var → venv → vdbt → system dbt
function resolveDbtBin(): string {
  if (process.env.DBT_BIN) return process.env.DBT_BIN;

  const candidates = [
    path.join(DBT_ROOT, 'venv', 'bin', 'dbt'),
    path.join(DBT_ROOT, 'vdbt', 'bin', 'dbt'),
    path.join(DBT_ROOT, '.venv', 'bin', 'dbt'),
  ];

  for (const candidate of candidates) {
    try {
      // sync access check — runs once at startup
      accessSync(candidate, constants.X_OK);
      return candidate;
    } catch { /* try next */ }
  }

  // Fall back to system dbt if it's in PATH
  try {
    const which = execSync('which dbt', { encoding: 'utf-8' }).trim();
    if (which) return which;
  } catch { /* not in PATH */ }

  // Last resort — original default (will produce a clear error message)
  return path.join(DBT_ROOT, 'venv', 'bin', 'dbt');
}

const DBT_BIN = resolveDbtBin();
console.log(`[dbt] Binary resolved → ${DBT_BIN}`);

type LineType = 'info' | 'success' | 'error' | 'warning';

// Strip ANSI escape codes (colors, cursor movement, etc.)
const ANSI_RE = /\x1B\[[0-9;]*[A-Za-z]|\x1B\][^\x07]*\x07|\x1B[^[]/g;
function stripAnsi(s: string): string {
  return s.replace(ANSI_RE, '').replace(/\r/g, '');
}

function classifyLine(text: string, isStderr: boolean): LineType {
  const lower = text.toLowerCase();

  // ── Success patterns ────────────────────────────────────────────────────
  if (
    lower.includes(' pass') ||
    lower.includes('ok created') ||
    lower.includes('completed successfully') ||
    lower.includes('success') ||
    /\d+ of \d+ ok/.test(lower)
  ) return 'success';

  // ── Python / dbt warnings ───────────────────────────────────────────────
  if (
    lower.includes('runtimewarning') ||
    lower.includes('userwarning') ||
    lower.includes('deprecationwarning') ||
    lower.includes('warnings.warn') ||
    lower.includes('deprecated') ||
    lower.includes(' warn')
  ) return 'warning';

  // ── Hard errors ─────────────────────────────────────────────────────────
  if (
    lower.includes('compilation error') ||
    lower.includes('database error') ||
    lower.includes('encountered an error') ||
    lower.includes('parsing error') ||
    /\berror\b/.test(lower) ||
    lower.includes(' fail') ||
    lower.includes('traceback')
  ) return 'error';

  // ── Everything else (including normal dbt stderr progress lines) → info ─
  // dbt sends ALL its normal progress output through stderr:
  //   "Running with dbt=...", "Found X sources", "1 of 3 START ...", etc.
  // These are NOT errors — show them as normal white text.
  return 'info';
}

export async function POST(req: NextRequest) {
  const gate = await requireEditor();
  if (gate instanceof NextResponse) return gate;

  const { command, args = [], modelName, target } = (await req.json()) as {
    command: string;
    args?: string[];
    modelName?: string;
    target?: string;
  };

  const cmdArgs: string[] = [command, ...args];
  if (modelName) cmdArgs.push('--select', modelName);
  // Always point at the project directory
  cmdArgs.push('--project-dir', DBT_ROOT, '--profiles-dir', DBT_ROOT);
  // Inject --target if a non-default environment was chosen
  if (target?.trim()) cmdArgs.push('--target', target.trim());

  const encoder = new TextEncoder();

  let childProc: ReturnType<typeof spawn> | null = null;

  const stream = new ReadableStream({
    start(controller) {
      const send = (payload: object) => {
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`));
        } catch { /* stream already closed */ }
      };

      send({
        type: 'start',
        command: `dbt ${cmdArgs.join(' ')}`,
        time: new Date().toISOString(),
      });

      const proc = spawn(DBT_BIN, cmdArgs, {
        cwd: DBT_ROOT,
        env: {
          ...process.env,
          // Force Python to flush stdout/stderr immediately instead of
          // buffering until process exit — critical for real-time SSE streaming
          PYTHONUNBUFFERED: '1',
          PYTHONDONTWRITEBYTECODE: '1',
        },
      });
      childProc = proc;

      let stdoutBuf = '';
      let stderrBuf = '';

      const flushLines = (buf: string, isStderr: boolean): string => {
        // Normalise \r\n and bare \r to \n so progress-overwrite lines flush correctly
        const normalised = buf.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
        const lines = normalised.split('\n');
        const incomplete = lines.pop() ?? '';
        for (const raw of lines) {
          const line = stripAnsi(raw);
          if (!line.trim()) continue;
          send({
            type: 'line',
            text: line,
            lineType: classifyLine(line, isStderr),
            isStderr,
          });
        }
        return incomplete;
      };

      proc.stdout.on('data', (chunk: Buffer) => {
        stdoutBuf = flushLines(stdoutBuf + chunk.toString(), false);
      });

      proc.stderr.on('data', (chunk: Buffer) => {
        stderrBuf = flushLines(stderrBuf + chunk.toString(), true);
      });

      proc.on('close', (code) => {
        if (stdoutBuf.trim()) send({ type: 'line', text: stripAnsi(stdoutBuf), lineType: classifyLine(stripAnsi(stdoutBuf), false), isStderr: false });
        if (stderrBuf.trim()) send({ type: 'line', text: stripAnsi(stderrBuf), lineType: classifyLine(stripAnsi(stderrBuf), true), isStderr: true });
        // After compile / run / docs generate — invalidate the manifest cache
        // so the next RAG call picks up freshly compiled metadata
        if (['run', 'compile', 'docs'].includes(command)) invalidateCache();
        send({ type: 'done', exitCode: code ?? 1 });
        childProc = null;
        try { controller.close(); } catch { /* already closed */ }
      });

      proc.on('error', (err) => {
        send({
          type: 'line',
          text: `Failed to start dbt binary at ${DBT_BIN}: ${err.message}`,
          lineType: 'error',
          isStderr: true,
        });
        send({ type: 'done', exitCode: 1 });
        childProc = null;
        try { controller.close(); } catch { /* already closed */ }
      });
    },

    // Called when the client disconnects or aborts the fetch (e.g. clicking Stop)
    cancel() {
      if (childProc) {
        childProc.kill('SIGTERM');
        // Force-kill after 3 s if SIGTERM is ignored (e.g. docs serve)
        setTimeout(() => { if (childProc) childProc.kill('SIGKILL'); }, 3000);
        childProc = null;
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}

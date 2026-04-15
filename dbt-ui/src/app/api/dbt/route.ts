import { NextRequest } from 'next/server';
import { spawn } from 'child_process';
import fs from 'fs/promises';
import path from 'path';
import { DBT_ROOT } from '@/lib/fileSystem';
import { invalidateCache } from '@/lib/manifest';

// Use the virtualenv dbt by default; override via env var
const DBT_BIN =
  process.env.DBT_BIN ?? path.join(DBT_ROOT, 'vdbt', 'bin', 'dbt');

type LineType = 'info' | 'success' | 'error' | 'warning';

function classifyLine(text: string, isStderr: boolean): LineType {
  const lower = text.toLowerCase();
  if (
    lower.includes(' pass') ||
    lower.includes('ok created') ||
    lower.includes('completed successfully') ||
    /\d+ of \d+ ok/.test(lower)
  ) return 'success';
  // Python warnings / deprecation notices — harmless, show as yellow
  if (
    lower.includes('runtimewarning') ||
    lower.includes('userwarning') ||
    lower.includes('deprecationwarning') ||
    lower.includes('warnings.warn') ||
    lower.includes('deprecated')
  ) return 'warning';
  if (
    lower.includes(' error') ||
    lower.includes(' fail') ||
    lower.includes('compilation error') ||
    lower.includes('database error') ||
    isStderr
  ) return 'error';
  if (lower.includes(' warn')) return 'warning';
  return 'info';
}

export async function POST(req: NextRequest) {
  const { command, args = [], modelName } = (await req.json()) as {
    command: string;
    args?: string[];
    modelName?: string;
  };

  const cmdArgs: string[] = [command, ...args];
  if (modelName) cmdArgs.push('--select', modelName);
  // Always point at the project directory
  cmdArgs.push('--project-dir', DBT_ROOT, '--profiles-dir', DBT_ROOT);

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    start(controller) {
      const send = (payload: object) =>
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`));

      send({
        type: 'start',
        command: `dbt ${cmdArgs.join(' ')}`,
        time: new Date().toISOString(),
      });

      const proc = spawn(DBT_BIN, cmdArgs, {
        cwd: DBT_ROOT,
        env: { ...process.env },
      });

      let stdoutBuf = '';
      let stderrBuf = '';

      const flushLines = (buf: string, isStderr: boolean): string => {
        const lines = buf.split('\n');
        const incomplete = lines.pop() ?? '';
        for (const line of lines) {
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
        if (stdoutBuf.trim()) send({ type: 'line', text: stdoutBuf, lineType: classifyLine(stdoutBuf, false), isStderr: false });
        if (stderrBuf.trim()) send({ type: 'line', text: stderrBuf, lineType: 'error', isStderr: true });
        // After compile / run / docs generate — invalidate the manifest cache
        // so the next RAG call picks up freshly compiled metadata
        if (['run', 'compile', 'docs'].includes(command)) invalidateCache();
        send({ type: 'done', exitCode: code ?? 1 });
        controller.close();
      });

      proc.on('error', (err) => {
        send({
          type: 'line',
          text: `Failed to start dbt binary at ${DBT_BIN}: ${err.message}`,
          lineType: 'error',
          isStderr: true,
        });
        send({ type: 'done', exitCode: 1 });
        controller.close();
      });
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

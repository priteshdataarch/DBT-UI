import { NextRequest } from 'next/server';
import { spawn } from 'child_process';
import { DBT_ROOT } from '@/lib/fileSystem';

type LineType = 'info' | 'success' | 'error' | 'warning';

const ANSI_RE = /\x1B\[[0-9;]*[A-Za-z]|\x1B\][^\x07]*\x07|\x1B[^[]/g;
function stripAnsi(s: string): string {
  return s.replace(ANSI_RE, '').replace(/\r/g, '');
}

function classifyLine(text: string, isStderr: boolean): LineType {
  const lower = text.toLowerCase();
  if (lower.includes('error') || lower.includes('fatal') || lower.includes('traceback')) return 'error';
  if (lower.includes('warn')) return 'warning';
  if (!isStderr && (lower.includes('success') || lower.includes('done'))) return 'success';
  return 'info';
}

export async function POST(req: NextRequest) {
  const { command } = (await req.json()) as { command?: string };
  const line = command?.trim() ?? '';
  if (!line) {
    return new Response(JSON.stringify({ error: 'command is required' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const encoder = new TextEncoder();
  const isWin = process.platform === 'win32';
  const shellCmd = isWin
    ? { exe: 'cmd.exe' as const, args: ['/d', '/s', '/c', line] }
    : { exe: '/bin/sh' as const, args: ['-c', line] };

  let childProc: ReturnType<typeof spawn> | null = null;

  const stream = new ReadableStream({
    start(controller) {
      const send = (payload: object) => {
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`));
        } catch { /* closed */ }
      };

      send({
        type: 'start',
        command: line,
        time: new Date().toISOString(),
      });

      const proc = spawn(shellCmd.exe, shellCmd.args, {
        cwd: DBT_ROOT,
        env: { ...process.env },
      });
      childProc = proc;

      let stdoutBuf = '';
      let stderrBuf = '';

      const flushLines = (buf: string, isStderr: boolean): string => {
        const normalised = buf.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
        const lines = normalised.split('\n');
        const incomplete = lines.pop() ?? '';
        for (const raw of lines) {
          const t = stripAnsi(raw);
          if (!t.trim()) continue;
          send({
            type: 'line',
            text: t,
            lineType: classifyLine(t, isStderr),
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
        if (stdoutBuf.trim()) {
          send({
            type: 'line',
            text: stripAnsi(stdoutBuf),
            lineType: classifyLine(stripAnsi(stdoutBuf), false),
            isStderr: false,
          });
        }
        if (stderrBuf.trim()) {
          send({
            type: 'line',
            text: stripAnsi(stderrBuf),
            lineType: classifyLine(stripAnsi(stderrBuf), true),
            isStderr: true,
          });
        }
        send({ type: 'done', exitCode: code ?? 1 });
        childProc = null;
        try { controller.close(); } catch { /* */ }
      });

      proc.on('error', (err) => {
        send({
          type: 'line',
          text: `Failed to start shell: ${err.message}`,
          lineType: 'error',
          isStderr: true,
        });
        send({ type: 'done', exitCode: 1 });
        childProc = null;
        try { controller.close(); } catch { /* */ }
      });
    },

    cancel() {
      if (childProc) {
        childProc.kill('SIGTERM');
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

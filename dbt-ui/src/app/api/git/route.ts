import { NextRequest, NextResponse } from 'next/server';
import { execFile } from 'child_process';
import { promisify } from 'util';
import path from 'path';

const DBT_ROOT = process.env.DBT_PROJECT_ROOT
  ? path.resolve(process.env.DBT_PROJECT_ROOT)
  : path.resolve(process.cwd(), '..');

const exec = promisify(execFile);

function run(args: string[]) {
  return exec('git', args, { cwd: DBT_ROOT });
}

export interface GitFileEntry {
  path: string;
  status: string; // 'M' | 'A' | 'D' | 'R' | '?' | etc.
  area: 'staged' | 'unstaged' | 'untracked';
}

export interface GitStatus {
  branch: string;
  ahead: number;
  behind: number;
  staged: GitFileEntry[];
  unstaged: GitFileEntry[];
  untracked: GitFileEntry[];
  isRepo: boolean;
}

// ── GET — return full git status ──────────────────────────────────────────────
export async function GET(): Promise<NextResponse> {
  try {
    // Verify it's a git repo
    await run(['rev-parse', '--is-inside-work-tree']);
  } catch {
    return NextResponse.json({ isRepo: false } as Partial<GitStatus>);
  }

  try {
    // Branch name
    let branch = 'HEAD';
    try {
      const { stdout } = await run(['rev-parse', '--abbrev-ref', 'HEAD']);
      branch = stdout.trim();
    } catch { /* detached HEAD */ }

    // Ahead / behind relative to upstream
    let ahead = 0;
    let behind = 0;
    try {
      const { stdout } = await run([
        'rev-list', '--left-right', '--count', `HEAD...@{u}`,
      ]);
      const parts = stdout.trim().split(/\s+/);
      ahead = parseInt(parts[0] ?? '0', 10);
      behind = parseInt(parts[1] ?? '0', 10);
    } catch { /* no upstream */ }

    // Porcelain status
    const { stdout: statusOut } = await run(['status', '--porcelain=v1', '-u']);
    const staged: GitFileEntry[] = [];
    const unstaged: GitFileEntry[] = [];
    const untracked: GitFileEntry[] = [];

    for (const line of statusOut.split('\n')) {
      if (!line) continue;
      const xy = line.substring(0, 2);
      const filePath = line.substring(3).trim().replace(/^"(.*)"$/, '$1');
      const x = xy[0]; // index (staged)
      const y = xy[1]; // worktree (unstaged)

      if (x === '?' && y === '?') {
        untracked.push({ path: filePath, status: '?', area: 'untracked' });
        continue;
      }
      if (x !== ' ' && x !== '?') {
        staged.push({ path: filePath, status: x, area: 'staged' });
      }
      if (y !== ' ' && y !== '?') {
        unstaged.push({ path: filePath, status: y, area: 'unstaged' });
      }
    }

    return NextResponse.json({ branch, ahead, behind, staged, unstaged, untracked, isRepo: true } as GitStatus);
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

// ── POST — perform git action ─────────────────────────────────────────────────
export async function POST(req: NextRequest): Promise<NextResponse> {
  const body = await req.json() as { action: string; message?: string; files?: string[] };
  const { action, message, files } = body;

  try {
    switch (action) {
      case 'stage-all': {
        await run(['add', '-A']);
        return NextResponse.json({ ok: true });
      }

      case 'stage-files': {
        if (!files?.length) return NextResponse.json({ error: 'No files provided' }, { status: 400 });
        await run(['add', '--', ...files]);
        return NextResponse.json({ ok: true });
      }

      case 'unstage-files': {
        if (!files?.length) return NextResponse.json({ error: 'No files provided' }, { status: 400 });
        await run(['reset', 'HEAD', '--', ...files]);
        return NextResponse.json({ ok: true });
      }

      case 'unstage-all': {
        try { await run(['reset', 'HEAD']); } catch { /* nothing staged */ }
        return NextResponse.json({ ok: true });
      }

      case 'commit': {
        if (!message?.trim()) return NextResponse.json({ error: 'Commit message required' }, { status: 400 });
        const { stdout } = await run(['commit', '-m', message.trim()]);
        return NextResponse.json({ ok: true, output: stdout.trim() });
      }

      case 'push': {
        const { stdout } = await run(['push']);
        return NextResponse.json({ ok: true, output: stdout.trim() });
      }

      case 'commit-push': {
        if (!message?.trim()) return NextResponse.json({ error: 'Commit message required' }, { status: 400 });
        const { stdout: cOut } = await run(['commit', '-m', message.trim()]);
        const { stdout: pOut } = await run(['push']);
        return NextResponse.json({ ok: true, output: [cOut, pOut].filter(Boolean).join('\n').trim() });
      }

      case 'discard': {
        if (!files?.length) return NextResponse.json({ error: 'No files provided' }, { status: 400 });
        await run(['checkout', '--', ...files]);
        return NextResponse.json({ ok: true });
      }

      default:
        return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

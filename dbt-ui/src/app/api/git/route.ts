import { NextRequest, NextResponse } from 'next/server';
import { execFile } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import { requireEditor, requireReader } from '@/lib/auth';

const DBT_ROOT = process.env.DBT_PROJECT_ROOT
  ? path.resolve(process.env.DBT_PROJECT_ROOT)
  : path.resolve(process.cwd(), '..');

const exec = promisify(execFile);

// Use `git rev-parse --show-toplevel` to discover the true repo root so
// that `git status` reports paths relative to the repo root regardless of
// which subdirectory Next.js resolves as process.cwd(). Without this,
// files outside dbt-ui/ (models/, seeds/, macros/ …) could be reported
// with "../" prefixes and silently skipped by the path parser.
let cachedGitRoot: Promise<string> | null = null;
function getGitRoot(): Promise<string> {
  if (!cachedGitRoot) {
    cachedGitRoot = exec('git', ['rev-parse', '--show-toplevel'], { cwd: DBT_ROOT })
      .then(({ stdout }) => stdout.trim())
      .catch(() => DBT_ROOT);
  }
  return cachedGitRoot;
}

async function run(args: string[]) {
  return exec('git', args, { cwd: await getGitRoot() });
}

export interface GitFileEntry {
  path: string;
  status: string; // 'M' | 'A' | 'D' | 'R' | '?' | etc.
  area: 'staged' | 'unstaged' | 'untracked';
}

export interface GitBranch {
  name: string;
  isCurrent: boolean;
  isRemote: boolean;
  upstream?: string;
}

export interface GitStatus {
  branch: string;
  ahead: number;
  behind: number;
  staged: GitFileEntry[];
  unstaged: GitFileEntry[];
  untracked: GitFileEntry[];
  isRepo: boolean;
  branches?: GitBranch[];
}

// ── GET — return full git status ──────────────────────────────────────────────
export async function GET(): Promise<NextResponse> {
  const gate = await requireReader();
  if (gate instanceof NextResponse) return gate;

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

    // Local branches
    const branches: GitBranch[] = [];
    try {
      const { stdout: branchOut } = await run(['branch', '-vv', '--format=%(refname:short)|%(upstream:short)|%(HEAD)']);
      for (const line of branchOut.split('\n')) {
        if (!line.trim()) continue;
        const [name, upstream, head] = line.split('|');
        if (!name?.trim()) continue;
        branches.push({
          name: name.trim(),
          isCurrent: head?.trim() === '*',
          isRemote: false,
          upstream: upstream?.trim() || undefined,
        });
      }
    } catch { /* ignore branch errors */ }

    return NextResponse.json({ branch, ahead, behind, staged, unstaged, untracked, isRepo: true, branches } as GitStatus);
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

// ── POST — perform git action ─────────────────────────────────────────────────
export async function POST(req: NextRequest): Promise<NextResponse> {
  const gate = await requireEditor();
  if (gate instanceof NextResponse) return gate;

  const body = await req.json() as {
    action: string;
    message?: string;
    files?: string[];
    branch?: string;
    remote?: string;
    setUpstream?: boolean;
  };
  const { action, message, files, branch, remote = 'origin', setUpstream } = body;

  try {
    switch (action) {

      // ── Staging ────────────────────────────────────────────────────────────
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
      case 'discard': {
        if (!files?.length) return NextResponse.json({ error: 'No files provided' }, { status: 400 });
        await run(['checkout', '--', ...files]);
        return NextResponse.json({ ok: true });
      }

      // ── Commit ─────────────────────────────────────────────────────────────
      case 'commit': {
        if (!message?.trim()) return NextResponse.json({ error: 'Commit message required' }, { status: 400 });
        const { stdout } = await run(['commit', '-m', message.trim()]);
        return NextResponse.json({ ok: true, output: stdout.trim() });
      }

      // ── Push ───────────────────────────────────────────────────────────────
      case 'push': {
        const pushArgs = setUpstream && branch
          ? ['push', '--set-upstream', remote, branch]
          : ['push'];
        const { stdout, stderr } = await run(pushArgs);
        return NextResponse.json({ ok: true, output: (stdout + '\n' + stderr).trim() });
      }

      case 'commit-push': {
        if (!message?.trim()) return NextResponse.json({ error: 'Commit message required' }, { status: 400 });
        const { stdout: cOut } = await run(['commit', '-m', message.trim()]);
        const pushArgs = setUpstream && branch
          ? ['push', '--set-upstream', remote, branch]
          : ['push'];
        const { stdout: pOut, stderr: pErr } = await run(pushArgs);
        return NextResponse.json({ ok: true, output: [cOut, pOut, pErr].filter(Boolean).join('\n').trim() });
      }

      // ── Pull ───────────────────────────────────────────────────────────────
      case 'pull': {
        const pullArgs = ['pull', '--rebase=false'];
        if (remote && branch) pullArgs.push(remote, branch);
        const { stdout, stderr } = await run(pullArgs);
        return NextResponse.json({ ok: true, output: (stdout + '\n' + stderr).trim() });
      }

      case 'pull-rebase': {
        const rebaseArgs = ['pull', '--rebase'];
        if (remote && branch) rebaseArgs.push(remote, branch);
        const { stdout, stderr } = await run(rebaseArgs);
        return NextResponse.json({ ok: true, output: (stdout + '\n' + stderr).trim() });
      }

      // ── Fetch ─────────────────────────────────────────────────────────────
      case 'fetch': {
        const { stdout, stderr } = await run(['fetch', '--all', '--prune']);
        return NextResponse.json({ ok: true, output: (stdout + '\n' + stderr).trim() });
      }

      // ── Branch operations ─────────────────────────────────────────────────
      case 'create-branch': {
        if (!branch?.trim()) return NextResponse.json({ error: 'Branch name required' }, { status: 400 });
        await run(['checkout', '-b', branch.trim()]);
        return NextResponse.json({ ok: true, output: `Switched to new branch '${branch.trim()}'` });
      }

      case 'switch-branch': {
        if (!branch?.trim()) return NextResponse.json({ error: 'Branch name required' }, { status: 400 });
        const { stdout, stderr } = await run(['checkout', branch.trim()]);
        return NextResponse.json({ ok: true, output: (stdout + '\n' + stderr).trim() });
      }

      case 'delete-branch': {
        if (!branch?.trim()) return NextResponse.json({ error: 'Branch name required' }, { status: 400 });
        const { stdout } = await run(['branch', '-d', branch.trim()]);
        return NextResponse.json({ ok: true, output: stdout.trim() });
      }

      case 'delete-branch-force': {
        if (!branch?.trim()) return NextResponse.json({ error: 'Branch name required' }, { status: 400 });
        const { stdout } = await run(['branch', '-D', branch.trim()]);
        return NextResponse.json({ ok: true, output: stdout.trim() });
      }

      case 'merge-branch': {
        if (!branch?.trim()) return NextResponse.json({ error: 'Branch name required' }, { status: 400 });
        const { stdout, stderr } = await run(['merge', branch.trim(), '--no-edit']);
        return NextResponse.json({ ok: true, output: (stdout + '\n' + stderr).trim() });
      }

      default:
        return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
    }
  } catch (err) {
    const raw = err instanceof Error ? err.message : String(err);
    // Surface stderr embedded in the error message for better UX
    const msg = raw.includes('stderr') ? raw : raw.split('\n').slice(0, 5).join('\n');
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

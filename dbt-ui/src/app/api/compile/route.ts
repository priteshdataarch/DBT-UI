import { NextResponse } from 'next/server';
import { execSync, execFile } from 'child_process';
import { accessSync, constants } from 'fs';
import fs from 'fs/promises';
import path from 'path';
import { DBT_ROOT } from '@/lib/files';

// ─── Resolve dbt binary (same logic as dbt/route.ts) ─────────────────────────
function resolveDbtBin(): string {
  if (process.env.DBT_BIN) return process.env.DBT_BIN;
  const candidates = [
    path.join(DBT_ROOT, 'venv', 'bin', 'dbt'),
    path.join(DBT_ROOT, 'vdbt', 'bin', 'dbt'),
    path.join(DBT_ROOT, '.venv', 'bin', 'dbt'),
  ];
  for (const c of candidates) {
    try { accessSync(c, constants.X_OK); return c; } catch { /* next */ }
  }
  try {
    const w = execSync('which dbt', { encoding: 'utf-8' }).trim();
    if (w) return w;
  } catch { /* not in PATH */ }
  return path.join(DBT_ROOT, 'venv', 'bin', 'dbt');
}

const DBT_BIN = resolveDbtBin();

// ─── Helpers ─────────────────────────────────────────────────────────────────

function modelNameFromPath(filePath: string): string {
  return path.basename(filePath, '.sql');
}

/** Recursively find first file matching name under dir */
async function findFile(dir: string, name: string): Promise<string | null> {
  let entries;
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return null;
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      const found = await findFile(full, name);
      if (found) return found;
    } else if (entry.isFile() && entry.name === name) {
      return full;
    }
  }
  return null;
}

function runCompile(modelName: string): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    execFile(
      DBT_BIN,
      ['compile', '--select', modelName, '--no-use-colors'],
      { cwd: DBT_ROOT, env: { ...process.env, PYTHONUNBUFFERED: '1' }, timeout: 60_000 },
      (err, stdout, stderr) => {
        if (err && !stdout && !stderr) {
          reject(new Error(err.message));
        } else {
          resolve({ stdout, stderr });
        }
      }
    );
  });
}

// ─── POST /api/compile ────────────────────────────────────────────────────────
export async function POST(request: Request) {
  const { filePath } = (await request.json()) as { filePath: string };

  if (!filePath?.endsWith('.sql')) {
    return NextResponse.json({ error: 'Only .sql files can be compiled' }, { status: 400 });
  }

  const modelName = modelNameFromPath(filePath);

  // Run dbt compile -s <model>
  try {
    const { stdout, stderr } = await runCompile(modelName);
    const combined = stdout + stderr;

    // Check for explicit dbt error in output
    if (/\d+ of \d+ ERROR/.test(combined) || /Compilation Error/.test(combined)) {
      // Extract the error message from dbt output
      const lines = combined.split('\n');
      const errorIdx = lines.findIndex((l) => /ERROR|Compilation Error/i.test(l));
      const errorMsg = lines.slice(errorIdx, errorIdx + 10).join('\n').trim();
      return NextResponse.json({ error: errorMsg || 'dbt compile failed' }, { status: 422 });
    }
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'dbt compile failed' },
      { status: 500 }
    );
  }

  // Find the compiled file
  const compiledDir = path.join(DBT_ROOT, 'target', 'compiled');
  const fileName = `${modelName}.sql`;
  const compiledPath = await findFile(compiledDir, fileName);

  if (!compiledPath) {
    return NextResponse.json(
      { error: `Compiled file not found under target/compiled/. Make sure model "${modelName}" exists and dbt compile succeeded.` },
      { status: 404 }
    );
  }

  const sql = await fs.readFile(compiledPath, 'utf-8');
  const relativePath = path.relative(DBT_ROOT, compiledPath);

  return NextResponse.json({ sql: sql.trim(), compiledPath: relativePath, modelName });
}

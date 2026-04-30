import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs/promises';
import path from 'path';

const DBT_ROOT = process.env.DBT_PROJECT_ROOT
  ? path.resolve(process.env.DBT_PROJECT_ROOT)
  : path.resolve(process.cwd(), '..');

const RUNS_FILE = path.join(DBT_ROOT, 'dbt-ui', '.runs.json');
const MAX_RUNS  = 100;

export interface RunEntry {
  id: string;
  command: string;       // full label e.g. "dbt run --select f_score"
  target: string;        // dev / prod
  startedAt: string;     // ISO timestamp
  durationMs: number;
  exitCode: number;
  status: 'success' | 'failed' | 'cancelled';
  summary: string;       // last meaningful output line
  lines?: OutputLine[];  // captured output (optional, written on save)
}

interface OutputLine {
  text: string;
  lineType: string;
}

async function readRuns(): Promise<RunEntry[]> {
  try {
    const raw = await fs.readFile(RUNS_FILE, 'utf-8');
    return JSON.parse(raw) as RunEntry[];
  } catch {
    return [];
  }
}

async function writeRuns(runs: RunEntry[]): Promise<void> {
  await fs.mkdir(path.dirname(RUNS_FILE), { recursive: true });
  await fs.writeFile(RUNS_FILE, JSON.stringify(runs.slice(0, MAX_RUNS), null, 2), 'utf-8');
}

// GET /api/runs — return stored run history
export async function GET(): Promise<NextResponse> {
  const runs = await readRuns();
  return NextResponse.json(runs);
}

// POST /api/runs — append a new run entry
export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const entry = await req.json() as RunEntry;
    if (!entry.id || !entry.command) {
      return NextResponse.json({ error: 'Invalid run entry' }, { status: 400 });
    }
    const prev = await readRuns();
    // Deduplicate by id (in case of retries)
    const next = [entry, ...prev.filter(r => r.id !== entry.id)];
    await writeRuns(next);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

// DELETE /api/runs — clear all history
export async function DELETE(): Promise<NextResponse> {
  try {
    await writeRuns([]);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

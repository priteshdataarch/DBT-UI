import { NextResponse } from 'next/server';
import fs from 'fs/promises';
import path from 'path';
import { DBT_ROOT } from '@/lib/fileSystem';

export type FreshnessStatus = 'pass' | 'warn' | 'error' | 'runtime error' | 'skipped';

export interface FreshnessRow {
  uniqueId: string;
  sourceName: string;
  tableName: string;
  status: FreshnessStatus;
  maxLoadedAt: string | null;
  snapshottedAt: string | null;
  agoSeconds: number | null;
  warnAfter: string | null;
  errorAfter: string | null;
  executionMs: number;
}

export interface FreshnessResponse {
  results: FreshnessRow[];
  generatedAt: string | null;
  elapsedSec: number;
  summary: { pass: number; warn: number; error: number; total: number };
}

function formatCriteria(c: { count?: number; period?: string } | undefined): string | null {
  if (!c || c.count == null) return null;
  return `${c.count} ${c.period ?? 'hour'}${c.count !== 1 ? 's' : ''}`;
}

export async function GET() {
  const sourcesPath = path.join(DBT_ROOT, 'target', 'sources.json');

  try {
    await fs.access(sourcesPath);
  } catch {
    return NextResponse.json(
      { error: 'No freshness results found. Run "dbt source freshness" first to generate target/sources.json.' },
      { status: 404 }
    );
  }

  let raw: Record<string, unknown>;
  try {
    raw = JSON.parse(await fs.readFile(sourcesPath, 'utf-8'));
  } catch {
    return NextResponse.json({ error: 'Failed to parse target/sources.json' }, { status: 500 });
  }

  const metadata = raw.metadata as Record<string, unknown> | undefined;
  const generatedAt = metadata?.generated_at ? String(metadata.generated_at) : null;
  const elapsedSec  = Number(raw.elapsed_time ?? 0);

  const rawResults = (raw.results as Array<Record<string, unknown>>) ?? [];

  const results: FreshnessRow[] = rawResults.map((r) => {
    const uid = String(r.unique_id ?? '');
    const parts = uid.split('.');
    // uid format: source.<project>.<source_name>.<table_name>
    const sourceName = parts[2] ?? '';
    const tableName  = parts[3] ?? '';

    const criteria = r.criteria as Record<string, { count?: number; period?: string }> | undefined;

    return {
      uniqueId:    uid,
      sourceName,
      tableName,
      status:      (String(r.status ?? 'error').toLowerCase()) as FreshnessStatus,
      maxLoadedAt: r.max_loaded_at  ? String(r.max_loaded_at)  : null,
      snapshottedAt: r.snapshotted_at ? String(r.snapshotted_at) : null,
      agoSeconds:  r.max_loaded_at_time_ago_in_s != null ? Number(r.max_loaded_at_time_ago_in_s) : null,
      warnAfter:   formatCriteria(criteria?.warn_after),
      errorAfter:  formatCriteria(criteria?.error_after),
      executionMs: Math.round(Number(r.execution_time ?? 0) * 1000),
    };
  });

  results.sort((a, b) => {
    const order: Record<string, number> = { 'runtime error': 0, error: 1, warn: 2, skipped: 3, pass: 4 };
    return (order[a.status] ?? 9) - (order[b.status] ?? 9);
  });

  const summary = results.reduce(
    (acc, r) => {
      if (r.status === 'pass')  acc.pass++;
      else if (r.status === 'warn') acc.warn++;
      else acc.error++;
      acc.total++;
      return acc;
    },
    { pass: 0, warn: 0, error: 0, total: 0 }
  );

  return NextResponse.json({ results, generatedAt, elapsedSec, summary } satisfies FreshnessResponse);
}

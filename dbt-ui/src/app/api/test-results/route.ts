import { NextResponse } from 'next/server';
import fs from 'fs/promises';
import path from 'path';
import { DBT_ROOT } from '@/lib/fileSystem';

// ─── Types ────────────────────────────────────────────────────────────────────

export type TestStatus = 'pass' | 'fail' | 'error' | 'warn' | 'skipped';

export interface TestResultRow {
  uniqueId: string;
  testType: string;
  model: string;
  column: string;
  status: TestStatus;
  executionMs: number;
  failures: number;
  message: string;
}

export interface TestResultsResponse {
  results: TestResultRow[];
  summary: { pass: number; fail: number; error: number; warn: number; skipped: number; total: number };
  generatedAt: string | null;
  elapsedSec: number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function safeStatus(s: string | undefined): TestStatus {
  const v = (s ?? '').toLowerCase();
  if (v === 'pass' || v === 'success') return 'pass';
  if (v === 'fail' || v === 'failure') return 'fail';
  if (v === 'error') return 'error';
  if (v === 'warn' || v === 'warning') return 'warn';
  if (v === 'skipped' || v === 'skip') return 'skipped';
  return 'error';
}

/**
 * Parse test_metadata from manifest node to get a readable test type label.
 * e.g. { name: "not_null" } → "not_null"
 * e.g. { name: "accepted_values", kwargs: { values: [...] } } → "accepted_values"
 */
function parseTestType(node: Record<string, unknown>): string {
  const meta = node.test_metadata as Record<string, unknown> | undefined;
  if (meta?.name) return String(meta.name);
  // Fallback: derive from unique_id   test.<proj>.<not_null_model_col>.<hash>
  const uid = String(node.unique_id ?? '');
  const parts = uid.split('.');
  if (parts.length >= 3) {
    const namePart = parts[2];
    const knownPrefixes = ['not_null', 'unique', 'accepted_values', 'relationships', 'dbt_utils'];
    for (const p of knownPrefixes) {
      if (namePart.startsWith(p)) return p;
    }
    return namePart.split('_')[0] ?? namePart;
  }
  return 'test';
}

function parseModel(node: Record<string, unknown>): string {
  // Try attached_node first (dbt 1.6+)
  if (node.attached_node) return String(node.attached_node).split('.').pop() ?? '';
  // Try refs
  const refs = node.refs as unknown[];
  if (Array.isArray(refs) && refs.length > 0) {
    const ref = refs[0];
    if (typeof ref === 'string') return ref;
    if (typeof ref === 'object' && ref !== null) {
      const r = ref as Record<string, string>;
      return r.name ?? r[0] ?? '';
    }
  }
  // Fallback: parse from unique_id test.project.testname.hash → try to strip test type
  const uid = String(node.unique_id ?? '');
  const namePart = uid.split('.')[2] ?? '';
  const meta = node.test_metadata as Record<string, unknown> | undefined;
  const testType = meta?.name ? String(meta.name) : '';
  const col = (node.column_name ?? meta?.kwargs ? String((meta?.kwargs as Record<string,unknown>)?.column_name ?? '') : '') as string;
  if (testType) {
    // Remove testType prefix and column suffix
    let remaining = namePart.replace(new RegExp(`^${testType}_`), '');
    if (col) remaining = remaining.replace(new RegExp(`_${col}$`), '');
    return remaining || namePart;
  }
  return namePart;
}

function parseColumn(node: Record<string, unknown>): string {
  if (node.column_name) return String(node.column_name);
  const meta = node.test_metadata as Record<string, unknown> | undefined;
  if (meta?.kwargs) {
    const kwargs = meta.kwargs as Record<string, unknown>;
    if (kwargs.column_name) return String(kwargs.column_name);
    if (kwargs.field) return String(kwargs.field);
  }
  return '';
}

// ─── GET /api/test-results ────────────────────────────────────────────────────

export async function GET() {
  const runResultsPath = path.join(DBT_ROOT, 'target', 'run_results.json');
  const manifestPath   = path.join(DBT_ROOT, 'target', 'manifest.json');

  // Check run_results.json exists
  try {
    await fs.access(runResultsPath);
  } catch {
    return NextResponse.json(
      { error: 'No test results found. Run "dbt test" first to generate target/run_results.json.' },
      { status: 404 }
    );
  }

  let runResults: Record<string, unknown>;
  try {
    const raw = await fs.readFile(runResultsPath, 'utf-8');
    runResults = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: 'Failed to parse run_results.json' }, { status: 500 });
  }

  // Load manifest for richer test metadata (optional — degrade gracefully)
  let manifestNodes: Record<string, Record<string, unknown>> = {};
  try {
    const raw = await fs.readFile(manifestPath, 'utf-8');
    const manifest = JSON.parse(raw) as { nodes?: Record<string, unknown> };
    manifestNodes = (manifest.nodes ?? {}) as Record<string, Record<string, unknown>>;
  } catch { /* proceed without manifest */ }

  const rawResults = (runResults.results as Array<Record<string, unknown>>) ?? [];
  const elapsedSec = Number(runResults.elapsed_time ?? 0);
  const metadata = runResults.metadata as Record<string, unknown> | undefined;
  const generatedAt = metadata?.generated_at ? String(metadata.generated_at) : null;

  const results: TestResultRow[] = [];

  for (const r of rawResults) {
    const uid = String(r.unique_id ?? '');
    // Only include test nodes
    if (!uid.startsWith('test.') && !uid.startsWith('unit_test.')) continue;

    const manifestNode = manifestNodes[uid] ?? {};

    const status  = safeStatus(String(r.status ?? 'error'));
    const execMs  = Math.round(Number(r.execution_time ?? 0) * 1000);
    const failures = Number(r.failures ?? 0);
    const message  = String(r.message ?? '');

    // Prefer manifest metadata for model/column/type
    const nodeForMeta = Object.keys(manifestNode).length > 0 ? manifestNode : r;
    const testType = parseTestType(nodeForMeta);
    const model    = parseModel(nodeForMeta);
    const column   = parseColumn(nodeForMeta);

    results.push({ uniqueId: uid, testType, model, column, status, executionMs: execMs, failures, message });
  }

  // Sort: failed/error first, then warn, then pass
  const order: Record<TestStatus, number> = { error: 0, fail: 1, warn: 2, skipped: 3, pass: 4 };
  results.sort((a, b) => (order[a.status] ?? 9) - (order[b.status] ?? 9) || a.model.localeCompare(b.model));

  const summary = results.reduce(
    (acc, r) => { acc[r.status] = (acc[r.status] ?? 0) + 1; acc.total++; return acc; },
    { pass: 0, fail: 0, error: 0, warn: 0, skipped: 0, total: 0 }
  );

  return NextResponse.json({ results, summary, generatedAt, elapsedSec } satisfies TestResultsResponse);
}

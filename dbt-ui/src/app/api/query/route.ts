import { NextResponse } from 'next/server';
import {
  AthenaClient,
  StartQueryExecutionCommand,
  GetQueryExecutionCommand,
  GetQueryResultsCommand,
  QueryExecutionState,
} from '@aws-sdk/client-athena';
import { buildAllSchemaChunks } from '@/lib/dbt';

const S3_STAGING_DIR = 's3://mursion-dbt-athena/staging_dir/preview/';
const ATHENA_DATABASE = 'dbt';
const ATHENA_REGION = process.env.AWS_DEFAULT_REGION ?? 'us-west-2';
const POLL_INTERVAL_MS = 1200;
const MAX_POLLS = 90; // ~108 seconds

interface QueryRequest {
  sql: string;
  limit?: number; // undefined = honour whatever user wrote (no auto-append); explicit value = append if no LIMIT present
}

function normalizeLimit(limit?: number): number | null {
  // undefined → no auto-limit; let the user's SQL run as-is (safety cap still applied below)
  if (limit === undefined || limit === null) return null;
  if (Number.isNaN(limit)) return 100;
  return Math.max(1, Math.min(5000, limit));
}

function ensureSelectableSql(sql: string, limit: number | null): string {
  const trimmed = sql.trim().replace(/;+\s*$/, '');
  const lowered = trimmed.toLowerCase();
  const isSelectLike = lowered.startsWith('select') || lowered.startsWith('with');
  if (!isSelectLike) {
    throw new Error('Only SELECT queries are supported in SQL Editor.');
  }
  const hasLimit = /\blimit\s+\d+\b/i.test(trimmed);
  // Only append LIMIT if user hasn't written one AND a limit was requested
  if (!hasLimit && limit !== null) {
    return `${trimmed}\nLIMIT ${limit}`;
  }
  return trimmed;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function makeClient(): AthenaClient | null {
  const accessKeyId = process.env.AWS_ACCESS_KEY_ID;
  const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;
  if (!accessKeyId || !secretAccessKey) return null;
  return new AthenaClient({
    region: ATHENA_REGION,
    credentials: { accessKeyId, secretAccessKey },
  });
}

// GET /api/query — returns available tables and database info
export async function GET() {
  try {
    const chunks = await buildAllSchemaChunks();
    const tables = [...new Set(chunks.map((c) => c.name))].sort();
    return NextResponse.json({
      database: ATHENA_DATABASE,
      region: ATHENA_REGION,
      tables,
    });
  } catch {
    return NextResponse.json({ database: ATHENA_DATABASE, region: ATHENA_REGION, tables: [] });
  }
}

// POST /api/query — execute SQL against Athena
export async function POST(request: Request) {
  const { sql, limit } = (await request.json()) as QueryRequest;

  if (!sql?.trim()) {
    return NextResponse.json({ error: 'SQL is required' }, { status: 400 });
  }

  const client = makeClient();
  if (!client) {
    return NextResponse.json(
      { error: 'AWS credentials not configured. Add AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY to .env.local' },
      { status: 500 }
    );
  }

  const rowLimit = normalizeLimit(limit);
  let executableSql = '';
  try {
    executableSql = ensureSelectableSql(sql, rowLimit);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Invalid SQL' },
      { status: 400 }
    );
  }

  const startedAt = Date.now();
  let queryExecutionId: string;
  try {
    const startRes = await client.send(
      new StartQueryExecutionCommand({
        QueryString: executableSql,
        QueryExecutionContext: { Database: ATHENA_DATABASE },
        ResultConfiguration: { OutputLocation: S3_STAGING_DIR },
      })
    );
    queryExecutionId = startRes.QueryExecutionId!;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: `Failed to start Athena query: ${msg}` }, { status: 500 });
  }

  let state: QueryExecutionState | undefined;
  let dataScannedInBytes = 0;
  let submissionDateTime: string | undefined;
  let completionDateTime: string | undefined;

  for (let i = 0; i < MAX_POLLS; i++) {
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
    const statusRes = await client.send(
      new GetQueryExecutionCommand({ QueryExecutionId: queryExecutionId })
    );
    const exec = statusRes.QueryExecution;
    state = exec?.Status?.State;
    dataScannedInBytes = exec?.Statistics?.DataScannedInBytes ?? 0;
    submissionDateTime = exec?.Status?.SubmissionDateTime?.toISOString();
    completionDateTime = exec?.Status?.CompletionDateTime?.toISOString();

    if (state === QueryExecutionState.SUCCEEDED) break;
    if (state === QueryExecutionState.FAILED || state === QueryExecutionState.CANCELLED) {
      const reason = exec?.Status?.StateChangeReason ?? 'Query failed';
      return NextResponse.json(
        {
          error: reason,
          queryExecutionId,
          state,
          submissionDateTime,
          completionDateTime,
          dataScannedInBytes,
          dataScanned: formatBytes(dataScannedInBytes),
          executionMs: Date.now() - startedAt,
        },
        { status: 500 }
      );
    }
  }

  if (state !== QueryExecutionState.SUCCEEDED) {
    return NextResponse.json(
      { error: 'Query timed out while waiting for Athena result.' },
      { status: 504 }
    );
  }

  try {
    const resultsRes = await client.send(
      new GetQueryResultsCommand({ QueryExecutionId: queryExecutionId })
    );

    const allRows = resultsRes.ResultSet?.Rows ?? [];
    if (allRows.length === 0) {
      return NextResponse.json({
        columns: [],
        rows: [],
        rowCount: 0,
        executionMs: Date.now() - startedAt,
        queryExecutionId,
        state: 'SUCCEEDED',
        dataScannedInBytes,
        dataScanned: formatBytes(dataScannedInBytes),
        submissionDateTime,
        completionDateTime,
        appliedLimit: rowLimit,
      });
    }

    const columns = allRows[0].Data?.map((d) => d.VarCharValue ?? '') ?? [];
    const rows = allRows.slice(1).map((row) => {
      const obj: Record<string, string> = {};
      row.Data?.forEach((cell, idx) => {
        obj[columns[idx]] = cell.VarCharValue ?? '';
      });
      return obj;
    });

    return NextResponse.json({
      columns,
      rows,
      rowCount: rows.length,
      executionMs: Date.now() - startedAt,
      queryExecutionId,
      state: 'SUCCEEDED',
      dataScannedInBytes,
      dataScanned: formatBytes(dataScannedInBytes),
      submissionDateTime,
      completionDateTime,
      appliedLimit: rowLimit,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: `Failed to fetch results: ${msg}` }, { status: 500 });
  }
}

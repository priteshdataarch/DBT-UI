import { NextResponse } from 'next/server';
import {
  AthenaClient,
  StartQueryExecutionCommand,
  GetQueryExecutionCommand,
  GetQueryResultsCommand,
  QueryExecutionState,
} from '@aws-sdk/client-athena';
import path from 'path';
import fs from 'fs/promises';

const DBT_ROOT = process.env.DBT_PROJECT_ROOT
  ? path.resolve(process.env.DBT_PROJECT_ROOT)
  : path.resolve(process.cwd(), '..');

const S3_STAGING_DIR = 's3://mursion-dbt-athena/staging_dir/preview/';
const ATHENA_DATABASE = 'dbt';
const ATHENA_REGION = process.env.AWS_DEFAULT_REGION ?? 'us-west-2';
const POLL_INTERVAL_MS = 1500;
const MAX_POLLS = 60; // 90s max

/** Resolve the compiled SQL absolute path for a given relative path. */
async function resolveCompiledSql(filePath: string): Promise<string | null> {
  // Already a compiled file
  if (filePath.startsWith('target/compiled/')) {
    return path.join(DBT_ROOT, filePath);
  }

  // Source model file: models/marts/f_score.sql  →  target/compiled/<proj>/models/marts/f_score.sql
  if (filePath.startsWith('models/') && filePath.endsWith('.sql')) {
    const modelRelPath = filePath.slice('models/'.length); // e.g. marts/f_score.sql
    const compiledBase = path.join(DBT_ROOT, 'target', 'compiled');
    try {
      const projects = await fs.readdir(compiledBase);
      for (const proj of projects) {
        const candidate = path.join(compiledBase, proj, 'models', modelRelPath);
        try {
          await fs.access(candidate);
          return candidate;
        } catch { /* not found in this project dir */ }
      }
    } catch { /* target/compiled doesn't exist */ }
  }

  return null;
}

export async function POST(request: Request) {
  const { filePath } = await request.json() as { filePath: string };

  if (!filePath) {
    return NextResponse.json({ error: 'filePath is required' }, { status: 400 });
  }

  // Validate AWS credentials
  const accessKeyId = process.env.AWS_ACCESS_KEY_ID;
  const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;
  if (!accessKeyId || !secretAccessKey) {
    return NextResponse.json(
      { error: 'AWS credentials not configured. Add AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY to .env.local' },
      { status: 500 }
    );
  }

  // Resolve compiled SQL
  const compiledPath = await resolveCompiledSql(filePath);
  if (!compiledPath) {
    return NextResponse.json(
      { error: 'Compiled SQL not found. Run "dbt compile" first.' },
      { status: 404 }
    );
  }

  let sqlContent: string;
  try {
    sqlContent = await fs.readFile(compiledPath, 'utf-8');
  } catch {
    return NextResponse.json({ error: 'Could not read compiled SQL file.' }, { status: 500 });
  }

  const previewSql = `SELECT * FROM (\n${sqlContent.trim()}\n) _preview LIMIT 100`;

  // Submit query to Athena
  const client = new AthenaClient({
    region: ATHENA_REGION,
    credentials: { accessKeyId, secretAccessKey },
  });

  let queryExecutionId: string;
  try {
    const startRes = await client.send(
      new StartQueryExecutionCommand({
        QueryString: previewSql,
        QueryExecutionContext: { Database: ATHENA_DATABASE },
        ResultConfiguration: { OutputLocation: S3_STAGING_DIR },
      })
    );
    queryExecutionId = startRes.QueryExecutionId!;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: `Failed to start Athena query: ${msg}` }, { status: 500 });
  }

  // Poll until SUCCEEDED / FAILED / CANCELLED
  for (let i = 0; i < MAX_POLLS; i++) {
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
    const statusRes = await client.send(
      new GetQueryExecutionCommand({ QueryExecutionId: queryExecutionId })
    );
    const state = statusRes.QueryExecution?.Status?.State;

    if (state === QueryExecutionState.SUCCEEDED) break;

    if (
      state === QueryExecutionState.FAILED ||
      state === QueryExecutionState.CANCELLED
    ) {
      const reason = statusRes.QueryExecution?.Status?.StateChangeReason ?? 'Query failed';
      return NextResponse.json({ error: reason }, { status: 500 });
    }
  }

  // Fetch results
  let resultsRes;
  try {
    resultsRes = await client.send(
      new GetQueryResultsCommand({ QueryExecutionId: queryExecutionId })
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: `Failed to fetch results: ${msg}` }, { status: 500 });
  }

  const allRows = resultsRes.ResultSet?.Rows ?? [];
  if (allRows.length === 0) {
    return NextResponse.json({ columns: [], rows: [] });
  }

  const columns = allRows[0].Data?.map((d) => d.VarCharValue ?? '') ?? [];
  const rows = allRows.slice(1).map((row) => {
    const obj: Record<string, string> = {};
    row.Data?.forEach((cell, i) => {
      obj[columns[i]] = cell.VarCharValue ?? '';
    });
    return obj;
  });

  return NextResponse.json({ columns, rows });
}

import { NextResponse } from 'next/server';
import { loadManifest } from '@/lib/dbt';

export interface ColumnMeta {
  name: string;
  description: string;
  type: string;
}

export interface ModelMeta {
  name: string;
  description: string;
  path: string;
  schema: string;
  database: string;
  materialized: string;
  tags: string[];
  dependsOn: string[];   // upstream model/source names (not full UIDs)
  columns: ColumnMeta[];
}

export interface SourceMeta {
  sourceName: string;
  tableName: string;
  description: string;
  schema: string;
  columns: ColumnMeta[];
}

export interface ManifestMetaResponse {
  models: ModelMeta[];
  sources: SourceMeta[];
}

export async function GET() {
  const manifest = await loadManifest();

  if (!manifest) {
    return NextResponse.json(
      { error: 'manifest.json not found. Run "dbt compile" or "dbt docs generate" first.' },
      { status: 404 }
    );
  }

  // ── Models ──────────────────────────────────────────────────────────────────
  const models: ModelMeta[] = Object.values(manifest.nodes)
    .filter((n) => n.resource_type === 'model')
    .map((n) => {
      // Deduplicate + pretty-print upstream dependencies
      const rawDeps = n.depends_on?.nodes ?? [];
      const dependsOn = [...new Set(
        rawDeps.map((uid) => uid.split('.').pop() ?? uid)
      )];

      // Tags can be at node level or inside config (dbt merges them)
      const nodeTags  = Array.isArray(n.tags)         ? n.tags         : [];
      const cfgTags   = Array.isArray(n.config?.tags) ? n.config!.tags! : [];
      const tags      = [...new Set([...nodeTags, ...cfgTags])];

      return {
        name:         n.name,
        description:  n.description ?? '',
        path:         n.original_file_path ?? '',
        schema:       n.config?.schema ?? n.schema ?? '',
        database:     n.config?.database ?? n.database ?? '',
        materialized: n.config?.materialized ?? 'view',
        tags,
        dependsOn,
        columns: Object.values(n.columns ?? {}).map((c) => ({
          name:        c.name,
          description: c.description ?? '',
          type:        c.data_type ?? '',
        })),
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));

  // ── Sources ─────────────────────────────────────────────────────────────────
  const sources: SourceMeta[] = Object.values(manifest.sources).map((s) => ({
    sourceName:  s.source_name,
    tableName:   s.name,
    description: s.description ?? '',
    schema:      s.schema ?? '',
    columns: Object.values(s.columns ?? {}).map((c) => ({
      name:        c.name,
      description: c.description ?? '',
      type:        c.data_type ?? '',
    })),
  }));

  return NextResponse.json({ models, sources } satisfies ManifestMetaResponse);
}

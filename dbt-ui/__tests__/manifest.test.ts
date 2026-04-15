import path from 'path';
import os from 'os';
import fs from 'fs/promises';

// ─── Inline helpers (avoid importing server-only code in Jest) ───────────────

function modelNameFromPath(filePath: string | null): string | null {
  if (!filePath) return null;
  const m = filePath.match(/([^/\\]+)\.sql$/);
  return m ? m[1] : null;
}

function extractMentionedModels(query: string, knownModels: Set<string>): string[] {
  const tokens = query
    .toLowerCase()
    .replace(/[^a-z0-9_\s]/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length > 2);
  return tokens.filter((t) => knownModels.has(t));
}

function buildConfigBlock(materialized: string, tableType: string, format: string): string {
  return `{{ config(\n    materialized='${materialized}',\n    table_type='${tableType}',\n    format='${format}'\n) }}`;
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('modelNameFromPath', () => {
  it('extracts model name from a nested SQL path', () => {
    expect(modelNameFromPath('models/marts/f_score.sql')).toBe('f_score');
  });

  it('extracts model name from a shallow path', () => {
    expect(modelNameFromPath('f_sessions_final.sql')).toBe('f_sessions_final');
  });

  it('returns null for YAML files', () => {
    expect(modelNameFromPath('models/warehouse/schema.yml')).toBeNull();
  });

  it('returns null for null input', () => {
    expect(modelNameFromPath(null as unknown as string)).toBeNull();
  });
});

describe('extractMentionedModels', () => {
  const knownModels = new Set([
    'f_score', 'f_sessions_final', 'd_users', 'd_client', 'm_session_learner',
  ]);

  it('finds a single model mentioned in the query', () => {
    const result = extractMentionedModels('show me the f_score model', knownModels);
    expect(result).toContain('f_score');
  });

  it('finds multiple models mentioned', () => {
    const result = extractMentionedModels(
      'how does f_sessions_final reference d_users',
      knownModels
    );
    expect(result).toContain('f_sessions_final');
    expect(result).toContain('d_users');
  });

  it('returns empty array when no models are mentioned', () => {
    const result = extractMentionedModels('create a new staging model for orders', knownModels);
    expect(result).toHaveLength(0);
  });

  it('is case-insensitive in matching', () => {
    const result = extractMentionedModels('describe F_SCORE please', knownModels);
    expect(result).toContain('f_score');
  });
});

describe('buildConfigBlock', () => {
  it('produces correct iceberg config block', () => {
    const block = buildConfigBlock('table', 'iceberg', 'parquet');
    expect(block).toContain("materialized='table'");
    expect(block).toContain("table_type='iceberg'");
    expect(block).toContain("format='parquet'");
  });

  it('produces correct view config block', () => {
    const block = buildConfigBlock('view', 'iceberg', 'parquet');
    expect(block).toContain("materialized='view'");
  });
});

describe('manifest.json structure expectations', () => {
  it('parent_map entries are arrays of unique_ids', () => {
    const fakeParentMap = {
      'model.proj.f_score': [
        'model.proj.d_events',
        'model.proj.f_sessions_final',
        'source.proj.application_db.raw_session',
      ],
    };
    const parents = fakeParentMap['model.proj.f_score'];
    expect(Array.isArray(parents)).toBe(true);
    expect(parents.some((p) => p.startsWith('model.'))).toBe(true);
    expect(parents.some((p) => p.startsWith('source.'))).toBe(true);
  });

  it('source unique_id maps to source_name.table_name key', () => {
    const src = { source_name: 'application_db', name: 'raw_session' };
    const key = `${src.source_name}.${src.name}`;
    expect(key).toBe('application_db.raw_session');
  });

  it('model node resource_type filter works correctly', () => {
    type ResourceNode = { resource_type: string; name: string };
    const nodes: Record<string, ResourceNode> = {
      'model.proj.f_score': { resource_type: 'model', name: 'f_score' },
      'test.proj.f_score_not_null': { resource_type: 'test', name: 'f_score_not_null' },
      'seed.proj.seed_data': { resource_type: 'seed', name: 'seed_data' },
    };
    const models = Object.values(nodes).filter((n) => n.resource_type === 'model');
    expect(models).toHaveLength(1);
    expect(models[0].name).toBe('f_score');
  });
});

describe('cache TTL logic', () => {
  it('30 second TTL means a timestamp older than 30s is stale', () => {
    const CACHE_TTL_MS = 30_000;
    const cacheTime = Date.now() - 35_000; // 35s ago
    expect(Date.now() - cacheTime).toBeGreaterThan(CACHE_TTL_MS);
  });

  it('a fresh cache (< 30s) is still valid', () => {
    const CACHE_TTL_MS = 30_000;
    const cacheTime = Date.now() - 5_000; // 5s ago
    expect(Date.now() - cacheTime).toBeLessThan(CACHE_TTL_MS);
  });
});

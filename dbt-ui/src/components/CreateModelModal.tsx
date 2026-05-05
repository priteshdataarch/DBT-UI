'use client';

import { useState, useEffect } from 'react';
import { X, Sparkles, Loader2, RefreshCw, ChevronDown, ChevronRight, Plus } from 'lucide-react';
import { filePutPayload } from '@/lib/clientFileLockToken';

interface Props {
  onClose: () => void;
  onCreated: (path: string) => void;
  /** When set, model body is built from this SQL (Query editor) plus the dbt config below. */
  initialQuerySql?: string | null;
  /** Stacking order when opened on top of another full-screen panel (e.g. SQL editor). */
  overlayZClass?: string;
}

// ── Config options ────────────────────────────────────────────────────────

const MATERIALIZATIONS = ['table', 'view', 'incremental', 'ephemeral'];
const FORMATS = ['parquet', 'orc', 'avro', 'json', 'textfile'];
const COMPRESSIONS = ['snappy', 'gzip', 'zstd', 'lz4', 'none'];
const TABLE_TYPES = ['iceberg', 'hive'];

interface ModelConfig {
  materialized: string;         // MANDATORY
  // optional storage (table/incremental only)
  table_type: string;
  format: string;
  write_compression: string;
  // optional docs
  persist_docs_relation: boolean;
  persist_docs_columns: boolean;
  // optional meta
  owner: string;
  pii: boolean;
}

// Tracks which optional groups the user has enabled
interface OptionalGroups {
  storage: boolean;    // format / table_type / write_compression
  persistDocs: boolean;
  meta: boolean;
}

const DEFAULT_CONFIG: ModelConfig = {
  materialized: 'table',
  table_type: 'iceberg',
  format: 'parquet',
  write_compression: 'snappy',
  persist_docs_relation: true,
  persist_docs_columns: true,
  owner: 'analytics',
  pii: false,
};

function suggestConfig(folderPath: string): Partial<ModelConfig> {
  const name = folderPath.split('/').pop() ?? '';
  if (name === 'staging' || name === 'intermediate') {
    return { materialized: 'view' };
  }
  return { materialized: 'table' };
}

// ── YAML / SQL generators ─────────────────────────────────────────────────

function generateConfigBlock(cfg: ModelConfig, _isSameFolder: boolean, groups: OptionalGroups): string {
  const indent = '    ';
  const needsStorage = cfg.materialized !== 'view' && cfg.materialized !== 'ephemeral';
  const lines = [
    `{{ config(`,
    `${indent}materialized = '${cfg.materialized}',`,
  ];
  if (groups.storage && needsStorage) {
    lines.push(`${indent}table_type = '${cfg.table_type}',`);
    lines.push(`${indent}format = '${cfg.format}',`);
    lines.push(`${indent}write_compression = '${cfg.write_compression}',`);
  }
  if (groups.persistDocs) {
    lines.push(
      `${indent}persist_docs = { "relation": ${cfg.persist_docs_relation}, "columns": ${cfg.persist_docs_columns} },`
    );
  }
  if (groups.meta) {
    lines.push(`${indent}meta = {`);
    lines.push(`${indent}    "owner": "${cfg.owner}",`);
    lines.push(`${indent}    "pii": ${cfg.pii}`);
    lines.push(`${indent}},`);
  }
  // Remove trailing comma from last property line
  const lastPropIdx = lines.length - 1;
  lines[lastPropIdx] = lines[lastPropIdx].replace(/,\s*$/, '');
  lines.push(`) }}`);
  return lines.join('\n');
}

function generateModelSQL(
  name: string,
  cfg: ModelConfig,
  groups: OptionalGroups,
  refs: string[],
  sourceRef: string
): string {
  const validRefs = refs.filter((r) => r.trim());
  const [srcName, srcTable] = sourceRef ? sourceRef.split('.') : [];
  const configBlock = generateConfigBlock(cfg, false, groups);

  if (validRefs.length > 0) {
    const ctes = validRefs
      .map((r) => `${r.trim()} as (\n    select * from {{ ref('${r.trim()}') }}\n)`)
      .join(',\n\n');
    return `${configBlock}\n\nwith\n${ctes}\n\nselect\n    *\nfrom ${validRefs[0].trim()}\n`;
  }
  if (srcName && srcTable) {
    return `${configBlock}\n\nselect\n    *\nfrom {{ source('${srcName.trim()}', '${srcTable.trim()}') }}\n`;
  }
  return `${configBlock}\n\nselect\n    -- TODO: add your columns\n    *\nfrom {{ source('source_name', 'table_name') }}\n`;
}

/** Place warehouse SQL after the dbt config block — the query is used as-is (no subquery wrapper). */
function buildModelSqlFromQuery(
  rawSql: string,
  cfg: ModelConfig,
  optGroups: OptionalGroups
): string {
  const body = rawSql.trim().replace(/;\s*$/, '');
  const configBlock = generateConfigBlock(cfg, false, optGroups);
  return `${configBlock}\n\n${body}\n`;
}

function generateSchemaEntry(modelName: string): string {
  return (
    `\n  - name: ${modelName}\n` +
    `    description: "TODO: describe ${modelName}"\n` +
    `    columns:\n` +
    `      - name: id\n` +
    `        description: "Primary key"\n` +
    `        tests:\n` +
    `          - unique\n` +
    `          - not_null\n`
  );
}

// ── FileNode ───────────────────────────────────────────────────────────────

interface FileNode {
  name: string;
  type: 'file' | 'directory';
  path: string;
  children?: FileNode[];
}

// ── Select helper ─────────────────────────────────────────────────────────

function Sel({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: string[];
  onChange: (v: string) => void;
}) {
  return (
    <div>
      <label className="block text-[10px] text-[#8b8b8b] mb-1">{label}</label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full bg-[#3c3c3c] border border-[#5a5a5a] focus:border-[#007acc] rounded px-2 py-1.5 text-xs text-[#d4d4d4] outline-none"
      >
        {options.map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
    </div>
  );
}

// ── Main modal ────────────────────────────────────────────────────────────

type FolderMode = 'existing' | 'new';

export default function CreateModelModal({ onClose, onCreated, initialQuerySql = null, overlayZClass = 'z-50' }: Props) {

  // ── Core state ────────────────────────────────────────────────────────
  const [name, setName] = useState('');
  const [folderMode, setFolderMode] = useState<FolderMode>('existing');
  const [folder, setFolder] = useState('');
  const [newFolderPath, setNewFolderPath] = useState('models/');
  const [refs, setRefs] = useState('');
  const [sourceRef, setSourceRef] = useState('');
  const [addToSchema, setAddToSchema] = useState(true);
  const [showConfig, setShowConfig] = useState(false);
  const [cfg, setCfg] = useState<ModelConfig>({ ...DEFAULT_CONFIG });
  /** When non-null, final SQL is derived from this query + cfg (Query editor flow). */
  const [queryBasisSql, setQueryBasisSql] = useState<string | null>(() =>
    initialQuerySql?.trim() ? initialQuerySql.trim() : null
  );
  const [generatedSQL, setGeneratedSQL] = useState('');
  const [generating, setGenerating] = useState(false);
  // Which optional config groups are enabled (all off = use project defaults)
  const [optGroups, setOptGroups] = useState<OptionalGroups>({
    storage: false,
    persistDocs: false,
    meta: false,
  });
  const toggleGroup = (g: keyof OptionalGroups) =>
    setOptGroups((prev) => ({ ...prev, [g]: !prev[g] }));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // ── Dynamic folder list ───────────────────────────────────────────────
  const [folders, setFolders] = useState<string[]>([]);
  const [loadingFolders, setLoadingFolders] = useState(true);

  const fetchFolders = async () => {
    setLoadingFolders(true);
    try {
      const res = await fetch('/api/tree');
      const tree: FileNode = await res.json();
      const modelsNode = tree.children?.find((c) => c.name === 'models');
      const dirs = (modelsNode?.children ?? [])
        .filter((c) => c.type === 'directory')
        .map((c) => c.path);
      setFolders(dirs);
      if (dirs.length > 0 && !folder) {
        setFolder(dirs[0]);
        setCfg((prev) => ({ ...prev, ...suggestConfig(dirs[0]) }));
      }
    } catch { /* ignore */ }
    finally { setLoadingFolders(false); }
  };

  useEffect(() => { fetchFolders(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  useEffect(() => {
    if (queryBasisSql) {
      setGeneratedSQL(buildModelSqlFromQuery(queryBasisSql, cfg, optGroups));
      setShowConfig(true);
    }
  }, [queryBasisSql, cfg, optGroups]);

  const handleFolderChange = (f: string) => {
    setFolder(f);
    setCfg((prev) => ({ ...prev, ...suggestConfig(f) }));
    setGeneratedSQL('');
  };

  const activeFolder = folderMode === 'existing' ? folder : newFolderPath.trim();

  // ── Config helpers ────────────────────────────────────────────────────
  const setField = <K extends keyof ModelConfig>(k: K, v: ModelConfig[K]) =>
    setCfg((prev) => ({ ...prev, [k]: v }));

  const needsStorageConfig = cfg.materialized !== 'view' && cfg.materialized !== 'ephemeral';

  // ── AI generation ─────────────────────────────────────────────────────
  const validate = () => {
    if (!name.trim()) return 'Model name is required';
    if (!/^[a-z_][a-z0-9_]*$/.test(name.trim()))
      return 'Name must use only lowercase letters, numbers, and underscores';
    if (!activeFolder.trim()) return 'Folder path is required';
    return '';
  };

  const generateWithAI = async () => {
    const err = validate();
    if (err) { setError(err); return; }
    setGenerating(true);
    setError('');
    setQueryBasisSql(null);
    setGeneratedSQL('');
    const refsArray = refs.split(',').map((r) => r.trim()).filter(Boolean);
    const [srcName, srcTable] = sourceRef ? sourceRef.split('.') : [];
    const prompt = [
      `Generate a complete dbt SQL model named "${name.trim()}" for the mursion_dbt_athena project.`,
      `Folder: ${activeFolder}`,
      `Materialization: ${cfg.materialized}${optGroups.storage && needsStorageConfig ? `, table_type='${cfg.table_type}', format='${cfg.format}', write_compression='${cfg.write_compression}'` : ''} (AWS Athena).`,
      refsArray.length > 0 ? `Upstream refs: ${refsArray.join(', ')} (use {{ ref('...') }}).` : '',
      srcName && srcTable ? `Upstream source: {{ source('${srcName.trim()}', '${srcTable.trim()}') }}.` : '',
      `Include: config block at top, WITH clause CTEs for each ref, and a well-structured SELECT.`,
      `Follow naming: f_ fact · d_ dimension · m_ mapping · stg_ staging.`,
      `Return ONLY the SQL code block, no explanation.`,
    ].filter(Boolean).join('\n');
    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: [{ role: 'user', content: prompt }], activeFilePath: null, activeFileContent: null }),
      });
      const data = await res.json();
      const sqlMatch = data.message.match(/```sql\n([\s\S]+?)```/);
      if (sqlMatch) {
        setQueryBasisSql(null);
        setGeneratedSQL(sqlMatch[1].trim());
      } else if (data.message.includes('{{ config(')) {
        setQueryBasisSql(null);
        setGeneratedSQL(data.message.trim());
      } else setError(data.message.startsWith('⚠️') ? data.message : 'AI did not return valid SQL. Try adding refs or a source.');
    } catch { setError('AI generation failed. Check OPENAI_API_KEY in .env.local.'); }
    finally { setGenerating(false); }
  };

  const handleCreate = async () => {
    const err = validate();
    if (err) { setError(err); return; }
    setLoading(true);
    setError('');
    const modelName = name.trim();
    const sqlPath = `${activeFolder}/${modelName}.sql`;
    const refsArray = refs.split(',').map((r) => r.trim()).filter(Boolean);
    const sqlContent = queryBasisSql
      ? buildModelSqlFromQuery(queryBasisSql, cfg, optGroups)
      : (generatedSQL || generateModelSQL(modelName, cfg, optGroups, refsArray, sourceRef));
    try {
      const res = await fetch('/api/file', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: sqlPath, content: sqlContent }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to create model');
      }
      if (addToSchema) {
        const schemaPath = `${activeFolder}/schema.yml`;
        const getRes = await fetch(`/api/file?path=${encodeURIComponent(schemaPath)}`);
        if (getRes.ok) {
          const schemaData = (await getRes.json()) as { content: string; mtimeMs?: number };
          const content = schemaData.content;
          const baseMtime =
            typeof schemaData.mtimeMs === 'number' ? schemaData.mtimeMs : undefined;
          await fetch('/api/file', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(
              filePutPayload(
                schemaPath,
                content.trimEnd() + generateSchemaEntry(modelName) + '\n',
                baseMtime
              )
            ),
          });
        } else {
          await fetch('/api/file', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ path: schemaPath, content: `version: 2\n\nmodels:${generateSchemaEntry(modelName)}\n` }) });
        }
      }
      onCreated(sqlPath);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Unknown error');
    } finally { setLoading(false); }
  };

  return (
    <div className={`fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center ${overlayZClass}`}>
      <div className="bg-[#252526] border border-[#3e3e42] rounded-lg w-[600px] max-h-[90vh] overflow-y-auto shadow-2xl">

        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-[#3e3e42] sticky top-0 bg-[#252526] z-10">
          <h2 className="text-sm font-semibold text-[#d4d4d4]">Create New Model</h2>
          <button onClick={onClose} className="text-[#8b8b8b] hover:text-[#d4d4d4] transition-colors"><X size={16} /></button>
        </div>

        <div className="p-4 space-y-4">

          {/* Model name */}
          <div>
            <label className="block text-xs text-[#8b8b8b] mb-1.5">
              Model Name <span className="text-red-400">*</span>
            </label>
            <input
              autoFocus
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                if (!queryBasisSql) setGeneratedSQL('');
              }}
              onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
              placeholder="e.g. f_sessions_daily"
              className="w-full bg-[#3c3c3c] border border-[#5a5a5a] focus:border-[#007acc] rounded px-3 py-2 text-sm text-[#d4d4d4] placeholder-[#5a5a5a] outline-none transition-colors"
            />
            <p className="text-[10px] text-[#5a5a5a] mt-1">f_ fact · d_ dimension · m_ mapping · stg_ staging</p>
          </div>

          {/* ── Folder strategy toggle ── */}
          <div>
            <label className="block text-xs text-[#8b8b8b] mb-2">Folder</label>
            <div className="flex gap-2 mb-2">
              {([
                { id: 'existing', label: 'Existing folder', hint: 'Add to a folder already in the project' },
                { id: 'new', label: 'New folder', hint: 'Create a new subfolder under models/' },
              ] as { id: FolderMode; label: string; hint: string }[]).map(({ id, label, hint }) => (
                <button
                  key={id}
                  onClick={() => setFolderMode(id)}
                  className={`flex-1 px-3 py-2 rounded border text-left transition-colors ${
                    folderMode === id
                      ? 'border-[#007acc] bg-[#007acc]/10 text-[#569cd6]'
                      : 'border-[#3e3e42] bg-[#1e1e1e] text-[#8b8b8b] hover:border-[#5a5a5a]'
                  }`}
                >
                  <div className="text-xs font-medium">{label}</div>
                  <div className="text-[10px] mt-0.5 opacity-70">{hint}</div>
                </button>
              ))}
            </div>

            {folderMode === 'existing' ? (
              <div className="flex items-center gap-2">
                {loadingFolders ? (
                  <div className="flex items-center gap-2 bg-[#3c3c3c] border border-[#5a5a5a] rounded px-3 py-2 h-9 flex-1">
                    <Loader2 size={12} className="animate-spin text-[#8b8b8b]" />
                    <span className="text-xs text-[#5a5a5a]">Loading…</span>
                  </div>
                ) : folders.length > 0 ? (
                  <select
                    value={folder}
                    onChange={(e) => handleFolderChange(e.target.value)}
                    className="flex-1 bg-[#3c3c3c] border border-[#5a5a5a] focus:border-[#007acc] rounded px-3 py-2 text-sm text-[#d4d4d4] outline-none"
                  >
                    {folders.map((f) => <option key={f} value={f}>{f.replace('models/', '')}</option>)}
                  </select>
                ) : (
                  <input
                    value={folder}
                    onChange={(e) => handleFolderChange(e.target.value)}
                    placeholder="models/marts"
                    className="flex-1 bg-[#3c3c3c] border border-[#5a5a5a] focus:border-[#007acc] rounded px-3 py-2 text-sm text-[#d4d4d4] placeholder-[#5a5a5a] outline-none"
                  />
                )}
                <button onClick={fetchFolders} title="Refresh" className="text-[#5a5a5a] hover:text-[#8b8b8b] transition-colors">
                  <RefreshCw size={11} className={loadingFolders ? 'animate-spin' : ''} />
                </button>
              </div>
            ) : (
              <input
                value={newFolderPath}
                onChange={(e) => { setNewFolderPath(e.target.value); setGeneratedSQL(''); }}
                placeholder="models/warehouse"
                className="w-full bg-[#3c3c3c] border border-[#5a5a5a] focus:border-[#007acc] rounded px-3 py-2 text-sm text-[#d4d4d4] placeholder-[#5a5a5a] outline-none"
              />
            )}
          </div>

          {/* ── dbt Config (collapsible) ── */}
          <div className="border border-[#3e3e42] rounded overflow-hidden">
            <button
              onClick={() => setShowConfig((v) => !v)}
              className="flex items-center justify-between w-full px-3 py-2 bg-[#1e1e1e] hover:bg-[#2d2d2d] transition-colors"
            >
              <div className="flex items-center gap-2">
                {showConfig ? <ChevronDown size={12} className="text-[#8b8b8b]" /> : <ChevronRight size={12} className="text-[#8b8b8b]" />}
                <span className="text-xs text-[#8b8b8b]">dbt Config</span>
                <span className="text-[10px] font-mono text-[#5a5a5a]">
                  {cfg.materialized}
                  {optGroups.storage && needsStorageConfig ? ` · ${cfg.format}/${cfg.write_compression}` : ' · defaults'}
                </span>
              </div>
              <span className="text-[10px] text-[#5a5a5a]">{showConfig ? 'collapse' : 'expand'}</span>
            </button>

            {showConfig && (
              <div className="p-3 bg-[#1e1e1e] border-t border-[#3e3e42] space-y-4">

                {/* Materialization — MANDATORY */}
                <div>
                  <div className="flex items-center gap-1.5 mb-1.5">
                    <span className="text-[10px] text-[#f48771] font-semibold">REQUIRED</span>
                    <span className="text-[10px] text-[#8b8b8b]">materialization</span>
                  </div>
                  <Sel label="" value={cfg.materialized}
                    options={MATERIALIZATIONS}
                    onChange={(v) => { setField('materialized', v); if (!queryBasisSql) setGeneratedSQL(''); }} />
                </div>

                {/* Storage — OPTIONAL */}
                {needsStorageConfig && (
                  <div className={`rounded border transition-colors ${optGroups.storage ? 'border-[#007acc]/40 bg-[#007acc]/5' : 'border-[#3e3e42]'}`}>
                    <label className="flex items-center gap-2 px-3 py-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={optGroups.storage}
                        onChange={() => toggleGroup('storage')}
                        className="accent-[#007acc] w-3.5 h-3.5"
                      />
                      <span className="text-xs text-[#d4d4d4] font-medium">Storage config</span>
                      <span className="text-[10px] text-[#5a5a5a] ml-auto">
                        {optGroups.storage ? `${cfg.format} · ${cfg.write_compression} · ${cfg.table_type}` : 'use project defaults'}
                      </span>
                    </label>
                    {optGroups.storage && (
                      <div className="px-3 pb-3 space-y-2 border-t border-[#3e3e42]">
                        <div className="grid grid-cols-3 gap-2 pt-2">
                          <Sel label="table_type" value={cfg.table_type} options={TABLE_TYPES} onChange={(v) => setField('table_type', v)} />
                          <Sel label="format" value={cfg.format} options={FORMATS} onChange={(v) => setField('format', v)} />
                          <Sel label="write_compression" value={cfg.write_compression} options={COMPRESSIONS} onChange={(v) => setField('write_compression', v)} />
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Persist docs — OPTIONAL */}
                <div className={`rounded border transition-colors ${optGroups.persistDocs ? 'border-[#007acc]/40 bg-[#007acc]/5' : 'border-[#3e3e42]'}`}>
                  <label className="flex items-center gap-2 px-3 py-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={optGroups.persistDocs}
                      onChange={() => toggleGroup('persistDocs')}
                      className="accent-[#007acc] w-3.5 h-3.5"
                    />
                    <span className="text-xs text-[#d4d4d4] font-medium">persist_docs</span>
                    <span className="text-[10px] text-[#5a5a5a] ml-auto">
                      {optGroups.persistDocs
                        ? `relation: ${cfg.persist_docs_relation}, columns: ${cfg.persist_docs_columns}`
                        : 'use project defaults'}
                    </span>
                  </label>
                  {optGroups.persistDocs && (
                    <div className="px-3 pb-3 border-t border-[#3e3e42] pt-2 flex gap-6">
                      <label className="flex items-center gap-1.5 cursor-pointer text-xs text-[#8b8b8b]">
                        <input type="checkbox" checked={cfg.persist_docs_relation}
                          onChange={(e) => setField('persist_docs_relation', e.target.checked)}
                          className="accent-[#007acc] w-3 h-3" />
                        relation
                      </label>
                      <label className="flex items-center gap-1.5 cursor-pointer text-xs text-[#8b8b8b]">
                        <input type="checkbox" checked={cfg.persist_docs_columns}
                          onChange={(e) => setField('persist_docs_columns', e.target.checked)}
                          className="accent-[#007acc] w-3 h-3" />
                        columns
                      </label>
                    </div>
                  )}
                </div>

                {/* Meta — OPTIONAL */}
                <div className={`rounded border transition-colors ${optGroups.meta ? 'border-[#007acc]/40 bg-[#007acc]/5' : 'border-[#3e3e42]'}`}>
                  <label className="flex items-center gap-2 px-3 py-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={optGroups.meta}
                      onChange={() => toggleGroup('meta')}
                      className="accent-[#007acc] w-3.5 h-3.5"
                    />
                    <span className="text-xs text-[#d4d4d4] font-medium">meta</span>
                    <span className="text-[10px] text-[#5a5a5a] ml-auto">
                      {optGroups.meta ? `owner: ${cfg.owner}, pii: ${cfg.pii}` : 'use project defaults'}
                    </span>
                  </label>
                  {optGroups.meta && (
                    <div className="px-3 pb-3 border-t border-[#3e3e42] pt-2">
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-[10px] text-[#8b8b8b] mb-1">owner</label>
                          <input value={cfg.owner} onChange={(e) => setField('owner', e.target.value)}
                            placeholder="analytics"
                            className="w-full bg-[#3c3c3c] border border-[#5a5a5a] focus:border-[#007acc] rounded px-2 py-1.5 text-xs text-[#d4d4d4] placeholder-[#5a5a5a] outline-none" />
                        </div>
                        <div className="flex items-end pb-1.5">
                          <label className="flex items-center gap-1.5 cursor-pointer text-xs text-[#8b8b8b]">
                            <input type="checkbox" checked={cfg.pii}
                              onChange={(e) => setField('pii', e.target.checked)}
                              className="accent-[#007acc] w-3 h-3" />
                            pii = true
                          </label>
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {/* Live preview of config block */}
                <div>
                  <p className="text-[10px] text-[#5a5a5a] mb-1">Generated config block preview</p>
                  <pre className="text-[10px] font-mono text-[#8b8b8b] bg-[#111] rounded p-2 overflow-x-auto leading-relaxed">
                    {generateConfigBlock(cfg, false, optGroups)}
                  </pre>
                </div>
              </div>
            )}
          </div>

          {/* Refs */}
          <div>
            <label className="block text-xs text-[#8b8b8b] mb-1.5">
              Upstream refs <span className="text-[#5a5a5a]">(comma-separated model names)</span>
            </label>
            <input value={refs} onChange={(e) => { setRefs(e.target.value); if (!queryBasisSql) setGeneratedSQL(''); }}
              placeholder="e.g. stg_sessions, d_users"
              className="w-full bg-[#3c3c3c] border border-[#5a5a5a] focus:border-[#007acc] rounded px-3 py-2 text-sm text-[#d4d4d4] placeholder-[#5a5a5a] outline-none transition-colors" />
          </div>

          {/* Source ref */}
          <div>
            <label className="block text-xs text-[#8b8b8b] mb-1.5">
              Source reference <span className="text-[#5a5a5a]">(source_name.table_name)</span>
            </label>
            <input value={sourceRef} onChange={(e) => { setSourceRef(e.target.value); if (!queryBasisSql) setGeneratedSQL(''); }}
              placeholder="e.g. application_db.raw_session"
              className="w-full bg-[#3c3c3c] border border-[#5a5a5a] focus:border-[#007acc] rounded px-3 py-2 text-sm text-[#d4d4d4] placeholder-[#5a5a5a] outline-none transition-colors" />
          </div>

          {/* Add to schema */}
          <label className="flex items-center gap-2.5 cursor-pointer">
            <input type="checkbox" checked={addToSchema} onChange={(e) => setAddToSchema(e.target.checked)}
              className="accent-[#007acc] w-3.5 h-3.5" />
            <span className="text-xs text-[#8b8b8b]">Add entry to schema.yml</span>
          </label>

          {/* AI SQL preview */}
          {generatedSQL && (
            <div className="rounded-md border border-[#3e3e42] overflow-hidden">
              <div className="flex items-center justify-between px-3 py-1.5 bg-[#2d2d2d]">
                <div className="flex items-center gap-1.5">
                  <Sparkles size={12} className="text-[#007acc]" />
                  <span className="text-[10px] text-[#8b8b8b]">
                    {queryBasisSql ? 'Model SQL (from query editor)' : 'AI-generated SQL preview'}
                  </span>
                </div>
                <button
                  onClick={() => {
                    setGeneratedSQL('');
                    setQueryBasisSql(null);
                  }}
                  className="text-[10px] text-[#5a5a5a] hover:text-[#8b8b8b]"
                >
                  discard
                </button>
              </div>
              <textarea readOnly value={generatedSQL} rows={10}
                className="w-full bg-[#1a1a1a] text-xs text-[#d4d4d4] font-mono p-3 outline-none resize-none leading-relaxed" />
            </div>
          )}

          {error && (
            <p className="text-xs text-red-400 bg-red-400/10 border border-red-400/20 rounded px-3 py-2">{error}</p>
          )}

          {/* Preview path */}
          {name.trim() && activeFolder && (
            <p className="text-[10px] text-[#5a5a5a] font-mono bg-[#1e1e1e] rounded px-2 py-1">
              → {activeFolder}/{name.trim()}.sql
              {generatedSQL && (
                <span className="ml-2 text-[#007acc]">
                  {queryBasisSql ? '✓ from query' : '✓ AI SQL ready'}
                </span>
              )}
            </p>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-between gap-2 px-4 py-3 border-t border-[#3e3e42] sticky bottom-0 bg-[#252526]">
          <button onClick={generateWithAI} disabled={generating || !name.trim()}
            title={!name.trim() ? 'Enter a model name first' : 'Generate SQL using project context'}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs border border-[#007acc] text-[#007acc] hover:bg-[#007acc]/10 disabled:opacity-40 disabled:cursor-not-allowed rounded transition-colors">
            {generating ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />}
            {generating ? 'Generating…' : generatedSQL ? 'Regenerate with AI' : 'Generate with AI'}
          </button>
          <div className="flex gap-2">
            <button onClick={onClose}
              className="px-3 py-1.5 text-xs text-[#8b8b8b] hover:text-[#d4d4d4] border border-[#5a5a5a] rounded hover:bg-[#3e3e42] transition-colors">
              Cancel
            </button>
            <button onClick={handleCreate} disabled={loading}
              className="px-4 py-1.5 text-xs bg-[#0e639c] hover:bg-[#1177bb] disabled:opacity-50 disabled:cursor-not-allowed rounded text-white font-medium transition-colors">
              {loading
                ? 'Creating…'
                : queryBasisSql
                  ? 'Create model'
                  : generatedSQL
                    ? 'Create with AI SQL'
                    : 'Create Model'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

'use client';

import { useState, useEffect } from 'react';
import { X, Sparkles, Loader2, RefreshCw } from 'lucide-react';

interface Props {
  onClose: () => void;
  onCreated: (path: string) => void;
}

const MATERIALIZATIONS = ['table', 'view', 'incremental', 'ephemeral'];

// Suggest a default materialization based on folder naming conventions
function defaultMaterialization(folderPath: string): string {
  const name = folderPath.split('/').pop() ?? '';
  if (name === 'staging' || name === 'intermediate') return 'view';
  return 'table';
}

function generateModelSQL(
  name: string,
  materialization: string,
  refs: string[],
  sourceRef: string
): string {
  const validRefs = refs.filter((r) => r.trim());
  const [srcName, srcTable] = sourceRef ? sourceRef.split('.') : [];

  const configBlock = `{{ config(
    materialized='${materialization}',
    table_type='iceberg',
    format='parquet'
) }}

`;

  if (validRefs.length > 0) {
    const ctes = validRefs
      .map((r) => `${r.trim()} as (\n    select * from {{ ref('${r.trim()}') }}\n)`)
      .join(',\n\n');
    return `${configBlock}with\n${ctes}\n\nselect\n    *\nfrom ${validRefs[0].trim()}\n`;
  }

  if (srcName && srcTable) {
    return `${configBlock}select\n    *\nfrom {{ source('${srcName.trim()}', '${srcTable.trim()}') }}\n`;
  }

  return `${configBlock}select\n    -- TODO: add your columns\n    *\nfrom {{ source('source_name', 'table_name') }}\n`;
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

interface FileNode {
  name: string;
  type: 'file' | 'directory';
  path: string;
  children?: FileNode[];
}

export default function CreateModelModal({ onClose, onCreated }: Props) {
  // ── Form state ────────────────────────────────────────────────────────────
  const [name, setName] = useState('');
  const [folder, setFolder] = useState('');
  const [materialization, setMaterialization] = useState('table');
  const [refs, setRefs] = useState('');
  const [sourceRef, setSourceRef] = useState('');
  const [addToSchema, setAddToSchema] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // ── Dynamic folder list ───────────────────────────────────────────────────
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
        .map((c) => c.path); // e.g. "models/marts"

      setFolders(dirs);

      // Set initial selection to first available folder
      if (dirs.length > 0 && !folder) {
        setFolder(dirs[0]);
        setMaterialization(defaultMaterialization(dirs[0]));
      }
    } catch {
      // ignore — user can still type a custom path
    } finally {
      setLoadingFolders(false);
    }
  };

  useEffect(() => {
    fetchFolders();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleFolderChange = (f: string) => {
    setFolder(f);
    setMaterialization(defaultMaterialization(f));
    setGeneratedSQL('');
  };

  // ── AI generation state ───────────────────────────────────────────────────
  const [generatedSQL, setGeneratedSQL] = useState('');
  const [generating, setGenerating] = useState(false);

  const validate = () => {
    if (!name.trim()) return 'Model name is required';
    if (!/^[a-z_][a-z0-9_]*$/.test(name.trim()))
      return 'Name must use only lowercase letters, numbers, and underscores';
    if (!folder.trim()) return 'Please select a folder';
    return '';
  };

  const generateWithAI = async () => {
    const err = validate();
    if (err) { setError(err); return; }

    setGenerating(true);
    setError('');
    setGeneratedSQL('');

    const refsArray = refs.split(',').map((r) => r.trim()).filter(Boolean);
    const [srcName, srcTable] = sourceRef ? sourceRef.split('.') : [];

    const prompt = [
      `Generate a complete dbt SQL model named "${name.trim()}" for the mursion_dbt_athena project.`,
      `Folder: ${folder}`,
      `Materialization: ${materialization} with table_type='iceberg', format='parquet' (AWS Athena).`,
      refsArray.length > 0
        ? `Upstream refs: ${refsArray.join(', ')} (use {{ ref('...') }}).`
        : '',
      srcName && srcTable
        ? `Upstream source: {{ source('${srcName.trim()}', '${srcTable.trim()}') }}.`
        : '',
      `Include: config block at top, WITH clause CTEs for each ref, and a well-structured SELECT.`,
      `Follow naming: f_ fact · d_ dimension · m_ mapping · stg_ staging.`,
      `Return ONLY the SQL code block, no explanation.`,
    ]
      .filter(Boolean)
      .join('\n');

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [{ role: 'user', content: prompt }],
          activeFilePath: null,
          activeFileContent: null,
        }),
      });
      const data = await res.json();
      const sqlMatch = data.message.match(/```sql\n([\s\S]+?)```/);
      if (sqlMatch) {
        setGeneratedSQL(sqlMatch[1].trim());
      } else if (data.message.includes('{{ config(')) {
        setGeneratedSQL(data.message.trim());
      } else {
        setError(
          data.message.startsWith('⚠️')
            ? data.message
            : 'AI did not return valid SQL. Try adding refs or a source reference.'
        );
      }
    } catch {
      setError('AI generation failed. Check OPENAI_API_KEY in .env.local.');
    } finally {
      setGenerating(false);
    }
  };

  const handleCreate = async () => {
    const err = validate();
    if (err) { setError(err); return; }

    setLoading(true);
    setError('');

    const modelName = name.trim();
    const sqlPath = `${folder}/${modelName}.sql`;
    const refsArray = refs.split(',').map((r) => r.trim()).filter(Boolean);
    const sqlContent =
      generatedSQL || generateModelSQL(modelName, materialization, refsArray, sourceRef);

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
        const schemaPath = `${folder}/schema.yml`;
        const getRes = await fetch(`/api/file?path=${encodeURIComponent(schemaPath)}`);
        if (getRes.ok) {
          const { content } = await getRes.json();
          await fetch('/api/file', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              path: schemaPath,
              content: content.trimEnd() + generateSchemaEntry(modelName) + '\n',
            }),
          });
        } else {
          await fetch('/api/file', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              path: schemaPath,
              content: `version: 2\n\nmodels:${generateSchemaEntry(modelName)}\n`,
            }),
          });
        }
      }

      onCreated(sqlPath);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50">
      <div className="bg-[#252526] border border-[#3e3e42] rounded-lg w-[520px] max-h-[90vh] overflow-y-auto shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-[#3e3e42] sticky top-0 bg-[#252526] z-10">
          <h2 className="text-sm font-semibold text-[#d4d4d4]">Create New Model</h2>
          <button onClick={onClose} className="text-[#8b8b8b] hover:text-[#d4d4d4] transition-colors">
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        <div className="p-4 space-y-4">
          {/* Name */}
          <div>
            <label className="block text-xs text-[#8b8b8b] mb-1.5">
              Model Name <span className="text-red-400">*</span>
            </label>
            <input
              autoFocus
              value={name}
              onChange={(e) => { setName(e.target.value); setGeneratedSQL(''); }}
              onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
              placeholder="e.g. f_sessions_daily"
              className="w-full bg-[#3c3c3c] border border-[#5a5a5a] focus:border-[#007acc] rounded px-3 py-2 text-sm text-[#d4d4d4] placeholder-[#5a5a5a] outline-none transition-colors"
            />
            <p className="text-[10px] text-[#5a5a5a] mt-1">
              f_ fact · d_ dimension · m_ mapping · stg_ staging
            </p>
          </div>

          {/* Folder + Materialization */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs text-[#8b8b8b]">
                  Folder <span className="text-red-400">*</span>
                </label>
                <button
                  onClick={fetchFolders}
                  title="Refresh folders from project"
                  className="text-[#5a5a5a] hover:text-[#8b8b8b] transition-colors"
                >
                  <RefreshCw size={11} className={loadingFolders ? 'animate-spin' : ''} />
                </button>
              </div>
              {loadingFolders ? (
                <div className="flex items-center gap-2 bg-[#3c3c3c] border border-[#5a5a5a] rounded px-3 py-2 h-9">
                  <Loader2 size={12} className="animate-spin text-[#8b8b8b]" />
                  <span className="text-xs text-[#5a5a5a]">Loading…</span>
                </div>
              ) : folders.length > 0 ? (
                <select
                  value={folder}
                  onChange={(e) => handleFolderChange(e.target.value)}
                  className="w-full bg-[#3c3c3c] border border-[#5a5a5a] focus:border-[#007acc] rounded px-3 py-2 text-sm text-[#d4d4d4] outline-none"
                >
                  {folders.map((f) => (
                    <option key={f} value={f}>
                      {f.replace('models/', '')}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  value={folder}
                  onChange={(e) => handleFolderChange(e.target.value)}
                  placeholder="models/marts"
                  className="w-full bg-[#3c3c3c] border border-[#5a5a5a] focus:border-[#007acc] rounded px-3 py-2 text-sm text-[#d4d4d4] placeholder-[#5a5a5a] outline-none transition-colors"
                />
              )}
            </div>

            <div>
              <label className="block text-xs text-[#8b8b8b] mb-1.5">Materialization</label>
              <select
                value={materialization}
                onChange={(e) => { setMaterialization(e.target.value); setGeneratedSQL(''); }}
                className="w-full bg-[#3c3c3c] border border-[#5a5a5a] focus:border-[#007acc] rounded px-3 py-2 text-sm text-[#d4d4d4] outline-none"
              >
                {MATERIALIZATIONS.map((m) => (
                  <option key={m} value={m}>{m}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Refs */}
          <div>
            <label className="block text-xs text-[#8b8b8b] mb-1.5">
              Upstream refs{' '}
              <span className="text-[#5a5a5a]">(comma-separated model names)</span>
            </label>
            <input
              value={refs}
              onChange={(e) => { setRefs(e.target.value); setGeneratedSQL(''); }}
              placeholder="e.g. stg_sessions, d_users"
              className="w-full bg-[#3c3c3c] border border-[#5a5a5a] focus:border-[#007acc] rounded px-3 py-2 text-sm text-[#d4d4d4] placeholder-[#5a5a5a] outline-none transition-colors"
            />
          </div>

          {/* Source ref */}
          <div>
            <label className="block text-xs text-[#8b8b8b] mb-1.5">
              Source reference{' '}
              <span className="text-[#5a5a5a]">(source_name.table_name)</span>
            </label>
            <input
              value={sourceRef}
              onChange={(e) => { setSourceRef(e.target.value); setGeneratedSQL(''); }}
              placeholder="e.g. application_db.raw_session"
              className="w-full bg-[#3c3c3c] border border-[#5a5a5a] focus:border-[#007acc] rounded px-3 py-2 text-sm text-[#d4d4d4] placeholder-[#5a5a5a] outline-none transition-colors"
            />
          </div>

          {/* Add to schema */}
          <label className="flex items-center gap-2.5 cursor-pointer">
            <input
              type="checkbox"
              checked={addToSchema}
              onChange={(e) => setAddToSchema(e.target.checked)}
              className="accent-[#007acc] w-3.5 h-3.5"
            />
            <span className="text-xs text-[#8b8b8b]">Add entry to schema.yml</span>
          </label>

          {/* AI-generated SQL preview */}
          {generatedSQL && (
            <div className="rounded-md border border-[#3e3e42] overflow-hidden">
              <div className="flex items-center justify-between px-3 py-1.5 bg-[#2d2d2d]">
                <div className="flex items-center gap-1.5">
                  <Sparkles size={12} className="text-[#007acc]" />
                  <span className="text-[10px] text-[#8b8b8b]">AI-generated SQL preview</span>
                </div>
                <button
                  onClick={() => setGeneratedSQL('')}
                  className="text-[10px] text-[#5a5a5a] hover:text-[#8b8b8b]"
                >
                  discard
                </button>
              </div>
              <textarea
                readOnly
                value={generatedSQL}
                rows={10}
                className="w-full bg-[#1a1a1a] text-xs text-[#d4d4d4] font-mono p-3 outline-none resize-none leading-relaxed"
              />
            </div>
          )}

          {error && (
            <p className="text-xs text-red-400 bg-red-400/10 border border-red-400/20 rounded px-3 py-2">
              {error}
            </p>
          )}

          {/* Preview path */}
          {name.trim() && folder && (
            <p className="text-[10px] text-[#5a5a5a] font-mono bg-[#1e1e1e] rounded px-2 py-1">
              → {folder}/{name.trim()}.sql
              {generatedSQL && <span className="ml-2 text-[#007acc]">✓ AI SQL ready</span>}
            </p>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-between gap-2 px-4 py-3 border-t border-[#3e3e42] sticky bottom-0 bg-[#252526]">
          <button
            onClick={generateWithAI}
            disabled={generating || !name.trim()}
            title={!name.trim() ? 'Enter a model name first' : 'Generate SQL using project context'}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs border border-[#007acc] text-[#007acc] hover:bg-[#007acc]/10 disabled:opacity-40 disabled:cursor-not-allowed rounded transition-colors"
          >
            {generating ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />}
            {generating ? 'Generating…' : generatedSQL ? 'Regenerate with AI' : 'Generate with AI'}
          </button>

          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="px-3 py-1.5 text-xs text-[#8b8b8b] hover:text-[#d4d4d4] border border-[#5a5a5a] rounded hover:bg-[#3e3e42] transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleCreate}
              disabled={loading}
              className="px-4 py-1.5 text-xs bg-[#0e639c] hover:bg-[#1177bb] disabled:opacity-50 disabled:cursor-not-allowed rounded text-white font-medium transition-colors"
            >
              {loading ? 'Creating…' : generatedSQL ? 'Create with AI SQL' : 'Create Model'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

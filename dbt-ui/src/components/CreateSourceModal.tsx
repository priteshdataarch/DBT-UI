'use client';

import { useState } from 'react';
import { X, Plus, Trash2 } from 'lucide-react';

interface Props {
  onClose: () => void;
  onCreated: () => void;
}

interface TableRow {
  name: string;
  description: string;
}

// Match the exact format of the existing sources.yaml:
//   - no quotes on descriptions
//   - blank line between every table entry
//   - 6-space indent for "- name:", 8-space for "description:"
function formatTableEntry(t: TableRow): string {
  const desc = t.description.trim() || `${t.name.trim()} data from production`;
  return `      - name: ${t.name.trim()}\n        description: ${desc}`;
}

function generateSourceYaml(
  sourceName: string,
  catalog: string,
  schema: string,
  tables: TableRow[]
): string {
  const validTables = tables.filter((t) => t.name.trim());
  const tableBlock = validTables.map(formatTableEntry).join('\n\n');

  return `version: 2

sources:
  - name: ${sourceName}
    catalog: ${catalog || 'AwsDataCatalog'}
    schema: ${schema}
    tables:

${tableBlock}
`;
}

// Append new table entries to an existing sources.yaml, preserving all prior content.
// Matches the blank-line-between-entries style of the existing file.
function appendTablesToExisting(existing: string, tables: TableRow[]): string {
  const validTables = tables.filter((t) => t.name.trim());
  if (validTables.length === 0) return existing;

  const newEntries = validTables.map(formatTableEntry).join('\n\n');
  // Trim trailing whitespace then add a blank line before each new entry group
  return existing.trimEnd() + '\n\n' + newEntries + '\n';
}

export default function CreateSourceModal({ onClose, onCreated }: Props) {
  const [sourceName, setSourceName] = useState('');
  const [catalog, setCatalog] = useState('AwsDataCatalog');
  const [schema, setSchema] = useState('');
  const [tables, setTables] = useState<TableRow[]>([{ name: '', description: '' }]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const addTable = () => setTables((prev) => [...prev, { name: '', description: '' }]);
  const removeTable = (i: number) => setTables((prev) => prev.filter((_, idx) => idx !== i));
  const updateTable = (i: number, field: keyof TableRow, value: string) =>
    setTables((prev) => prev.map((row, idx) => (idx === i ? { ...row, [field]: value } : row)));

  const handleCreate = async () => {
    if (!sourceName.trim()) { setError('Source name is required'); return; }
    if (!/^[a-z_][a-z0-9_]*$/.test(sourceName.trim())) {
      setError('Source name must use only lowercase letters, numbers, and underscores');
      return;
    }
    if (!schema.trim()) { setError('Schema is required'); return; }
    if (!tables.some((t) => t.name.trim())) {
      setError('At least one table name is required');
      return;
    }

    setLoading(true);
    setError('');

    const filePath = `models/sources/${sourceName.trim()}/sources.yaml`;

    try {
      // Check whether the file already exists
      const existingRes = await fetch(`/api/file?path=${encodeURIComponent(filePath)}`);

      if (existingRes.ok) {
        // ── File exists: append new tables, keep everything else intact ──
        const { content: existing } = await existingRes.json();
        const merged = appendTablesToExisting(existing, tables);

        const putRes = await fetch('/api/file', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ path: filePath, content: merged }),
        });
        if (!putRes.ok) throw new Error('Failed to update existing source file');
      } else {
        // ── File does not exist: create it fresh ──
        const content = generateSourceYaml(sourceName.trim(), catalog, schema.trim(), tables);
        const postRes = await fetch('/api/file', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ path: filePath, content }),
        });
        if (!postRes.ok) {
          const data = await postRes.json();
          throw new Error(data.error || 'Failed to create source file');
        }
      }

      onCreated();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50">
      <div className="bg-[#252526] border border-[#3e3e42] rounded-lg w-[560px] max-h-[90vh] overflow-y-auto shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-[#3e3e42] sticky top-0 bg-[#252526] z-10">
          <h2 className="text-sm font-semibold text-[#d4d4d4]">Create / Update Source</h2>
          <button onClick={onClose} className="text-[#8b8b8b] hover:text-[#d4d4d4] transition-colors">
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        <div className="p-4 space-y-4">
          {/* Source name + catalog */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-[#8b8b8b] mb-1.5">
                Source Name <span className="text-red-400">*</span>
              </label>
              <input
                autoFocus
                value={sourceName}
                onChange={(e) => setSourceName(e.target.value)}
                placeholder="e.g. application_db"
                className="w-full bg-[#3c3c3c] border border-[#5a5a5a] focus:border-[#1e7e34] rounded px-3 py-2 text-sm text-[#d4d4d4] placeholder-[#5a5a5a] outline-none transition-colors"
              />
              <p className="text-[10px] text-[#5a5a5a] mt-1">
                If this source already exists, tables will be appended.
              </p>
            </div>
            <div>
              <label className="block text-xs text-[#8b8b8b] mb-1.5">Catalog</label>
              <input
                value={catalog}
                onChange={(e) => setCatalog(e.target.value)}
                placeholder="AwsDataCatalog"
                className="w-full bg-[#3c3c3c] border border-[#5a5a5a] focus:border-[#1e7e34] rounded px-3 py-2 text-sm text-[#d4d4d4] placeholder-[#5a5a5a] outline-none transition-colors"
              />
            </div>
          </div>

          {/* Schema */}
          <div>
            <label className="block text-xs text-[#8b8b8b] mb-1.5">
              Schema <span className="text-red-400">*</span>
            </label>
            <input
              value={schema}
              onChange={(e) => setSchema(e.target.value)}
              placeholder="e.g. prod-raw"
              className="w-full bg-[#3c3c3c] border border-[#5a5a5a] focus:border-[#1e7e34] rounded px-3 py-2 text-sm text-[#d4d4d4] placeholder-[#5a5a5a] outline-none transition-colors"
            />
          </div>

          {/* Tables */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs text-[#8b8b8b]">
                Tables <span className="text-red-400">*</span>
              </label>
              <button
                onClick={addTable}
                className="flex items-center gap-1 text-xs text-[#4ec9b0] hover:text-[#7ee8d2] transition-colors"
              >
                <Plus size={12} />
                Add Table
              </button>
            </div>

            <div className="space-y-2">
              {tables.map((row, i) => (
                <div key={i} className="flex gap-2 items-center">
                  <input
                    value={row.name}
                    onChange={(e) => updateTable(i, 'name', e.target.value)}
                    placeholder="table_name"
                    className="flex-1 bg-[#3c3c3c] border border-[#5a5a5a] focus:border-[#1e7e34] rounded px-2 py-1.5 text-xs text-[#d4d4d4] placeholder-[#5a5a5a] outline-none transition-colors"
                  />
                  <input
                    value={row.description}
                    onChange={(e) => updateTable(i, 'description', e.target.value)}
                    placeholder="Description (optional)"
                    className="flex-1 bg-[#3c3c3c] border border-[#5a5a5a] focus:border-[#1e7e34] rounded px-2 py-1.5 text-xs text-[#d4d4d4] placeholder-[#5a5a5a] outline-none transition-colors"
                  />
                  {tables.length > 1 && (
                    <button
                      onClick={() => removeTable(i)}
                      className="text-[#5a5a5a] hover:text-red-400 transition-colors shrink-0"
                    >
                      <Trash2 size={13} />
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>

          {error && (
            <p className="text-xs text-red-400 bg-red-400/10 border border-red-400/20 rounded px-3 py-2">
              {error}
            </p>
          )}

          {/* Preview path */}
          {sourceName.trim() && (
            <p className="text-[10px] text-[#5a5a5a] font-mono bg-[#1e1e1e] rounded px-2 py-1">
              → models/sources/{sourceName.trim()}/sources.yaml
            </p>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-2 px-4 py-3 border-t border-[#3e3e42] sticky bottom-0 bg-[#252526]">
          <button
            onClick={onClose}
            className="px-3 py-1.5 text-xs text-[#8b8b8b] hover:text-[#d4d4d4] border border-[#5a5a5a] rounded hover:bg-[#3e3e42] transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleCreate}
            disabled={loading}
            className="px-4 py-1.5 text-xs bg-[#1e7e34] hover:bg-[#28a745] disabled:opacity-50 disabled:cursor-not-allowed rounded text-white font-medium transition-colors"
          >
            {loading ? 'Saving...' : 'Save Source'}
          </button>
        </div>
      </div>
    </div>
  );
}

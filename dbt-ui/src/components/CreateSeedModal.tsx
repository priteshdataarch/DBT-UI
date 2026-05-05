'use client';

import { useState, useEffect } from 'react';
import { X, Plus, Trash2, ChevronDown, ChevronRight, FolderOpen, RefreshCw } from 'lucide-react';
import { filePutPayload } from '@/lib/clientFileLockToken';

interface Props {
  onClose: () => void;
  onCreated: (filePath: string) => void;
}

interface ColumnDef {
  name: string;
  data_type: string;
  description: string;
}

type FolderMode = 'root' | 'new' | 'existing';

// ── CSV / YAML generators ────────────────────────────────────────────────────

function generateCsv(columns: ColumnDef[], rows: string[][]): string {
  const header = columns.map((c) => c.name.trim()).filter(Boolean).join(',');
  if (!header) return '';
  const body = rows
    .filter((r) => r.some((cell) => cell.trim()))
    .map((r) => r.map((cell) => (cell.includes(',') || cell.includes('"') ? `"${cell.replace(/"/g, '""')}"` : cell)).join(','))
    .join('\n');
  return body ? `${header}\n${body}\n` : `${header}\n`;
}

function generateSchemaYaml(seedName: string, columns: ColumnDef[]): string {
  const validCols = columns.filter((c) => c.name.trim());
  const colBlock = validCols
    .map((c) => {
      const lines = [`      - name: ${c.name.trim()}`];
      if (c.data_type.trim()) lines.push(`        data_type: ${c.data_type.trim()}`);
      if (c.description.trim()) lines.push(`        description: "${c.description.trim()}"`);
      return lines.join('\n');
    })
    .join('\n');
  return `version: 2\n\nseeds:\n  - name: ${seedName}\n    columns:\n${colBlock}\n`;
}

function appendSeedToSchemaYaml(existing: string, seedName: string, columns: ColumnDef[]): string {
  const validCols = columns.filter((c) => c.name.trim());
  const colBlock = validCols
    .map((c) => {
      const lines = [`      - name: ${c.name.trim()}`];
      if (c.data_type.trim()) lines.push(`        data_type: ${c.data_type.trim()}`);
      if (c.description.trim()) lines.push(`        description: "${c.description.trim()}"`);
      return lines.join('\n');
    })
    .join('\n');
  const entry = `  - name: ${seedName}\n    columns:\n${colBlock}`;
  return existing.trimEnd() + '\n\n' + entry + '\n';
}

// ── Sub-components ───────────────────────────────────────────────────────────

function ColumnEditor({
  columns,
  onAdd,
  onRemove,
  onUpdate,
}: {
  columns: ColumnDef[];
  onAdd: () => void;
  onRemove: (i: number) => void;
  onUpdate: (i: number, field: keyof ColumnDef, val: string) => void;
}) {
  return (
    <div className="space-y-1.5">
      {columns.length > 0 && (
        <div className="grid grid-cols-[1fr_120px_1fr_20px] gap-1.5 mb-1">
          <span className="text-[10px] text-[#5a5a5a] px-1">Column name</span>
          <span className="text-[10px] text-[#5a5a5a] px-1">Data type</span>
          <span className="text-[10px] text-[#5a5a5a] px-1">Description</span>
          <span />
        </div>
      )}
      {columns.map((col, i) => (
        <div key={i} className="grid grid-cols-[1fr_120px_1fr_20px] gap-1.5 items-center">
          <input
            value={col.name}
            onChange={(e) => onUpdate(i, 'name', e.target.value)}
            placeholder="column_name"
            className="bg-[#1e1e1e] border border-[#5a5a5a] focus:border-[#f6c90e] rounded px-2 py-1 text-[11px] text-[#d4d4d4] placeholder-[#5a5a5a] outline-none"
          />
          <input
            value={col.data_type}
            onChange={(e) => onUpdate(i, 'data_type', e.target.value)}
            placeholder="varchar / int…"
            className="bg-[#1e1e1e] border border-[#5a5a5a] focus:border-[#f6c90e] rounded px-2 py-1 text-[11px] text-[#d4d4d4] placeholder-[#5a5a5a] outline-none"
          />
          <input
            value={col.description}
            onChange={(e) => onUpdate(i, 'description', e.target.value)}
            placeholder="optional description"
            className="bg-[#1e1e1e] border border-[#5a5a5a] focus:border-[#f6c90e] rounded px-2 py-1 text-[11px] text-[#d4d4d4] placeholder-[#5a5a5a] outline-none"
          />
          <button onClick={() => onRemove(i)} className="text-[#5a5a5a] hover:text-red-400 transition-colors">
            <Trash2 size={11} />
          </button>
        </div>
      ))}
      <button
        onClick={onAdd}
        className="flex items-center gap-1 text-[11px] text-[#f6c90e] hover:text-yellow-300 transition-colors"
      >
        <Plus size={11} /> Add Column
      </button>
    </div>
  );
}

function RowEditor({
  columns,
  rows,
  onAddRow,
  onRemoveRow,
  onUpdateCell,
}: {
  columns: ColumnDef[];
  rows: string[][];
  onAddRow: () => void;
  onRemoveRow: (i: number) => void;
  onUpdateCell: (ri: number, ci: number, val: string) => void;
}) {
  const validCols = columns.filter((c) => c.name.trim());
  if (validCols.length === 0) {
    return (
      <p className="text-[11px] text-[#5a5a5a] italic">Define columns above to enter data rows.</p>
    );
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-[11px]">
        <thead>
          <tr>
            {validCols.map((c, ci) => (
              <th
                key={ci}
                className="text-left px-2 py-1 text-[#9cdcfe] font-medium bg-[#1e1e1e] border border-[#3e3e42] whitespace-nowrap"
              >
                {c.name}
              </th>
            ))}
            <th className="w-6 bg-[#1e1e1e] border border-[#3e3e42]" />
          </tr>
        </thead>
        <tbody>
          {rows.map((row, ri) => (
            <tr key={ri}>
              {validCols.map((_, ci) => (
                <td key={ci} className="border border-[#3e3e42] p-0">
                  <input
                    value={row[ci] ?? ''}
                    onChange={(e) => onUpdateCell(ri, ci, e.target.value)}
                    placeholder="value"
                    className="w-full bg-transparent px-2 py-1 text-[#d4d4d4] placeholder-[#3e3e42] outline-none focus:bg-[#2a2d2e] min-w-[80px]"
                  />
                </td>
              ))}
              <td className="border border-[#3e3e42] text-center">
                <button
                  onClick={() => onRemoveRow(ri)}
                  className="text-[#5a5a5a] hover:text-red-400 transition-colors px-1"
                >
                  <Trash2 size={10} />
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <button
        onClick={onAddRow}
        className="mt-2 flex items-center gap-1 text-[11px] text-[#f6c90e] hover:text-yellow-300 transition-colors"
      >
        <Plus size={11} /> Add Row
      </button>
    </div>
  );
}

// ── Main modal ───────────────────────────────────────────────────────────────

export default function CreateSeedModal({ onClose, onCreated }: Props) {
  const [folderMode, setFolderMode] = useState<FolderMode>('root');
  const [newFolder, setNewFolder] = useState('');
  const [existingFolders, setExistingFolders] = useState<string[]>([]);
  const [selectedFolder, setSelectedFolder] = useState('');
  const [foldersLoading, setFoldersLoading] = useState(false);

  const [seedName, setSeedName] = useState('');
  const [columns, setColumns] = useState<ColumnDef[]>([
    { name: '', data_type: '', description: '' },
  ]);
  const [rows, setRows] = useState<string[][]>([['']]);
  const [showRows, setShowRows] = useState(false);
  const [generateSchema, setGenerateSchema] = useState(true);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Fetch existing seeds/ folders when mode = existing
  useEffect(() => {
    if (folderMode === 'existing') {
      setFoldersLoading(true);
      fetch('/api/file?list=seeds')
        .then((r) => r.json())
        .then((data) => {
          setExistingFolders(data.dirs ?? []);
          if ((data.dirs ?? []).length > 0 && !selectedFolder) {
            setSelectedFolder(data.dirs[0]);
          }
        })
        .catch(() => setExistingFolders([]))
        .finally(() => setFoldersLoading(false));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [folderMode]);

  // Keep rows width in sync with columns
  useEffect(() => {
    const validCount = columns.filter((c) => c.name.trim()).length;
    setRows((prev) =>
      prev.map((row) => {
        const padded = [...row];
        while (padded.length < validCount) padded.push('');
        return padded.slice(0, validCount);
      })
    );
  }, [columns]);

  // ── Column helpers ─────────────────────────────────────────────────────
  const addColumn = () => setColumns((p) => [...p, { name: '', data_type: '', description: '' }]);
  const removeColumn = (i: number) => setColumns((p) => p.filter((_, idx) => idx !== i));
  const updateColumn = (i: number, field: keyof ColumnDef, val: string) =>
    setColumns((p) => p.map((c, idx) => (idx === i ? { ...c, [field]: val } : c)));

  // ── Row helpers ────────────────────────────────────────────────────────
  const validColCount = columns.filter((c) => c.name.trim()).length;
  const addRow = () => setRows((p) => [...p, Array(validColCount).fill('')]);
  const removeRow = (i: number) => setRows((p) => p.filter((_, idx) => idx !== i));
  const updateCell = (ri: number, ci: number, val: string) =>
    setRows((p) => p.map((row, idx) => (idx === ri ? row.map((cell, cIdx) => (cIdx === ci ? val : cell)) : row)));

  // ── Derived path ───────────────────────────────────────────────────────
  const folder = folderMode === 'root' ? '' : folderMode === 'new' ? newFolder.trim() : selectedFolder;
  const csvPath = seedName.trim()
    ? folder
      ? `seeds/${folder}/${seedName.trim()}.csv`
      : `seeds/${seedName.trim()}.csv`
    : null;
  const schemaPath = folder ? `seeds/${folder}/schema.yml` : `seeds/schema.yml`;

  // ── Submit ─────────────────────────────────────────────────────────────
  const handleCreate = async () => {
    setError('');
    if (folderMode === 'new' && !newFolder.trim()) { setError('Subfolder name is required'); return; }
    if (folderMode === 'existing' && !selectedFolder) { setError('Select a folder'); return; }
    if (!seedName.trim()) { setError('Seed name is required'); return; }
    if (!/^[a-z_][a-z0-9_]*$/.test(seedName.trim())) {
      setError('Seed name must use only lowercase letters, numbers, and underscores');
      return;
    }
    if (!columns.some((c) => c.name.trim())) {
      setError('At least one column is required');
      return;
    }

    setLoading(true);
    try {
      const csvContent = generateCsv(columns, rows);
      const csvRes = await fetch('/api/file', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: csvPath, content: csvContent }),
      });
      if (!csvRes.ok) {
        const d = await csvRes.json();
        throw new Error(d.error || 'Failed to create CSV file');
      }

      if (generateSchema && schemaPath) {
        const existingRes = await fetch(`/api/file?path=${encodeURIComponent(schemaPath)}`);
        if (existingRes.ok) {
          const existingData = (await existingRes.json()) as { content: string; mtimeMs?: number };
          const existing = existingData.content;
          const baseMtime =
            typeof existingData.mtimeMs === 'number' ? existingData.mtimeMs : undefined;
          const merged = appendSeedToSchemaYaml(existing, seedName.trim(), columns);
          await fetch('/api/file', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(filePutPayload(schemaPath, merged, baseMtime)),
          });
        } else {
          const yamlContent = generateSchemaYaml(seedName.trim(), columns);
          await fetch('/api/file', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ path: schemaPath, content: yamlContent }),
          });
        }
      }

      onCreated(csvPath!);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50">
      <div className="bg-[#252526] border border-[#3e3e42] rounded-lg w-[720px] max-h-[90vh] overflow-y-auto shadow-2xl">

        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-[#3e3e42] sticky top-0 bg-[#252526] z-10">
          <div>
            <h2 className="text-sm font-semibold text-[#d4d4d4]">Create Seed</h2>
            <p className="text-[10px] text-[#6e6e6e] mt-0.5">CSV file loaded into the warehouse by <span className="font-mono">dbt seed</span></p>
          </div>
          <button onClick={onClose} className="text-[#8b8b8b] hover:text-[#d4d4d4] transition-colors">
            <X size={16} />
          </button>
        </div>

        <div className="p-4 space-y-5">

          {/* ── Folder strategy ── */}
          <div>
            <label className="block text-xs text-[#8b8b8b] mb-2">Folder</label>
            <div className="grid grid-cols-3 gap-2 mb-3">
              {([
                { id: 'root' as FolderMode, label: 'seeds/ root', hint: 'Place directly in seeds/' },
                { id: 'new' as FolderMode, label: 'New subfolder', hint: 'Create a new folder under seeds/' },
                { id: 'existing' as FolderMode, label: 'Existing subfolder', hint: 'Use a folder that already exists' },
              ]).map(({ id, label, hint }) => (
                <button
                  key={id}
                  onClick={() => setFolderMode(id)}
                  className={`px-3 py-2.5 rounded border text-left transition-colors ${
                    folderMode === id
                      ? 'border-[#f6c90e] bg-[#f6c90e]/10 text-[#f6c90e]'
                      : 'border-[#3e3e42] bg-[#1e1e1e] text-[#8b8b8b] hover:border-[#5a5a5a]'
                  }`}
                >
                  <div className="text-xs font-medium">{label}</div>
                  <div className="text-[10px] mt-0.5 opacity-70">{hint}</div>
                </button>
              ))}
            </div>

            {folderMode === 'root' && (
              <p className="text-[11px] text-[#6e6e6e] bg-[#1e1e1e] border border-[#3e3e42] rounded px-3 py-2 font-mono">
                seeds/{seedName.trim() || '<seed_name>'}.csv
              </p>
            )}

            {folderMode === 'new' && (
              <input
                autoFocus
                value={newFolder}
                onChange={(e) => setNewFolder(e.target.value)}
                placeholder="e.g. reference_data"
                className="w-full bg-[#3c3c3c] border border-[#5a5a5a] focus:border-[#f6c90e] rounded px-3 py-2 text-sm text-[#d4d4d4] placeholder-[#5a5a5a] outline-none"
              />
            )}

            {folderMode === 'existing' && (
              <div className="flex items-center gap-2">
                <FolderOpen size={13} className="text-[#8b8b8b] shrink-0" />
                {foldersLoading && <RefreshCw size={11} className="text-[#5a5a5a] animate-spin" />}
                {!foldersLoading && existingFolders.length === 0 ? (
                  <p className="text-[11px] text-[#f48771] bg-[#f48771]/10 border border-[#f48771]/20 rounded px-2 py-1.5 flex-1">
                    No subfolders found under <span className="font-mono">seeds/</span>. Use &quot;seeds/ root&quot; or create a new subfolder.
                  </p>
                ) : (
                  <select
                    value={selectedFolder}
                    onChange={(e) => setSelectedFolder(e.target.value)}
                    className="flex-1 bg-[#3c3c3c] border border-[#5a5a5a] focus:border-[#f6c90e] rounded px-3 py-2 text-sm text-[#d4d4d4] outline-none"
                  >
                    {existingFolders.map((f) => <option key={f} value={f}>{f}</option>)}
                  </select>
                )}
              </div>
            )}
          </div>

          {/* ── Seed name ── */}
          <div>
            <label className="block text-xs text-[#8b8b8b] mb-1.5">
              Seed Name <span className="text-red-400">*</span>
              <span className="text-[#5a5a5a] ml-1">(becomes the CSV file name and table name)</span>
            </label>
            <div className="flex items-center gap-1.5">
              <input
                value={seedName}
                onChange={(e) => setSeedName(e.target.value)}
                placeholder="e.g. skill_categories"
                className="flex-1 bg-[#3c3c3c] border border-[#5a5a5a] focus:border-[#f6c90e] rounded px-3 py-2 text-sm text-[#d4d4d4] placeholder-[#5a5a5a] outline-none"
              />
              <span className="text-xs text-[#5a5a5a]">.csv</span>
            </div>
          </div>

          {/* ── Columns ── */}
          <div>
            <label className="block text-xs text-[#8b8b8b] mb-2">
              Columns <span className="text-red-400">*</span>
            </label>
            <div className="bg-[#1e1e1e] border border-[#3e3e42] rounded p-3">
              <ColumnEditor
                columns={columns}
                onAdd={addColumn}
                onRemove={removeColumn}
                onUpdate={updateColumn}
              />
            </div>
          </div>

          {/* ── Data rows (collapsible) ── */}
          <div>
            <button
              onClick={() => setShowRows((v) => !v)}
              className="flex items-center gap-1.5 text-xs text-[#8b8b8b] hover:text-[#d4d4d4] transition-colors mb-2"
            >
              {showRows ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
              Data rows
              <span className="text-[#5a5a5a]">
                ({rows.filter((r) => r.some((c) => c.trim())).length} row{rows.filter((r) => r.some((c) => c.trim())).length !== 1 ? 's' : ''} defined)
              </span>
            </button>
            {showRows && (
              <div className="bg-[#1e1e1e] border border-[#3e3e42] rounded p-3">
                <RowEditor
                  columns={columns}
                  rows={rows}
                  onAddRow={addRow}
                  onRemoveRow={removeRow}
                  onUpdateCell={updateCell}
                />
              </div>
            )}
          </div>

          {/* ── Schema.yml toggle ── */}
          <div className="flex items-start gap-3 bg-[#1e1e1e] border border-[#3e3e42] rounded px-3 py-2.5">
            <input
              id="gen-schema"
              type="checkbox"
              checked={generateSchema}
              onChange={(e) => setGenerateSchema(e.target.checked)}
              className="mt-0.5 accent-[#f6c90e]"
            />
            <label htmlFor="gen-schema" className="cursor-pointer">
              <div className="text-xs text-[#d4d4d4]">Generate schema.yml entry</div>
              <div className="text-[10px] text-[#6e6e6e] mt-0.5">
                Creates or appends to <span className="font-mono">{schemaPath ?? 'seeds/{folder}/schema.yml'}</span> with column metadata
              </div>
            </label>
          </div>

          {error && (
            <p className="text-xs text-red-400 bg-red-400/10 border border-red-400/20 rounded px-3 py-2">
              {error}
            </p>
          )}

          {/* Preview paths */}
          {(csvPath || schemaPath) && (
            <div className="space-y-1">
              {csvPath && (
                <p className="text-[10px] text-[#5a5a5a] font-mono bg-[#1e1e1e] rounded px-2 py-1">
                  → {csvPath}
                </p>
              )}
              {generateSchema && schemaPath && (
                <p className="text-[10px] text-[#5a5a5a] font-mono bg-[#1e1e1e] rounded px-2 py-1">
                  → {schemaPath} <span className="text-[#3e3e42]">(created or appended)</span>
                </p>
              )}
            </div>
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
            className="px-4 py-1.5 text-xs bg-[#b8860b] hover:bg-[#f6c90e] hover:text-black disabled:opacity-50 disabled:cursor-not-allowed rounded text-white font-medium transition-colors"
          >
            {loading ? 'Creating…' : 'Create Seed'}
          </button>
        </div>
      </div>
    </div>
  );
}

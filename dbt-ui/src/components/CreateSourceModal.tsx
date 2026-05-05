'use client';

import { useState, useEffect } from 'react';
import { X, Plus, Trash2, ChevronDown, ChevronRight, FolderOpen, RefreshCw } from 'lucide-react';
import { filePutPayload } from '@/lib/clientFileLockToken';

interface Props {
  onClose: () => void;
  onCreated: (filePath: string) => void;
}

interface ColumnRow {
  name: string;
  data_type: string;
  description: string;
}

interface TableRow {
  name: string;
  description: string;
  columns: ColumnRow[];
  showColumns: boolean;
}

type FileMode = 'new-folder' | 'new-file' | 'append';

// ── YAML helpers ────────────────────────────────────────────────────────────

function formatColumnEntry(c: ColumnRow): string {
  const lines = [`        - name: ${c.name.trim()}`];
  if (c.data_type.trim()) lines.push(`          data_type: ${c.data_type.trim()}`);
  if (c.description.trim()) lines.push(`          description: ${c.description.trim()}`);
  return lines.join('\n');
}

function formatTableEntry(t: TableRow): string {
  const desc = t.description.trim() || `${t.name.trim()} data from production`;
  const lines = [
    `      - name: ${t.name.trim()}`,
    `        description: ${desc}`,
  ];
  const validCols = t.columns.filter((c) => c.name.trim());
  if (validCols.length > 0) {
    lines.push(`        columns:`);
    lines.push(validCols.map(formatColumnEntry).join('\n'));
  }
  return lines.join('\n');
}

function generateSourceYaml(
  sourceName: string,
  catalog: string,
  schema: string,
  tables: TableRow[]
): string {
  const validTables = tables.filter((t) => t.name.trim());
  const tableBlock = validTables.map(formatTableEntry).join('\n\n');
  return `version: 2\n\nsources:\n  - name: ${sourceName}\n    catalog: ${catalog || 'AwsDataCatalog'}\n    schema: ${schema}\n    tables:\n\n${tableBlock}\n`;
}

function appendTablesToYaml(existing: string, tables: TableRow[]): string {
  const validTables = tables.filter((t) => t.name.trim());
  if (validTables.length === 0) return existing;
  const newEntries = validTables.map(formatTableEntry).join('\n\n');
  return existing.trimEnd() + '\n\n' + newEntries + '\n';
}

// ── Sub-components ──────────────────────────────────────────────────────────

function ColumnEditor({
  columns,
  onAdd,
  onRemove,
  onUpdate,
}: {
  columns: ColumnRow[];
  onAdd: () => void;
  onRemove: (i: number) => void;
  onUpdate: (i: number, field: keyof ColumnRow, val: string) => void;
}) {
  return (
    <div className="mt-2 ml-4 border-l-2 border-[#3e3e42] pl-3 space-y-2">
      {columns.map((col, ci) => (
        <div key={ci} className="flex gap-1.5 items-center">
          <input
            value={col.name}
            onChange={(e) => onUpdate(ci, 'name', e.target.value)}
            placeholder="column_name"
            className="w-[130px] bg-[#1e1e1e] border border-[#5a5a5a] focus:border-[#007acc] rounded px-2 py-1 text-[11px] text-[#d4d4d4] placeholder-[#5a5a5a] outline-none"
          />
          <input
            value={col.data_type}
            onChange={(e) => onUpdate(ci, 'data_type', e.target.value)}
            placeholder="varchar / bigint…"
            className="w-[120px] bg-[#1e1e1e] border border-[#5a5a5a] focus:border-[#007acc] rounded px-2 py-1 text-[11px] text-[#d4d4d4] placeholder-[#5a5a5a] outline-none"
          />
          <input
            value={col.description}
            onChange={(e) => onUpdate(ci, 'description', e.target.value)}
            placeholder="Description (optional)"
            className="flex-1 bg-[#1e1e1e] border border-[#5a5a5a] focus:border-[#007acc] rounded px-2 py-1 text-[11px] text-[#d4d4d4] placeholder-[#5a5a5a] outline-none"
          />
          <button
            onClick={() => onRemove(ci)}
            className="text-[#5a5a5a] hover:text-red-400 transition-colors shrink-0"
          >
            <Trash2 size={11} />
          </button>
        </div>
      ))}
      <button
        onClick={onAdd}
        className="text-[11px] text-[#569cd6] hover:text-[#79b8ff] flex items-center gap-1 transition-colors"
      >
        <Plus size={11} /> Add Column
      </button>
    </div>
  );
}

function TableList({
  tables,
  onAdd,
  onRemove,
  onUpdateField,
  onToggleCols,
  onAddCol,
  onRemoveCol,
  onUpdateCol,
}: {
  tables: TableRow[];
  onAdd: () => void;
  onRemove: (i: number) => void;
  onUpdateField: (i: number, field: 'name' | 'description', v: string) => void;
  onToggleCols: (i: number) => void;
  onAddCol: (ti: number) => void;
  onRemoveCol: (ti: number, ci: number) => void;
  onUpdateCol: (ti: number, ci: number, field: keyof ColumnRow, v: string) => void;
}) {
  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <label className="text-xs text-[#8b8b8b]">
          Tables <span className="text-red-400">*</span>
        </label>
        <button
          onClick={onAdd}
          className="flex items-center gap-1 text-xs text-[#4ec9b0] hover:text-[#7ee8d2] transition-colors"
        >
          <Plus size={12} /> Add Table
        </button>
      </div>
      <div className="space-y-3">
        {tables.map((row, i) => (
          <div key={i} className="bg-[#1e1e1e] border border-[#3e3e42] rounded p-2.5">
            <div className="flex gap-2 items-center">
              <input
                value={row.name}
                onChange={(e) => onUpdateField(i, 'name', e.target.value)}
                placeholder="table_name"
                className="w-[160px] bg-[#3c3c3c] border border-[#5a5a5a] focus:border-[#1e7e34] rounded px-2 py-1.5 text-xs text-[#d4d4d4] placeholder-[#5a5a5a] outline-none"
              />
              <input
                value={row.description}
                onChange={(e) => onUpdateField(i, 'description', e.target.value)}
                placeholder="Description (optional)"
                className="flex-1 bg-[#3c3c3c] border border-[#5a5a5a] focus:border-[#1e7e34] rounded px-2 py-1.5 text-xs text-[#d4d4d4] placeholder-[#5a5a5a] outline-none"
              />
              <button
                onClick={() => onToggleCols(i)}
                title="Toggle columns"
                className={`flex items-center gap-1 text-[11px] px-2 py-1 rounded border transition-colors ${
                  row.showColumns
                    ? 'border-[#007acc] text-[#569cd6] bg-[#007acc]/10'
                    : 'border-[#3e3e42] text-[#5a5a5a] hover:text-[#8b8b8b]'
                }`}
              >
                {row.showColumns ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
                Cols{row.columns.filter((c) => c.name.trim()).length > 0 && ` (${row.columns.filter((c) => c.name.trim()).length})`}
              </button>
              {tables.length > 1 && (
                <button
                  onClick={() => onRemove(i)}
                  className="text-[#5a5a5a] hover:text-red-400 transition-colors shrink-0"
                >
                  <Trash2 size={13} />
                </button>
              )}
            </div>
            {row.showColumns && (
              <ColumnEditor
                columns={row.columns}
                onAdd={() => onAddCol(i)}
                onRemove={(ci) => onRemoveCol(i, ci)}
                onUpdate={(ci, field, val) => onUpdateCol(i, ci, field, val)}
              />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Main modal ──────────────────────────────────────────────────────────────

export default function CreateSourceModal({ onClose, onCreated }: Props) {
  const [fileMode, setFileMode] = useState<FileMode>('new-folder');

  // new-folder fields
  const [sourceName, setSourceName] = useState('');
  const [folderFileName, setFolderFileName] = useState('');
  const [catalog, setCatalog] = useState('AwsDataCatalog');
  const [schema, setSchema] = useState('');

  // new-file / append: folder + filename / target file
  const [existingFolders, setExistingFolders] = useState<string[]>([]);
  const [selectedFolder, setSelectedFolder] = useState('');
  const [foldersLoading, setFoldersLoading] = useState(false);

  // new-file only
  const [newFileName, setNewFileName] = useState('');
  const [newFileSchema, setNewFileSchema] = useState('');
  const [newFileCatalog, setNewFileCatalog] = useState('AwsDataCatalog');
  const [newFileSourceName, setNewFileSourceName] = useState('');

  // append only
  const [existingFiles, setExistingFiles] = useState<string[]>([]);
  const [selectedFile, setSelectedFile] = useState('');
  const [filesLoading, setFilesLoading] = useState(false);

  const [tables, setTables] = useState<TableRow[]>([
    { name: '', description: '', columns: [], showColumns: false },
  ]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // ── Fetch existing folders when mode switches ─────────────────────────
  useEffect(() => {
    if (fileMode === 'new-file' || fileMode === 'append') {
      setFoldersLoading(true);
      fetch('/api/file?list=models/sources')
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
  }, [fileMode]);

  // ── Fetch files inside selected folder (append mode) ─────────────────
  useEffect(() => {
    if (fileMode === 'append' && selectedFolder) {
      setFilesLoading(true);
      fetch(`/api/file?list=models/sources/${encodeURIComponent(selectedFolder)}`)
        .then((r) => r.json())
        .then((data) => {
          setExistingFiles(data.files ?? []);
          setSelectedFile((data.files ?? [])[0] ?? '');
        })
        .catch(() => setExistingFiles([]))
        .finally(() => setFilesLoading(false));
    }
  }, [fileMode, selectedFolder]);

  // ── Table helpers ─────────────────────────────────────────────────────
  const addTable = () =>
    setTables((p) => [...p, { name: '', description: '', columns: [], showColumns: false }]);
  const removeTable = (i: number) => setTables((p) => p.filter((_, idx) => idx !== i));
  const updateTable = (i: number, field: 'name' | 'description', v: string) =>
    setTables((p) => p.map((r, idx) => (idx === i ? { ...r, [field]: v } : r)));
  const toggleColumns = (i: number) =>
    setTables((p) => p.map((r, idx) => (idx === i ? { ...r, showColumns: !r.showColumns } : r)));
  const addColumn = (ti: number) =>
    setTables((p) =>
      p.map((r, idx) =>
        idx === ti ? { ...r, columns: [...r.columns, { name: '', data_type: '', description: '' }] } : r
      )
    );
  const removeColumn = (ti: number, ci: number) =>
    setTables((p) =>
      p.map((r, idx) =>
        idx === ti ? { ...r, columns: r.columns.filter((_, cIdx) => cIdx !== ci) } : r
      )
    );
  const updateColumn = (ti: number, ci: number, field: keyof ColumnRow, val: string) =>
    setTables((p) =>
      p.map((r, idx) =>
        idx === ti
          ? { ...r, columns: r.columns.map((col, cIdx) => (cIdx === ci ? { ...col, [field]: val } : col)) }
          : r
      )
    );

  // ── Derived preview path ──────────────────────────────────────────────
  const previewPath = (() => {
    if (fileMode === 'new-folder') {
      if (!sourceName.trim()) return null;
      const fn = (folderFileName.trim() || sourceName.trim()).replace(/\.ya?ml$/i, '');
      return `models/sources/${sourceName.trim()}/${fn}.yaml`;
    }
    if (fileMode === 'new-file') {
      const fn = newFileName.trim().replace(/\.ya?ml$/i, '');
      return selectedFolder && fn ? `models/sources/${selectedFolder}/${fn}.yaml` : null;
    }
    if (fileMode === 'append') {
      return selectedFolder && selectedFile
        ? `models/sources/${selectedFolder}/${selectedFile}`
        : null;
    }
    return null;
  })();

  // ── Submit ────────────────────────────────────────────────────────────
  const handleCreate = async () => {
    setError('');

    if (!tables.some((t) => t.name.trim())) {
      setError('At least one table name is required');
      return;
    }

    if (fileMode === 'new-folder') {
      if (!sourceName.trim()) { setError('Source name is required'); return; }
      if (!/^[a-z_][a-z0-9_]*$/.test(sourceName.trim())) {
        setError('Source name must use only lowercase letters, numbers, and underscores');
        return;
      }
      if (!schema.trim()) { setError('Schema is required'); return; }
    }

    if (fileMode === 'new-file') {
      if (!selectedFolder) { setError('Please select an existing folder'); return; }
      if (!newFileName.trim()) { setError('File name is required'); return; }
      if (!newFileSchema.trim()) { setError('Schema is required'); return; }
      if (!newFileSourceName.trim()) { setError('Source name is required'); return; }
    }

    if (fileMode === 'append') {
      if (!selectedFolder) { setError('Please select a folder'); return; }
      if (!selectedFile) { setError('Please select a file to append to'); return; }
    }

    setLoading(true);

    try {
      let savedPath = '';

      if (fileMode === 'new-folder') {
        const fn = (folderFileName.trim() || sourceName.trim()).replace(/\.ya?ml$/i, '');
        savedPath = `models/sources/${sourceName.trim()}/${fn}.yaml`;
        const content = generateSourceYaml(sourceName.trim(), catalog, schema.trim(), tables);
        const res = await fetch('/api/file', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ path: savedPath, content }),
        });
        if (!res.ok) {
          const d = await res.json();
          throw new Error(d.error || 'Failed to create source file');
        }
      }

      else if (fileMode === 'new-file') {
        const fn = newFileName.trim().replace(/\.ya?ml$/i, '');
        savedPath = `models/sources/${selectedFolder}/${fn}.yaml`;
        const content = generateSourceYaml(newFileSourceName.trim(), newFileCatalog, newFileSchema.trim(), tables);
        const res = await fetch('/api/file', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ path: savedPath, content }),
        });
        if (!res.ok) {
          const d = await res.json();
          throw new Error(d.error || 'Failed to create file');
        }
      }

      else if (fileMode === 'append') {
        savedPath = `models/sources/${selectedFolder}/${selectedFile}`;
        const existingRes = await fetch(`/api/file?path=${encodeURIComponent(savedPath)}`);
        if (!existingRes.ok) throw new Error('Could not read existing file');
        const existingData = (await existingRes.json()) as { content: string; mtimeMs?: number };
        const existing = existingData.content;
        const baseMtime =
          typeof existingData.mtimeMs === 'number' ? existingData.mtimeMs : undefined;
        const merged = appendTablesToYaml(existing, tables);
        const putRes = await fetch('/api/file', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(filePutPayload(savedPath, merged, baseMtime)),
        });
        if (!putRes.ok) throw new Error('Failed to update source file');
      }

      onCreated(savedPath);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  };

  const MODES: { id: FileMode; label: string; hint: string }[] = [
    { id: 'new-folder', label: 'New folder + file', hint: 'Creates models/sources/{name}/{name}.yaml' },
    { id: 'new-file',   label: 'New file in folder', hint: 'Add a new .yaml inside an existing folder' },
    { id: 'append',     label: 'Append to existing', hint: 'Add tables to an existing .yaml file' },
  ];

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50">
      <div className="bg-[#252526] border border-[#3e3e42] rounded-lg w-[700px] max-h-[90vh] overflow-y-auto shadow-2xl">

        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-[#3e3e42] sticky top-0 bg-[#252526] z-10">
          <h2 className="text-sm font-semibold text-[#d4d4d4]">Create / Update Source</h2>
          <button onClick={onClose} className="text-[#8b8b8b] hover:text-[#d4d4d4] transition-colors">
            <X size={16} />
          </button>
        </div>

        <div className="p-4 space-y-4">

          {/* ── Strategy toggle ── */}
          <div>
            <label className="block text-xs text-[#8b8b8b] mb-2">File strategy</label>
            <div className="grid grid-cols-3 gap-2">
              {MODES.map(({ id, label, hint }) => (
                <button
                  key={id}
                  onClick={() => setFileMode(id)}
                  className={`px-3 py-2.5 rounded border text-left transition-colors ${
                    fileMode === id
                      ? 'border-[#1e7e34] bg-[#1e7e34]/10 text-[#4ec9b0]'
                      : 'border-[#3e3e42] bg-[#1e1e1e] text-[#8b8b8b] hover:border-[#5a5a5a]'
                  }`}
                >
                  <div className="text-xs font-medium">{label}</div>
                  <div className="text-[10px] mt-0.5 opacity-70">{hint}</div>
                </button>
              ))}
            </div>
          </div>

          {/* ══════════════════════════════════════════════
              MODE: new-folder
          ══════════════════════════════════════════════ */}
          {fileMode === 'new-folder' && (
            <>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-[#8b8b8b] mb-1.5">
                    Folder Name <span className="text-red-400">*</span>
                  </label>
                  <input
                    autoFocus
                    value={sourceName}
                    onChange={(e) => setSourceName(e.target.value)}
                    placeholder="e.g. application_db"
                    className="w-full bg-[#3c3c3c] border border-[#5a5a5a] focus:border-[#1e7e34] rounded px-3 py-2 text-sm text-[#d4d4d4] placeholder-[#5a5a5a] outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs text-[#8b8b8b] mb-1.5">
                    File Name
                    <span className="text-[#5a5a5a] ml-1">(defaults to folder name)</span>
                  </label>
                  <div className="flex items-center gap-1">
                    <input
                      value={folderFileName}
                      onChange={(e) => setFolderFileName(e.target.value)}
                      placeholder={sourceName.trim() || 'same as folder name'}
                      className="flex-1 bg-[#3c3c3c] border border-[#5a5a5a] focus:border-[#1e7e34] rounded px-3 py-2 text-sm text-[#d4d4d4] placeholder-[#5a5a5a] outline-none"
                    />
                    <span className="text-xs text-[#5a5a5a] shrink-0">.yaml</span>
                  </div>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-[#8b8b8b] mb-1.5">
                    Schema <span className="text-red-400">*</span>
                  </label>
                  <input
                    value={schema}
                    onChange={(e) => setSchema(e.target.value)}
                    placeholder="e.g. prod-raw"
                    className="w-full bg-[#3c3c3c] border border-[#5a5a5a] focus:border-[#1e7e34] rounded px-3 py-2 text-sm text-[#d4d4d4] placeholder-[#5a5a5a] outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs text-[#8b8b8b] mb-1.5">Catalog</label>
                  <input
                    value={catalog}
                    onChange={(e) => setCatalog(e.target.value)}
                    placeholder="AwsDataCatalog"
                    className="w-full bg-[#3c3c3c] border border-[#5a5a5a] focus:border-[#1e7e34] rounded px-3 py-2 text-sm text-[#d4d4d4] placeholder-[#5a5a5a] outline-none"
                  />
                </div>
              </div>
            </>
          )}

          {/* ══════════════════════════════════════════════
              MODE: new-file in existing folder
          ══════════════════════════════════════════════ */}
          {fileMode === 'new-file' && (
            <>
              {/* Folder picker */}
              <div>
                <div className="flex items-center gap-2 mb-1.5">
                  <FolderOpen size={12} className="text-[#8b8b8b]" />
                  <label className="text-xs text-[#8b8b8b]">
                    Existing Folder <span className="text-red-400">*</span>
                  </label>
                  {foldersLoading && <RefreshCw size={11} className="text-[#5a5a5a] animate-spin" />}
                </div>
                {existingFolders.length === 0 && !foldersLoading ? (
                  <p className="text-[11px] text-[#f48771] bg-[#f48771]/10 border border-[#f48771]/20 rounded px-2 py-1.5">
                    No existing folders found under <span className="font-mono">models/sources/</span>. Use &quot;New folder + file&quot; first.
                  </p>
                ) : (
                  <select
                    value={selectedFolder}
                    onChange={(e) => setSelectedFolder(e.target.value)}
                    className="w-full bg-[#3c3c3c] border border-[#5a5a5a] focus:border-[#1e7e34] rounded px-3 py-2 text-sm text-[#d4d4d4] outline-none"
                  >
                    {existingFolders.map((f) => (
                      <option key={f} value={f}>{f}</option>
                    ))}
                  </select>
                )}
              </div>

              {/* File name + source name */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-[#8b8b8b] mb-1.5">
                    New File Name <span className="text-red-400">*</span>
                  </label>
                  <div className="flex items-center gap-1">
                    <input
                      value={newFileName}
                      onChange={(e) => setNewFileName(e.target.value)}
                      placeholder="e.g. extra_sources"
                      className="flex-1 bg-[#3c3c3c] border border-[#5a5a5a] focus:border-[#1e7e34] rounded px-3 py-2 text-sm text-[#d4d4d4] placeholder-[#5a5a5a] outline-none"
                    />
                    <span className="text-xs text-[#5a5a5a]">.yaml</span>
                  </div>
                </div>
                <div>
                  <label className="block text-xs text-[#8b8b8b] mb-1.5">
                    Source Name <span className="text-red-400">*</span>
                  </label>
                  <input
                    value={newFileSourceName}
                    onChange={(e) => setNewFileSourceName(e.target.value)}
                    placeholder="e.g. application_db"
                    className="w-full bg-[#3c3c3c] border border-[#5a5a5a] focus:border-[#1e7e34] rounded px-3 py-2 text-sm text-[#d4d4d4] placeholder-[#5a5a5a] outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-[#8b8b8b] mb-1.5">
                    Schema <span className="text-red-400">*</span>
                  </label>
                  <input
                    value={newFileSchema}
                    onChange={(e) => setNewFileSchema(e.target.value)}
                    placeholder="e.g. prod-raw"
                    className="w-full bg-[#3c3c3c] border border-[#5a5a5a] focus:border-[#1e7e34] rounded px-3 py-2 text-sm text-[#d4d4d4] placeholder-[#5a5a5a] outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs text-[#8b8b8b] mb-1.5">Catalog</label>
                  <input
                    value={newFileCatalog}
                    onChange={(e) => setNewFileCatalog(e.target.value)}
                    placeholder="AwsDataCatalog"
                    className="w-full bg-[#3c3c3c] border border-[#5a5a5a] focus:border-[#1e7e34] rounded px-3 py-2 text-sm text-[#d4d4d4] placeholder-[#5a5a5a] outline-none"
                  />
                </div>
              </div>
            </>
          )}

          {/* ══════════════════════════════════════════════
              MODE: append to existing file
          ══════════════════════════════════════════════ */}
          {fileMode === 'append' && (
            <div className="grid grid-cols-2 gap-3">
              {/* Folder picker */}
              <div>
                <div className="flex items-center gap-2 mb-1.5">
                  <FolderOpen size={12} className="text-[#8b8b8b]" />
                  <label className="text-xs text-[#8b8b8b]">
                    Folder <span className="text-red-400">*</span>
                  </label>
                  {foldersLoading && <RefreshCw size={11} className="text-[#5a5a5a] animate-spin" />}
                </div>
                {existingFolders.length === 0 && !foldersLoading ? (
                  <p className="text-[11px] text-[#f48771] bg-[#f48771]/10 border border-[#f48771]/20 rounded px-2 py-1.5">
                    No folders found. Create a source first.
                  </p>
                ) : (
                  <select
                    value={selectedFolder}
                    onChange={(e) => setSelectedFolder(e.target.value)}
                    className="w-full bg-[#3c3c3c] border border-[#5a5a5a] focus:border-[#1e7e34] rounded px-3 py-2 text-sm text-[#d4d4d4] outline-none"
                  >
                    {existingFolders.map((f) => (
                      <option key={f} value={f}>{f}</option>
                    ))}
                  </select>
                )}
              </div>

              {/* File picker */}
              <div>
                <div className="flex items-center gap-2 mb-1.5">
                  <label className="text-xs text-[#8b8b8b]">
                    Target File <span className="text-red-400">*</span>
                  </label>
                  {filesLoading && <RefreshCw size={11} className="text-[#5a5a5a] animate-spin" />}
                </div>
                {!filesLoading && existingFiles.length === 0 ? (
                  <p className="text-[11px] text-[#f48771] bg-[#f48771]/10 border border-[#f48771]/20 rounded px-2 py-1.5">
                    No YAML files found in this folder.
                  </p>
                ) : (
                  <select
                    value={selectedFile}
                    onChange={(e) => setSelectedFile(e.target.value)}
                    disabled={filesLoading}
                    className="w-full bg-[#3c3c3c] border border-[#5a5a5a] focus:border-[#1e7e34] rounded px-3 py-2 text-sm text-[#d4d4d4] outline-none disabled:opacity-50"
                  >
                    {existingFiles.map((f) => (
                      <option key={f} value={f}>{f}</option>
                    ))}
                  </select>
                )}
              </div>
            </div>
          )}

          {/* ── Tables (shared across all modes) ── */}
          <TableList
            tables={tables}
            onAdd={addTable}
            onRemove={removeTable}
            onUpdateField={updateTable}
            onToggleCols={toggleColumns}
            onAddCol={addColumn}
            onRemoveCol={removeColumn}
            onUpdateCol={updateColumn}
          />

          {error && (
            <p className="text-xs text-red-400 bg-red-400/10 border border-red-400/20 rounded px-3 py-2">
              {error}
            </p>
          )}

          {/* Preview path */}
          {previewPath && (
            <p className="text-[10px] text-[#5a5a5a] font-mono bg-[#1e1e1e] rounded px-2 py-1">
              → {previewPath}
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
            {loading
              ? 'Saving…'
              : fileMode === 'new-folder'
              ? 'Create Source'
              : fileMode === 'new-file'
              ? 'Create File'
              : 'Append Tables'}
          </button>
        </div>
      </div>
    </div>
  );
}

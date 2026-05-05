'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  X,
  Search,
  ChevronDown,
  ChevronRight,
  Copy,
  Check,
  Plus,
  RefreshCw,
  Loader2,
  Code2,
  Package,
  FolderOpen,
  Wrench,
} from 'lucide-react';
import type { MacroDef, MacrosResponse } from '@/app/api/macros/route';

// ── Helpers ───────────────────────────────────────────────────────────────────

function buildCallSnippet(m: MacroDef): string {
  const args = m.args.map((a) => (a.default !== undefined ? `${a.name}=${a.default}` : a.name)).join(', ');
  return `{{ ${m.name}(${args}) }}`;
}

// ── Copy button ───────────────────────────────────────────────────────────────

function CopyButton({ text, label = 'Copy' }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    });
  };
  return (
    <button
      onClick={copy}
      className="flex items-center gap-1 px-1.5 py-0.5 text-[10px] rounded border border-[#4a4a4a] text-[#8b8b8b] hover:text-[#d4d4d4] hover:border-[#5a5a5a] transition-colors"
    >
      {copied ? <Check size={9} className="text-[#89d185]" /> : <Copy size={9} />}
      {copied ? 'Copied!' : label}
    </button>
  );
}

// ── Macro card ────────────────────────────────────────────────────────────────

function MacroCard({ macro }: { macro: MacroDef }) {
  const [open, setOpen] = useState(false);
  const snippet = buildCallSnippet(macro);

  return (
    <div className="border border-[#2e2e2e] rounded overflow-hidden">
      {/* Use div + role=button so CopyButton (also a button) is not nested inside a button */}
      <div
        role="button"
        tabIndex={0}
        onClick={() => setOpen((v) => !v)}
        onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && setOpen((v) => !v)}
        className="flex items-center gap-2 w-full px-3 py-2 hover:bg-[#2a2d2e] transition-colors text-left cursor-pointer select-none"
      >
        {open ? <ChevronDown size={10} className="text-[#5a5a5a] shrink-0" /> : <ChevronRight size={10} className="text-[#5a5a5a] shrink-0" />}
        <span className="flex-1 text-[11px] font-mono text-[#dcdcaa]">{macro.name}</span>
        {macro.args.length > 0 && (
          <span className="text-[10px] text-[#5a5a5a] font-mono truncate max-w-[120px]">
            ({macro.args.map((a) => a.name).join(', ')})
          </span>
        )}
        <span onClick={(e) => e.stopPropagation()}>
          <CopyButton text={snippet} label="Copy call" />
        </span>
      </div>

      {open && (
        <div className="border-t border-[#2e2e2e] bg-[#1a1a1a] px-3 py-2 space-y-2">
          {/* File path */}
          <p className="text-[10px] text-[#5a5a5a] font-mono truncate">{macro.filePath}</p>

          {/* Docstring */}
          {macro.docstring && (
            <p className="text-[11px] text-[#9cdcfe] italic">{macro.docstring}</p>
          )}

          {/* Args table */}
          {macro.args.length > 0 && (
            <div className="space-y-1">
              <p className="text-[10px] text-[#5a5a5a] uppercase tracking-wider">Arguments</p>
              {macro.args.map((a) => (
                <div key={a.name} className="flex items-center gap-2 text-[11px]">
                  <span className="font-mono text-[#9cdcfe] w-32 shrink-0">{a.name}</span>
                  {a.default !== undefined ? (
                    <span className="text-[#5a5a5a]">default: <span className="font-mono text-[#ce9178]">{a.default}</span></span>
                  ) : (
                    <span className="text-[#f48771] text-[10px]">required</span>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Call snippet */}
          <div className="flex items-center gap-2">
            <code className="flex-1 text-[11px] font-mono bg-[#111] rounded px-2 py-1 text-[#d4d4d4] truncate">
              {snippet}
            </code>
            <CopyButton text={snippet} />
          </div>

          {/* Body preview */}
          <details className="group">
            <summary className="text-[10px] text-[#5a5a5a] cursor-pointer hover:text-[#8b8b8b] select-none">
              View body
            </summary>
            <pre className="mt-1 text-[10px] font-mono text-[#8b8b8b] bg-[#111] rounded p-2 overflow-x-auto leading-relaxed max-h-40 overflow-y-auto whitespace-pre-wrap">
              {macro.body}
            </pre>
          </details>
        </div>
      )}
    </div>
  );
}

// ── Group section ─────────────────────────────────────────────────────────────

function MacroGroup({
  title,
  icon,
  macros,
  defaultOpen = true,
}: {
  title: string;
  icon: React.ReactNode;
  macros: MacroDef[];
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className="mb-2">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 w-full px-3 py-1.5 text-[10px] font-semibold text-[#8b8b8b] uppercase tracking-wider hover:text-[#d4d4d4] hover:bg-[#2a2a2a] transition-colors"
      >
        {open ? <ChevronDown size={10} /> : <ChevronRight size={10} />}
        {icon}
        {title}
        <span className="ml-auto text-[#5a5a5a] font-normal normal-case">{macros.length}</span>
      </button>
      {open && (
        <div className="px-3 space-y-1.5 pb-2">
          {macros.map((m) => (
            <MacroCard key={`${m.filePath}::${m.name}`} macro={m} />
          ))}
        </div>
      )}
    </div>
  );
}

// ── Create macro form ─────────────────────────────────────────────────────────

function CreateMacroForm({ onCreated }: { onCreated: (filePath: string) => void }) {
  const [name, setName]     = useState('');
  const [args, setArgs]     = useState('');
  const [subPath, setSubPath] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError]   = useState('');

  const handleCreate = async () => {
    if (!name.trim()) { setError('Macro name is required'); return; }
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/macros', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), args: args.trim(), subPath: subPath.trim() }),
      });
      const data = await res.json() as { ok?: boolean; error?: string; path?: string };
      if (!res.ok || data.error) { setError(data.error ?? 'Failed to create macro'); return; }
      onCreated(data.path ?? '');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Network error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-3">
      <div>
        <label className="block text-[10px] text-[#8b8b8b] mb-1">Macro name <span className="text-red-400">*</span></label>
        <input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. cents_to_dollars"
          className="w-full bg-[#3c3c3c] border border-[#5a5a5a] focus:border-[#007acc] rounded px-2 py-1.5 text-xs text-[#d4d4d4] placeholder-[#5a5a5a] outline-none"
        />
      </div>
      <div>
        <label className="block text-[10px] text-[#8b8b8b] mb-1">Arguments <span className="text-[#5a5a5a]">(comma-separated, use name=default for optional)</span></label>
        <input
          value={args}
          onChange={(e) => setArgs(e.target.value)}
          placeholder="e.g. amount, currency='USD'"
          className="w-full bg-[#3c3c3c] border border-[#5a5a5a] focus:border-[#007acc] rounded px-2 py-1.5 text-xs text-[#d4d4d4] placeholder-[#5a5a5a] outline-none"
        />
      </div>
      <div>
        <label className="block text-[10px] text-[#8b8b8b] mb-1">Sub-folder <span className="text-[#5a5a5a]">(optional, e.g. utils)</span></label>
        <input
          value={subPath}
          onChange={(e) => setSubPath(e.target.value)}
          placeholder="macros/"
          className="w-full bg-[#3c3c3c] border border-[#5a5a5a] focus:border-[#007acc] rounded px-2 py-1.5 text-xs text-[#d4d4d4] placeholder-[#5a5a5a] outline-none"
        />
      </div>

      {/* Preview */}
      {name.trim() && (
        <pre className="text-[10px] font-mono text-[#8b8b8b] bg-[#111] rounded px-2 py-1.5 leading-relaxed">
          {`{%- macro ${name.trim()}(${args.trim()}) %}\n    {# TODO: implement ${name.trim()} #}\n{%- endmacro %}`}
        </pre>
      )}

      {error && <p className="text-xs text-red-400">{error}</p>}

      <button
        onClick={handleCreate}
        disabled={loading || !name.trim()}
        className="w-full flex items-center justify-center gap-1.5 px-3 py-2 text-xs rounded bg-[#0e639c] hover:bg-[#1177bb] disabled:opacity-50 text-white font-medium transition-colors"
      >
        {loading ? <Loader2 size={12} className="animate-spin" /> : <Plus size={12} />}
        {loading ? 'Creating…' : 'Create Macro'}
      </button>
    </div>
  );
}

// ── Main panel ────────────────────────────────────────────────────────────────

interface Props {
  onClose: () => void;
  onOpenFile?: (path: string) => void;
}

export default function MacrosPanel({ onClose, onOpenFile }: Props) {
  const [data, setData]           = useState<MacrosResponse | null>(null);
  const [loading, setLoading]     = useState(true);
  const [filter, setFilter]       = useState('');
  const [activeTab, setActiveTab] = useState<'browse' | 'create'>('browse');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/macros');
      const json = await res.json() as MacrosResponse;
      setData(json);
    } catch { setData({ project: [], packages: {} }); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = useMemo(() => {
    if (!data) return null;
    const q = filter.toLowerCase();
    if (!q) return data;
    const filterMacros = (m: MacroDef) =>
      m.name.toLowerCase().includes(q) ||
      m.filePath.toLowerCase().includes(q) ||
      m.args.some((a) => a.name.toLowerCase().includes(q));
    return {
      project: data.project.filter(filterMacros),
      packages: Object.fromEntries(
        Object.entries(data.packages).map(([k, v]) => [k, v.filter(filterMacros)]).filter(([, v]) => v.length > 0)
      ),
    };
  }, [data, filter]);

  const totalProject  = filtered?.project.length ?? 0;
  const totalPackages = (Object.values(filtered?.packages ?? {}) as MacroDef[][]).reduce(
    (s, v) => s + v.length,
    0
  );

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-[#1e1e1e] font-mono">

      {/* Title bar */}
      <div className="flex items-center gap-3 px-4 h-10 bg-[#252526] border-b border-[#1e1e1e] shrink-0 select-none">
        <Wrench size={13} className="text-[#dcdcaa]" />
        <span className="text-sm font-semibold text-[#d4d4d4] tracking-wide">Macros</span>
        <span className="text-[11px] text-[#5a5a5a]">
          {totalProject} project · {totalPackages} packages
        </span>
        <div className="ml-auto flex items-center gap-2">
          <button
            onClick={load}
            disabled={loading}
            title="Refresh"
            className="p-1.5 rounded text-[#8b8b8b] hover:text-[#d4d4d4] hover:bg-[#3e3e42] transition-colors disabled:opacity-40"
          >
            <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
          </button>
          <button
            onClick={onClose}
            className="p-1.5 rounded text-[#8b8b8b] hover:text-[#d4d4d4] hover:bg-[#3e3e42] transition-colors"
          >
            <X size={13} />
          </button>
        </div>
      </div>

      {/* Tab bar */}
      <div className="flex border-b border-[#1e1e1e] bg-[#2d2d2d] shrink-0">
        {([
          { id: 'browse', icon: <Code2 size={11} />, label: 'Browse' },
          { id: 'create', icon: <Plus   size={11} />, label: 'New Macro' },
        ] as { id: 'browse' | 'create'; icon: React.ReactNode; label: string }[]).map(({ id, icon, label }) => (
          <button
            key={id}
            onClick={() => setActiveTab(id)}
            className={`flex items-center gap-1.5 px-4 py-2 text-[11px] border-b-2 transition-colors ${
              activeTab === id
                ? 'border-[#007acc] text-[#d4d4d4]'
                : 'border-transparent text-[#8b8b8b] hover:text-[#d4d4d4]'
            }`}
          >
            {icon}{label}
          </button>
        ))}
      </div>

      {/* ── Browse ── */}
      {activeTab === 'browse' && (
        <div className="flex flex-col flex-1 min-h-0">
          {/* Search */}
          <div className="px-3 py-2 border-b border-[#1e1e1e] bg-[#252526] shrink-0">
            <div className="flex items-center gap-2 bg-[#3c3c3c] rounded px-2 py-1.5 border border-[#5a5a5a] focus-within:border-[#007acc]">
              <Search size={11} className="text-[#5a5a5a]" />
              <input
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                placeholder="Search macros by name, arg, or file…"
                className="flex-1 bg-transparent text-xs text-[#d4d4d4] placeholder-[#5a5a5a] outline-none"
              />
              {filter && (
                <button onClick={() => setFilter('')} className="text-[#5a5a5a] hover:text-[#8b8b8b]"><X size={10} /></button>
              )}
            </div>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto min-h-0">
            {loading && (
              <div className="flex flex-col items-center justify-center h-full gap-3 text-[#5a5a5a]">
                <Loader2 size={24} className="animate-spin" />
                <p className="text-xs">Scanning macros…</p>
              </div>
            )}

            {!loading && filtered && (
              <>
                {/* Project macros */}
                {filtered.project.length > 0 ? (
                  <MacroGroup
                    title="Project macros"
                    icon={<FolderOpen size={10} />}
                    macros={filtered.project}
                    defaultOpen
                  />
                ) : (
                  !filter && (
                    <div className="flex flex-col items-center justify-center gap-2 py-8 text-[#5a5a5a]">
                      <FolderOpen size={20} className="opacity-30" />
                      <p className="text-xs">No macros in project</p>
                      <button
                        onClick={() => setActiveTab('create')}
                        className="text-[10px] text-[#007acc] hover:underline"
                      >
                        Create your first macro →
                      </button>
                    </div>
                  )
                )}

                {/* Package macros */}
                {Object.entries(filtered.packages).map(([pkg, macros]) => (
                  <MacroGroup
                    key={pkg}
                    title={pkg}
                    icon={<Package size={10} />}
                    macros={macros as MacroDef[]}
                    defaultOpen={false}
                  />
                ))}

                {filter && totalProject + totalPackages === 0 && (
                  <div className="flex flex-col items-center justify-center py-12 text-[#5a5a5a]">
                    <p className="text-xs">No macros match &quot;{filter}&quot;</p>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}

      {/* ── Create ── */}
      {activeTab === 'create' && (
        <div className="flex-1 overflow-y-auto p-4">
          <CreateMacroForm
            onCreated={(filePath) => {
              load();
              setActiveTab('browse');
              if (filePath && onOpenFile) onOpenFile(filePath);
            }}
          />
        </div>
      )}
    </div>
  );
}

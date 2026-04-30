'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Search, X, FileCode, Table2, Columns3, Database } from 'lucide-react';
import type { ManifestMetaResponse } from '@/app/api/manifest-meta/route';

// ─── Types ────────────────────────────────────────────────────────────────────

type ResultKind = 'model' | 'source' | 'column';

interface SearchResult {
  kind: ResultKind;
  label: string;       // primary display text
  detail: string;      // secondary (schema, source name, model, etc.)
  description: string;
  filePath?: string;   // for models – to open file
  modelName?: string;  // for columns – parent model
}

interface Props {
  onClose: () => void;
  onOpenFile: (path: string) => void;
}

// ─── Icon per kind ────────────────────────────────────────────────────────────

function KindIcon({ kind }: { kind: ResultKind }) {
  if (kind === 'model')  return <FileCode  size={13} className="text-[#569cd6] shrink-0" />;
  if (kind === 'source') return <Database  size={13} className="text-[#4ec9b0] shrink-0" />;
  return                        <Columns3  size={13} className="text-[#ce9178] shrink-0" />;
}

const KIND_LABEL: Record<ResultKind, string> = {
  model:  'Model',
  source: 'Source',
  column: 'Column',
};

// ─── Component ────────────────────────────────────────────────────────────────

export default function GlobalSearch({ onClose, onOpenFile }: Props) {
  const [query, setQuery]       = useState('');
  const [meta, setMeta]         = useState<ManifestMetaResponse | null>(null);
  const [loading, setLoading]   = useState(true);
  const [activeIdx, setActiveIdx] = useState(0);
  const inputRef  = useRef<HTMLInputElement>(null);
  const listRef   = useRef<HTMLDivElement>(null);

  // Load manifest meta once
  useEffect(() => {
    fetch('/api/manifest-meta')
      .then((r) => r.ok ? r.json() : null)
      .then((d: ManifestMetaResponse | null) => setMeta(d))
      .catch(() => {})
      .finally(() => setLoading(false));
    // Focus input
    setTimeout(() => inputRef.current?.focus(), 50);
  }, []);

  // Escape to close
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  // Build flat search results
  const results = useMemo<SearchResult[]>(() => {
    if (!meta || !query.trim()) return [];
    const q = query.toLowerCase().trim();

    const out: SearchResult[] = [];

    // Models
    for (const m of meta.models) {
      if (m.name.toLowerCase().includes(q) || m.description.toLowerCase().includes(q)) {
        out.push({
          kind: 'model',
          label: m.name,
          detail: m.schema || '',
          description: m.description,
          filePath: m.path,
          modelName: m.name,
        });
      }
      // Columns inside model
      for (const col of m.columns) {
        if (col.name.toLowerCase().includes(q) || col.description.toLowerCase().includes(q)) {
          out.push({
            kind: 'column',
            label: col.name,
            detail: `in ${m.name}`,
            description: col.description || col.type,
            filePath: m.path,
            modelName: m.name,
          });
        }
      }
    }

    // Sources
    for (const s of meta.sources) {
      const label = `${s.sourceName}.${s.tableName}`;
      if (
        s.sourceName.toLowerCase().includes(q) ||
        s.tableName.toLowerCase().includes(q) ||
        s.description.toLowerCase().includes(q)
      ) {
        out.push({
          kind: 'source',
          label,
          detail: s.schema || s.sourceName,
          description: s.description,
        });
      }
    }

    return out.slice(0, 60); // cap for performance
  }, [meta, query]);

  // Reset active index when results change
  useEffect(() => setActiveIdx(0), [results]);

  // Scroll active item into view
  useEffect(() => {
    const el = listRef.current?.querySelector(`[data-idx="${activeIdx}"]`) as HTMLElement | null;
    el?.scrollIntoView({ block: 'nearest' });
  }, [activeIdx]);

  const handleSelect = useCallback((r: SearchResult) => {
    if (r.filePath) {
      onOpenFile(r.filePath);
    }
    onClose();
  }, [onClose, onOpenFile]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIdx((i) => Math.min(i + 1, results.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIdx((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter' && results[activeIdx]) {
      handleSelect(results[activeIdx]);
    }
  };

  // Group results by kind for display
  const grouped = useMemo(() => {
    const order: ResultKind[] = ['model', 'source', 'column'];
    return order
      .map((kind) => ({ kind, items: results.filter((r) => r.kind === kind) }))
      .filter((g) => g.items.length > 0);
  }, [results]);

  // Flat index map for keyboard nav
  const flatResults = useMemo(() => results, [results]);

  return (
    <div
      className="fixed inset-0 z-[60] flex items-start justify-center pt-[10vh] bg-black/60 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="w-full max-w-2xl mx-4 bg-[#252526] border border-[#3e3e42] rounded-xl shadow-2xl overflow-hidden flex flex-col max-h-[70vh]">

        {/* Search input */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-[#3e3e42]">
          <Search size={16} className="text-[#8b8b8b] shrink-0" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Search models, sources, columns…"
            className="flex-1 bg-transparent text-sm text-[#d4d4d4] placeholder-[#555] outline-none"
            spellCheck={false}
          />
          {query && (
            <button onClick={() => setQuery('')} className="text-[#555] hover:text-[#888] transition-colors">
              <X size={14} />
            </button>
          )}
          <kbd className="text-[10px] text-[#555] border border-[#3e3e42] rounded px-1.5 py-0.5">Esc</kbd>
        </div>

        {/* Results */}
        <div ref={listRef} className="flex-1 overflow-y-auto">
          {loading && (
            <div className="flex items-center justify-center py-8 text-[#555] text-xs">
              Loading manifest…
            </div>
          )}

          {!loading && !query.trim() && (
            <div className="flex flex-col items-center justify-center py-10 gap-2 text-[#555]">
              <Search size={24} className="text-[#333]" />
              <p className="text-sm">Start typing to search models, sources, and columns</p>
              <div className="flex items-center gap-4 mt-2 text-[11px]">
                <span className="flex items-center gap-1"><FileCode size={11} className="text-[#569cd6]" /> Models</span>
                <span className="flex items-center gap-1"><Database size={11} className="text-[#4ec9b0]" /> Sources</span>
                <span className="flex items-center gap-1"><Columns3 size={11} className="text-[#ce9178]" /> Columns</span>
              </div>
            </div>
          )}

          {!loading && query.trim() && results.length === 0 && (
            <div className="flex items-center justify-center py-8 text-[#555] text-sm">
              No results for &ldquo;{query}&rdquo;
            </div>
          )}

          {grouped.map(({ kind, items }) => {
            return (
              <div key={kind}>
                <div className="px-4 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-[#555] bg-[#1e1e1e] border-b border-[#2e2e2e] flex items-center gap-2">
                  <KindIcon kind={kind} />
                  {KIND_LABEL[kind]}s
                  <span className="text-[#444]">({items.length})</span>
                </div>
                {items.map((r) => {
                  const flatIdx = flatResults.indexOf(r);
                  const isActive = flatIdx === activeIdx;
                  return (
                    <button
                      key={`${r.kind}-${r.label}-${r.detail}`}
                      data-idx={flatIdx}
                      onClick={() => handleSelect(r)}
                      onMouseEnter={() => setActiveIdx(flatIdx)}
                      className={`w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors border-b border-[#2a2a2a] last:border-b-0 ${
                        isActive ? 'bg-[#094771]' : 'hover:bg-[#2a2d2e]'
                      }`}
                    >
                      <KindIcon kind={r.kind} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-mono text-[#d4d4d4] truncate">{r.label}</span>
                          {r.detail && (
                            <span className="text-[11px] text-[#555] truncate shrink-0">{r.detail}</span>
                          )}
                        </div>
                        {r.description && (
                          <p className="text-[11px] text-[#8b8b8b] truncate mt-0.5">{r.description}</p>
                        )}
                      </div>
                      {r.filePath && (
                        <span className="text-[10px] text-[#555] shrink-0">↵ open</span>
                      )}
                    </button>
                  );
                })}
              </div>
            );
          })}
        </div>

        {/* Footer hint */}
        <div className="flex items-center gap-4 px-4 py-2 border-t border-[#2e2e2e] bg-[#1e1e1e] text-[10px] text-[#444]">
          <span>↑↓ navigate</span>
          <span>↵ open file</span>
          <span className="ml-auto">
            {results.length > 0 && `${results.length} result${results.length !== 1 ? 's' : ''}`}
          </span>
        </div>
      </div>
    </div>
  );
}

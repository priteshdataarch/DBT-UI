'use client';

import dynamic from 'next/dynamic';
import { useCallback, useEffect, useRef, useState } from 'react';
import { X, Save, FileCode, Eye, Zap, Loader2, AlertCircle, RotateCcw, Info, Tag, Database, Layers, GitBranch, Columns3 } from 'lucide-react';
import type { OpenFileTab } from '@/types';
import type { ManifestMetaResponse, ModelMeta, SourceMeta } from '@/app/api/manifest-meta/route';
import type * as MonacoNS from 'monaco-editor';

const MonacoEditor = dynamic(() => import('@monaco-editor/react'), { ssr: false });

interface Props {
  tabs: OpenFileTab[];
  activeTab: string | null;
  onTabClick: (path: string) => void;
  onTabClose: (path: string) => void;
  onContentChange: (path: string, content: string) => void;
  onSave: (path: string) => void;
  onPreview?: (filePath: string) => void;
  onCompile?: (filePath: string) => Promise<{ sql: string; compiledPath: string }>;
  /** While read-only due to another editor’s lock — retry acquire + reload from disk. */
  onRetryAcquireLock?: () => void | Promise<void>;
  lockRetryLoading?: boolean;
}

type ViewMode = 'edit' | 'compiled' | 'info';

// ─── Model Info Panel ──────────────────────────────────────────────────────────

const MATERIALIZED_COLOR: Record<string, string> = {
  table:       'bg-blue-900/40 text-blue-300 border-blue-800',
  view:        'bg-purple-900/40 text-purple-300 border-purple-800',
  incremental: 'bg-orange-900/40 text-orange-300 border-orange-800',
  ephemeral:   'bg-[#2a2a2a] text-[#888] border-[#3e3e42]',
};

// ─── Health score helpers ──────────────────────────────────────────────────────

function computeHealthScore(model: ModelMeta): { score: number; checks: { label: string; pass: boolean }[] } {
  const checks = [
    { label: 'Has description',          pass: model.description.trim().length > 0 },
    { label: 'Has columns documented',   pass: model.columns.length > 0 },
    { label: '50%+ columns have description',
      pass: model.columns.length > 0 &&
            model.columns.filter((c) => c.description.trim()).length / model.columns.length >= 0.5 },
    { label: 'Has tags',                 pass: model.tags.length > 0 },
    { label: 'Has upstream dependencies',pass: model.dependsOn.length > 0 },
  ];
  const score = Math.round((checks.filter((c) => c.pass).length / checks.length) * 100);
  return { score, checks };
}

function HealthScoreBadge({ score }: { score: number }) {
  const color = score >= 80 ? '#22c55e' : score >= 50 ? '#f59e0b' : '#ef4444';
  const label = score >= 80 ? 'Good' : score >= 50 ? 'Fair' : 'Poor';
  const circumference = 2 * Math.PI * 14;
  const offset = circumference - (score / 100) * circumference;
  return (
    <div className="flex items-center gap-3">
      <svg width="40" height="40" viewBox="0 0 40 40">
        <circle cx="20" cy="20" r="14" fill="none" stroke="#2a2a2a" strokeWidth="4" />
        <circle cx="20" cy="20" r="14" fill="none" stroke={color} strokeWidth="4"
          strokeDasharray={circumference} strokeDashoffset={offset}
          strokeLinecap="round" transform="rotate(-90 20 20)" />
        <text x="20" y="24" textAnchor="middle" fontSize="10" fontWeight="bold" fill={color}>{score}</text>
      </svg>
      <div>
        <div className="text-xs font-semibold" style={{ color }}>{label}</div>
        <div className="text-[10px] text-[#555]">Health Score</div>
      </div>
    </div>
  );
}

function ModelInfoPanel({ model, filePath }: { model: ModelMeta | null; filePath: string }) {
  if (!model) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3 text-[#555] px-8 text-center">
        <Info size={32} className="text-[#333]" />
        <p className="text-sm text-[#666]">No manifest metadata found for this model.</p>
        <p className="text-xs text-[#444]">
          Run <span className="font-mono text-[#569cd6]">dbt compile</span> or{' '}
          <span className="font-mono text-[#569cd6]">dbt docs generate</span> to populate metadata.
        </p>
        <p className="text-[11px] text-[#333] font-mono">{filePath}</p>
      </div>
    );
  }

  const matColor = MATERIALIZED_COLOR[model.materialized] ?? MATERIALIZED_COLOR['view'];
  const { score, checks } = computeHealthScore(model);

  return (
    <div className="flex flex-col h-full overflow-auto bg-[#1e1e1e] select-text">
      {/* ── Header ── */}
      <div className="px-6 py-4 border-b border-[#2e2e2e] bg-[#252526]">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <h2 className="text-base font-bold text-[#d4d4d4] font-mono">{model.name}</h2>
            <p className="text-[11px] text-[#6e6e6e] font-mono mt-0.5 truncate">{model.path}</p>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            <HealthScoreBadge score={score} />
            <span className={`px-2.5 py-1 rounded border text-[11px] font-semibold font-mono ${matColor}`}>
              {model.materialized}
            </span>
          </div>
        </div>
        {model.description && (
          <p className="mt-3 text-xs text-[#c8c8c8] leading-relaxed">{model.description}</p>
        )}
        {/* health checklist */}
        <div className="flex flex-wrap gap-2 mt-3">
          {checks.map((c) => (
            <span key={c.label} className={`flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full border ${
              c.pass ? 'bg-green-900/20 border-green-800/50 text-green-400' : 'bg-[#1e1e1e] border-[#3e3e42] text-[#555]'
            }`}>
              {c.pass ? '✓' : '○'} {c.label}
            </span>
          ))}
        </div>
      </div>

      {/* ── Meta properties ── */}
      <div className="px-6 py-3 border-b border-[#2e2e2e] grid grid-cols-2 gap-x-8 gap-y-2">
        <div className="flex items-center gap-2">
          <Database size={12} className="text-[#569cd6] shrink-0" />
          <span className="text-[11px] text-[#8b8b8b]">Schema</span>
          <span className="ml-auto text-[11px] text-[#d4d4d4] font-mono">{model.schema || '—'}</span>
        </div>
        <div className="flex items-center gap-2">
          <Layers size={12} className="text-[#569cd6] shrink-0" />
          <span className="text-[11px] text-[#8b8b8b]">Database</span>
          <span className="ml-auto text-[11px] text-[#d4d4d4] font-mono">{model.database || '—'}</span>
        </div>
        <div className="flex items-center gap-2">
          <Tag size={12} className="text-[#569cd6] shrink-0" />
          <span className="text-[11px] text-[#8b8b8b]">Tags</span>
          <div className="ml-auto flex flex-wrap gap-1 justify-end">
            {model.tags.length > 0
              ? model.tags.map((t) => (
                  <span key={t} className="px-1.5 py-0.5 text-[10px] rounded bg-[#2d2d2d] border border-[#3e3e42] text-[#9cdcfe] font-mono">{t}</span>
                ))
              : <span className="text-[11px] text-[#555]">—</span>
            }
          </div>
        </div>
        <div className="flex items-start gap-2">
          <GitBranch size={12} className="text-[#569cd6] shrink-0 mt-0.5" />
          <span className="text-[11px] text-[#8b8b8b] shrink-0">Depends on</span>
          <div className="ml-auto flex flex-wrap gap-1 justify-end">
            {model.dependsOn.length > 0
              ? model.dependsOn.map((d) => (
                  <span key={d} className="px-1.5 py-0.5 text-[10px] rounded bg-[#1a2a1a] border border-[#3e5e3e] text-[#4ec9b0] font-mono">{d}</span>
                ))
              : <span className="text-[11px] text-[#555]">—</span>
            }
          </div>
        </div>
      </div>

      {/* ── Columns ── */}
      <div className="flex-1 overflow-auto">
        <div className="flex items-center gap-2 px-6 py-2 border-b border-[#2e2e2e] sticky top-0 bg-[#1e1e1e] z-10">
          <Columns3 size={12} className="text-[#569cd6]" />
          <span className="text-[11px] font-semibold text-[#8b8b8b] uppercase tracking-wider">
            Columns {model.columns.length > 0 ? `(${model.columns.length})` : ''}
          </span>
        </div>

        {model.columns.length === 0 ? (
          <div className="px-6 py-4 text-[11px] text-[#555] italic">
            No column documentation found. Add columns to the model&apos;s schema.yml to populate this section.
          </div>
        ) : (
          <table className="w-full text-xs border-collapse font-mono">
            <thead className="sticky top-8 z-10 bg-[#252526]">
              <tr>
                <th className="px-4 py-2 text-left text-[#8b8b8b] font-semibold border-b border-r border-[#2e2e2e] w-48">Column</th>
                <th className="px-4 py-2 text-left text-[#8b8b8b] font-semibold border-b border-r border-[#2e2e2e] w-28">Type</th>
                <th className="px-4 py-2 text-left text-[#8b8b8b] font-semibold border-b border-[#2e2e2e]">Description</th>
              </tr>
            </thead>
            <tbody>
              {model.columns.map((col, i) => (
                <tr key={col.name} className={i % 2 === 0 ? 'bg-[#1e1e1e]' : 'bg-[#222]'}>
                  <td className="px-4 py-1.5 border-b border-r border-[#2e2e2e] text-[#9cdcfe] whitespace-nowrap">{col.name}</td>
                  <td className="px-4 py-1.5 border-b border-r border-[#2e2e2e] text-[#ce9178] whitespace-nowrap">{col.type || '—'}</td>
                  <td className="px-4 py-1.5 border-b border-[#2e2e2e] text-[#d4d4d4]">{col.description || <span className="text-[#555] italic">—</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

export default function EditorPane({
  tabs,
  activeTab,
  onTabClick,
  onTabClose,
  onContentChange,
  onSave,
  onPreview,
  onCompile,
  onRetryAcquireLock,
  lockRetryLoading,
}: Props) {
  const activeFileTab = tabs.find((t) => t.path === activeTab);
  const lockBlockedBy = activeFileTab?.lockBlockedBy ?? null;

  // Manifest meta for completions
  const manifestMeta = useRef<ManifestMetaResponse | null>(null);
  const completionDisposable = useRef<MonacoNS.IDisposable | null>(null);

  useEffect(() => {
    fetch('/api/manifest-meta')
      .then((r) => r.ok ? r.json() : null)
      .then((d: ManifestMetaResponse | null) => { if (d) manifestMeta.current = d; })
      .catch(() => {});
  }, []);

  // Compiled SQL state — reset whenever active tab changes
  const [viewMode, setViewMode]         = useState<ViewMode>('edit');
  const [compiledSql, setCompiledSql]   = useState<string | null>(null);
  const [compiledFrom, setCompiledFrom] = useState<string | null>(null); // path it was compiled for
  const [compiling, setCompiling]       = useState(false);
  const [compileError, setCompileError] = useState<string | null>(null);

  // Switch back to edit when the active tab changes
  useEffect(() => {
    setViewMode('edit');
    setCompiledSql(null);
    setCompiledFrom(null);
    setCompileError(null);
  }, [activeTab]);

  // If file becomes dirty after compile, warn by resetting compiled cache
  useEffect(() => {
    if (activeFileTab?.isDirty && compiledFrom === activeTab) {
      setCompiledSql(null);
      setCompiledFrom(null);
      setCompileError(null);
      if (viewMode === 'compiled') setViewMode('edit');
    }
  }, [activeFileTab?.isDirty, activeTab, compiledFrom, viewMode]);

  const handleCompile = async () => {
    if (!activeTab || !onCompile) return;

    // Already have fresh compiled SQL — just toggle the view
    if (compiledSql && compiledFrom === activeTab) {
      setViewMode((m) => (m === 'compiled' ? 'edit' : 'compiled'));
      return;
    }

    setCompiling(true);
    setCompileError(null);
    try {
      const result = await onCompile(activeTab);
      setCompiledSql(result.sql);
      setCompiledFrom(activeTab);
      setViewMode('compiled');
    } catch (err) {
      setCompileError(err instanceof Error ? err.message : 'Compile failed');
      setViewMode('edit');
    } finally {
      setCompiling(false);
    }
  };

  // ── Monaco completion provider registration ──────────────────────────────────
  const handleEditorMount = useCallback(
    (editor: MonacoNS.editor.IStandaloneCodeEditor, monaco: typeof MonacoNS) => {
      // Dispose previous registration to avoid duplicates on hot reload
      completionDisposable.current?.dispose();

      completionDisposable.current = monaco.languages.registerCompletionItemProvider('sql', {
        triggerCharacters: ["'", '"', '(', ' ', '{'],

        provideCompletionItems(model, position) {
          const meta = manifestMeta.current;
          const lineText = model.getLineContent(position.lineNumber);
          const textBefore = lineText.substring(0, position.column - 1);
          const range = {
            startLineNumber: position.lineNumber,
            endLineNumber: position.lineNumber,
            startColumn: position.column,
            endColumn: position.column,
          };

          // ── ref('…') model completions ──────────────────────────────
          if (/ref\s*\(\s*['"]$/.test(textBefore)) {
            const models: ModelMeta[] = meta?.models ?? [];
            return {
              suggestions: models.map((m) => ({
                label: m.name,
                kind: monaco.languages.CompletionItemKind.Reference,
                insertText: m.name,
                detail: m.schema ? `schema: ${m.schema}` : 'dbt model',
                documentation: m.description || m.path,
                range,
              })),
            };
          }

          // ── source('source_name', '…') — first arg: source name ────
          if (/source\s*\(\s*['"]$/.test(textBefore)) {
            const sources: SourceMeta[] = meta?.sources ?? [];
            const uniqueSourceNames = [...new Set(sources.map((s) => s.sourceName))];
            return {
              suggestions: uniqueSourceNames.map((sn) => ({
                label: sn,
                kind: monaco.languages.CompletionItemKind.Module,
                insertText: sn,
                detail: 'dbt source',
                range,
              })),
            };
          }

          // ── source('source_name', '…') — second arg: table name ────
          const sourceSecondArgMatch = /source\s*\(\s*['"]([^'"]+)['"]\s*,\s*['"]$/.exec(textBefore);
          if (sourceSecondArgMatch) {
            const sourceName = sourceSecondArgMatch[1];
            const tables = (meta?.sources ?? [])
              .filter((s) => s.sourceName === sourceName)
              .map((s) => ({
                label: s.tableName,
                kind: monaco.languages.CompletionItemKind.Field,
                insertText: s.tableName,
                detail: sourceName,
                documentation: s.description,
                range,
              }));
            return { suggestions: tables };
          }

          // ── {{ … }} Jinja keyword snippets ───────────────────────────
          if (/\{\{\s*$/.test(textBefore)) {
            const snippets = [
              { label: 'ref',       insert: "ref('$1')",                    detail: 'Reference a dbt model' },
              { label: 'source',    insert: "source('$1', '$2')",           detail: 'Reference a dbt source' },
              { label: 'config',    insert: "config(materialized='$1')",    detail: 'Model config block' },
              { label: 'var',       insert: "var('$1')",                    detail: 'Project variable' },
              { label: 'env_var',   insert: "env_var('$1')",                detail: 'Environment variable' },
              { label: 'this',      insert: 'this',                         detail: 'Reference current model' },
              { label: 'is_incremental', insert: 'is_incremental()',        detail: 'Incremental check' },
            ];
            return {
              suggestions: snippets.map((s) => ({
                label: s.label,
                kind: monaco.languages.CompletionItemKind.Keyword,
                insertText: s.insert,
                insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
                detail: s.detail,
                range,
              })),
            };
          }

          // ── config( … ) property completions ─────────────────────────
          if (/config\s*\([^)]*$/.test(textBefore)) {
            const props = [
              { label: 'materialized', insert: "materialized='$1'",  detail: 'table | view | incremental | ephemeral' },
              { label: 'schema',       insert: "schema='$1'",         detail: 'Override target schema' },
              { label: 'alias',        insert: "alias='$1'",          detail: 'Override table name' },
              { label: 'tags',         insert: "tags=['$1']",         detail: 'Model tags list' },
              { label: 'unique_key',   insert: "unique_key='$1'",     detail: 'Incremental unique key' },
              { label: 'partition_by', insert: "partition_by='$1'",   detail: 'Partition column' },
              { label: 'full_refresh', insert: 'full_refresh=false',  detail: 'Disable full refresh' },
              { label: 'on_schema_change', insert: "on_schema_change='$1'", detail: 'fail | ignore | append_new_columns | sync_all_columns' },
            ];
            return {
              suggestions: props.map((p) => ({
                label: p.label,
                kind: monaco.languages.CompletionItemKind.Property,
                insertText: p.insert,
                insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
                detail: p.detail,
                range,
              })),
            };
          }

          return { suggestions: [] };
        },
      });

      // Cmd/Ctrl+S shortcut forwarded to save handler via keydown (already handled globally)
      void editor;
    },
    []
  );

  // Clean up completion provider when component unmounts
  useEffect(() => {
    return () => { completionDisposable.current?.dispose(); };
  }, []);

  // Cmd/Ctrl + S to save
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 's') {
        e.preventDefault();
        const tab = tabs.find((t) => t.path === activeTab);
        if (activeTab && !tab?.lockBlockedBy) onSave(activeTab);
      }
    },
    [activeTab, onSave, tabs]
  );

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  if (tabs.length === 0) {
    return (
      <div className="flex-1 bg-[#1e1e1e] flex flex-col items-center justify-center text-[#8b8b8b] min-w-0">
        <FileCode size={48} className="opacity-10 mb-4" />
        <p className="text-sm opacity-60">Open a file from the explorer</p>
        <p className="text-xs mt-1 opacity-40">or create a new model / source</p>
        <div className="mt-6 grid grid-cols-2 gap-2 text-xs text-center opacity-30">
          <div className="border border-[#3e3e42] rounded px-3 py-1.5">⌘S — Save</div>
          <div className="border border-[#3e3e42] rounded px-3 py-1.5">Click tree to open</div>
        </div>
      </div>
    );
  }

  const isSqlFile = activeFileTab?.path.endsWith('.sql') ?? false;
  const hasCompiledCache = compiledSql !== null && compiledFrom === activeTab;

  return (
    <div className="flex-1 flex flex-col bg-[#1e1e1e] overflow-hidden min-w-0">

      {/* ── Tab bar ──────────────────────────────────────── */}
      <div className="flex bg-[#252526] border-b border-[#3e3e42] overflow-x-auto shrink-0 select-none">
        {tabs.map((tab, tabIndex) => {
          const isActive = tab.path === activeTab;
          return (
            <div
              key={`${tab.path}\u0001${tabIndex}`}
              onClick={() => onTabClick(tab.path)}
              title={tab.path}
              className={`flex items-center gap-1.5 px-3 py-2 cursor-pointer border-r border-[#3e3e42] shrink-0 group transition-colors ${
                isActive
                  ? 'bg-[#1e1e1e] text-[#d4d4d4] border-t-2 border-t-[#007acc]'
                  : 'bg-[#2d2d2d] text-[#8b8b8b] hover:text-[#c8c8c8] hover:bg-[#292929]'
              }`}
            >
              <span className="text-xs whitespace-nowrap max-w-[140px] truncate">{tab.name}</span>
              {tab.isDirty && (
                <span className="w-2 h-2 rounded-full bg-[#d4d4d4] opacity-70 shrink-0" />
              )}
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onTabClose(tab.path);
                }}
                className="opacity-0 group-hover:opacity-100 hover:bg-[#3e3e42] rounded p-0.5 transition-opacity shrink-0"
                title="Close"
              >
                <X size={10} />
              </button>
            </div>
          );
        })}
      </div>

      {/* ── Breadcrumb + actions ─────────────────────────── */}
      {activeFileTab && (
        <div className="flex items-center justify-between px-3 py-1 bg-[#1e1e1e] border-b border-[#3e3e42] shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-xs text-[#6e6e6e] font-mono truncate">{activeFileTab.path}</span>
            {/* View mode toggle pills — only for SQL files */}
            {isSqlFile && (
              <div className="flex items-center gap-0.5 bg-[#252526] border border-[#3e3e42] rounded-md p-0.5 shrink-0">
                <button
                  onClick={() => setViewMode('edit')}
                  className={`px-2 py-0.5 text-[10px] font-medium rounded transition-colors ${
                    viewMode === 'edit'
                      ? 'bg-[#007acc] text-white'
                      : 'text-[#8b8b8b] hover:text-[#d4d4d4]'
                  }`}
                >
                  Edit
                </button>
                <button
                  onClick={handleCompile}
                  disabled={compiling}
                  className={`flex items-center gap-1 px-2 py-0.5 text-[10px] font-medium rounded transition-colors ${
                    viewMode === 'compiled'
                      ? 'bg-[#007acc] text-white'
                      : 'text-[#8b8b8b] hover:text-[#d4d4d4]'
                  } disabled:opacity-50`}
                  title={hasCompiledCache ? 'Toggle compiled SQL view' : 'Compile model and show resolved SQL'}
                >
                  {compiling
                    ? <Loader2 size={9} className="animate-spin" />
                    : <Zap size={9} />}
                  {compiling ? 'Compiling…' : 'Compiled'}
                </button>
                <button
                  onClick={() => setViewMode((m) => m === 'info' ? 'edit' : 'info')}
                  className={`flex items-center gap-1 px-2 py-0.5 text-[10px] font-medium rounded transition-colors ${
                    viewMode === 'info'
                      ? 'bg-[#007acc] text-white'
                      : 'text-[#8b8b8b] hover:text-[#d4d4d4]'
                  }`}
                  title="Model metadata — description, columns, tags, dependencies"
                >
                  <Info size={9} />
                  Info
                </button>
              </div>
            )}
          </div>

          <div className="flex items-center gap-1 shrink-0">
            {/* Reset compiled cache */}
            {isSqlFile && hasCompiledCache && (
              <button
                onClick={() => {
                  setCompiledSql(null);
                  setCompiledFrom(null);
                  setCompileError(null);
                  setViewMode('edit');
                }}
                className="flex items-center gap-1 text-xs text-[#6e6e6e] hover:text-[#d4d4d4] px-2 py-0.5 rounded hover:bg-[#3e3e42] transition-colors"
                title="Clear compiled SQL cache"
              >
                <RotateCcw size={10} />
              </button>
            )}

            {/* Preview Data — only for .sql files */}
            {isSqlFile && onPreview && (
              <button
                onClick={() => onPreview(activeFileTab.path)}
                className="flex items-center gap-1 text-xs text-[#4ec9b0] hover:text-[#6edec8] px-2 py-0.5 rounded hover:bg-[#3e3e42] transition-colors"
                title="Preview data (runs compiled SQL on Athena, LIMIT 100)"
              >
                <Eye size={11} />
                Preview Data
              </button>
            )}

            <button
              onClick={() => onSave(activeTab!)}
              disabled={!activeFileTab.isDirty || !!lockBlockedBy}
              className="flex items-center gap-1 text-xs text-[#8b8b8b] hover:text-[#d4d4d4] disabled:opacity-30 disabled:cursor-not-allowed px-2 py-0.5 rounded hover:bg-[#3e3e42] transition-colors"
              title="Save (⌘S)"
            >
              <Save size={11} />
              {activeFileTab.isDirty ? 'Save' : 'Saved'}
            </button>
          </div>
        </div>
      )}

      {/* ── Lock / conflict banner ───────────────────────── */}
      {lockBlockedBy && (
        <div className="flex items-start gap-3 px-3 py-2 bg-[#c58628]/15 border-b border-[#c58628]/35 text-[#e9d493] text-xs shrink-0">
          <AlertCircle size={12} className="mt-0.5 shrink-0" />
          <span className="leading-snug flex-1 min-w-0">
            Read-only — {lockBlockedBy.includes('@') ? `another editor holds this file (${lockBlockedBy}).` : lockBlockedBy}{' '}
            <span className="text-[#a89868]">Checking again automatically.</span>
          </span>
          {onRetryAcquireLock && (
            <button
              type="button"
              disabled={lockRetryLoading}
              onClick={() => void onRetryAcquireLock()}
              className="shrink-0 flex items-center gap-1.5 px-2 py-1 rounded border border-[#c58628]/40 bg-[#252526] text-[#f0e6c8] hover:bg-[#3e3e42] disabled:opacity-50 text-[11px] font-medium"
            >
              {lockRetryLoading ? <Loader2 size={11} className="animate-spin" /> : null}
              Check again
            </button>
          )}
        </div>
      )}

      {/* ── Compile error banner ─────────────────────────── */}
      {compileError && (
        <div className="flex items-start gap-2 px-3 py-2 bg-[#f48771]/10 border-b border-[#f48771]/30 text-[#f48771] text-xs shrink-0">
          <AlertCircle size={12} className="mt-0.5 shrink-0" />
          <pre className="font-mono whitespace-pre-wrap text-[11px] flex-1">{compileError}</pre>
          <button
            onClick={() => setCompileError(null)}
            className="shrink-0 hover:opacity-70"
          >
            <X size={11} />
          </button>
        </div>
      )}

      {/* ── Compiled SQL view mode label ─────────────────── */}
      {viewMode === 'compiled' && compiledSql && (
        <div className="flex items-center gap-2 px-3 py-1 bg-[#1a2a1a] border-b border-[#3e5e3e] shrink-0">
          <Zap size={10} className="text-[#4ec9b0]" />
          <span className="text-[10px] text-[#4ec9b0] font-mono">Compiled SQL — read only · Jinja &amp; ref() resolved</span>
          <span className="ml-auto text-[10px] text-[#5a5a5a]">from target/compiled/</span>
        </div>
      )}

      {/* ── Monaco Editor / Info Panel ───────────────────── */}
      {activeFileTab && (
        <div className="flex-1 overflow-hidden">
          {/* Info view — model metadata */}
          {viewMode === 'info' && isSqlFile && (
            <ModelInfoPanel
              model={manifestMeta.current?.models.find(
                (m) => m.name === activeFileTab.name.replace(/\.sql$/, '')
              ) ?? null}
              filePath={activeFileTab.path}
            />
          )}

          {viewMode !== 'info' && viewMode === 'compiled' && compiledSql ? (
            <MonacoEditor
              key={`compiled-${activeFileTab.path}`}
              height="100%"
              language="sql"
              value={compiledSql}
              theme="vs-dark"
              options={{
                fontSize: 13,
                fontFamily: "'JetBrains Mono', 'Fira Code', 'Cascadia Code', Menlo, monospace",
                fontLigatures: true,
                minimap: { enabled: true, scale: 1 },
                scrollBeyondLastLine: false,
                wordWrap: 'on',
                lineNumbers: 'on',
                renderLineHighlight: 'line',
                readOnly: true,
                cursorBlinking: 'smooth',
                smoothScrolling: true,
                tabSize: 2,
                padding: { top: 12 },
                bracketPairColorization: { enabled: true },
              }}
            />
          ) : viewMode !== 'info' && (
            <MonacoEditor
              key={activeFileTab.path}
              height="100%"
              language={
                activeFileTab.language === 'yaml' ? 'yaml'
                : activeFileTab.language === 'csv' ? 'plaintext'
                : activeFileTab.language
              }
              value={activeFileTab.content}
              theme="vs-dark"
              onMount={handleEditorMount}
              onChange={(value) => {
                if (value !== undefined) onContentChange(activeFileTab.path, value);
              }}
              options={{
                fontSize: 13,
                fontFamily: "'JetBrains Mono', 'Fira Code', 'Cascadia Code', Menlo, monospace",
                fontLigatures: true,
                minimap: { enabled: true, scale: 1 },
                scrollBeyondLastLine: false,
                wordWrap: 'on',
                lineNumbers: 'on',
                renderLineHighlight: 'line',
                cursorBlinking: 'smooth',
                smoothScrolling: true,
                tabSize: 2,
                padding: { top: 12 },
                bracketPairColorization: { enabled: true },
                guides: { bracketPairs: true },
                readOnly: !!lockBlockedBy,
              }}
            />
          )}
        </div>
      )}
    </div>
  );
}

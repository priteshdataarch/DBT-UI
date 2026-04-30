'use client';

import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import FileExplorer from '@/components/FileExplorer';
import EditorPane from '@/components/EditorPane';
import ChatPanel from '@/components/ChatPanel';
import CreateModelModal from '@/components/CreateModelModal';
import CreateSourceModal from '@/components/CreateSourceModal';
import CreateSeedModal from '@/components/CreateSeedModal';
import OutputPanel, { type DbtCommand, type PreviewResult, type OutputPanelRef, type CommandCompletePayload } from '@/components/OutputPanel';
import RunHistoryPanel from '@/components/RunHistoryPanel';
import LineageView from '@/components/LineageView';
import ResizeHandle from '@/components/ResizeHandle';
import GitPanel from '@/components/GitPanel';
import SqlEditorPanel from '@/components/SqlEditorPanel';
import GlobalSearch from '@/components/GlobalSearch';
import MacrosPanel from '@/components/MacrosPanel';
import type { FileNode, OpenFileTab, ChatMessage } from '@/types';
import {
  Database,
  GitBranch,
  Play,
  FlaskConical,
  Wrench,
  BookOpen,
  ChevronDown,
  Loader2,
  TerminalSquare,
  Search,
  History,
} from 'lucide-react';

// ─── Small helpers ───────────────────────────────────────────────────────────

function modelNameFromPath(p: string | null | undefined): string | null {
  if (!p) return null;
  const m = p.match(/([^/\\]+)\.sql$/);
  return m ? m[1] : null;
}

/** Project-wide only — used in the separate "All models" dropdown */
const PROJECT_RUN_TEST_ITEMS: { label: string; description: string; cmd: DbtCommand }[] = [
  {
    label: 'Run — entire project',
    description: 'dbt run (all runnable models)',
    cmd: { command: 'run', args: [], label: 'dbt run' },
  },
  {
    label: 'Test — entire project',
    description: 'dbt test (all tests)',
    cmd: { command: 'test', args: [], label: 'dbt test' },
  },
];

// Dropdown button (e.g. "Docs ▾")
// Uses position:fixed so it escapes overflow-x-auto / overflow-hidden parents.
function CmdDropdown({
  label,
  icon,
  items,
  disabled,
  onCommand,
}: {
  label: string;
  icon: React.ReactNode;
  items: { label: string; description: string; cmd: DbtCommand; disabled?: boolean }[];
  disabled?: boolean;
  onCommand: (cmd: DbtCommand) => void;
}) {
  const [open, setOpen] = useState(false);
  const [dropPos, setDropPos] = useState({ top: 0, left: 0 });
  const btnRef = useRef<HTMLButtonElement>(null);
  const dropRef = useRef<HTMLDivElement>(null);

  const handleToggle = () => {
    if (disabled) return;
    if (!open && btnRef.current) {
      const r = btnRef.current.getBoundingClientRect();
      setDropPos({ top: r.bottom + 4, left: r.left });
    }
    setOpen((v) => !v);
  };

  // Close when a CLICK lands outside the dropdown panel.
  // Using 'click' (not 'mousedown') so item onMouseDown runs first and
  // dispatches the command before this listener can unmount the dropdown.
  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      if (dropRef.current && dropRef.current.contains(e.target as Node)) return;
      if (btnRef.current && btnRef.current.contains(e.target as Node)) return;
      setOpen(false);
    };
    document.addEventListener('click', onDocClick, { capture: true });
    return () => document.removeEventListener('click', onDocClick, { capture: true });
  }, [open]);

  return (
    <div className="relative shrink-0">
      <button
        ref={btnRef}
        disabled={disabled}
        onClick={handleToggle}
        className="flex items-center gap-1 px-2.5 py-1 text-xs rounded text-[#d4d4d4] border border-[#5a5a5a] hover:bg-[#3e3e42] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
      >
        {icon}
        {label}
        <ChevronDown size={10} className="ml-0.5" />
      </button>

      {open && (
        <div
          ref={dropRef}
          style={{ position: 'fixed', top: dropPos.top, left: dropPos.left, zIndex: 9999 }}
          className="bg-[#252526] border border-[#3e3e42] rounded shadow-2xl min-w-[240px]"
        >
          {items.map((item) => (
            <button
              key={item.label}
              type="button"
              disabled={item.disabled}
              // onMouseDown fires BEFORE any document click listener can unmount
              // the dropdown, guaranteeing the command is dispatched even if the
              // dropdown closes immediately afterwards.
              onMouseDown={(e) => {
                e.preventDefault(); // keep focus on editor
                if (item.disabled) return;
                setOpen(false);
                onCommand(item.cmd);
              }}
              className={`block w-full text-left px-3 py-2 transition-colors border-b border-[#3e3e42] last:border-b-0 ${
                item.disabled
                  ? 'opacity-40 cursor-not-allowed'
                  : 'hover:bg-[#3e3e42]'
              }`}
            >
              <div className="text-xs text-[#d4d4d4] font-medium">{item.label}</div>
              <div className="text-[10px] text-[#6e6e6e] mt-0.5">{item.description}</div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Main page ───────────────────────────────────────────────────────────────

export default function Home() {
  const [openTabs, setOpenTabs] = useState<OpenFileTab[]>([]);
  const [activeTab, setActiveTab] = useState<string | null>(null);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [showModelModal, setShowModelModal] = useState(false);
  const [showSourceModal, setShowSourceModal] = useState(false);
  const [showSeedModal, setShowSeedModal] = useState(false);
  const [showGitPanel, setShowGitPanel]       = useState(false);
  const [showGlobalSearch, setShowGlobalSearch] = useState(false);
  const [gitBranch, setGitBranch] = useState<string | null>(null);
  const [gitAhead, setGitAhead] = useState(0);
  const [treeRefreshKey, setTreeRefreshKey] = useState(0);
  const [outputOpen, setOutputOpen] = useState(false);
  const outputPanelRef = useRef<OutputPanelRef>(null);
  // Preview state
  const [previewResult, setPreviewResult] = useState<PreviewResult | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [activeOutputTab, setActiveOutputTab] = useState<'output' | 'preview' | 'tests' | 'freshness'>('output');
  // Resizable panel dimensions
  const [explorerWidth, setExplorerWidth] = useState(240);
  const [chatWidth, setChatWidth] = useState(320);
  const [outputHeight, setOutputHeight] = useState(380);
  const [showLineage, setShowLineage] = useState(false);
  const [showSqlEditor, setShowSqlEditor]     = useState(false);
  const [showMacrosPanel, setShowMacrosPanel] = useState(false);
  const [showRunHistory, setShowRunHistory]   = useState(false);
  const [dbtRunning, setDbtRunning]           = useState<string | null>(null);
  // Environment target
  const [dbtTarget, setDbtTarget]             = useState<string>('dev');
  const [availableTargets, setAvailableTargets] = useState<string[]>(['dev']);
  const [showTargetMenu, setShowTargetMenu]   = useState(false);

  const activeModel = modelNameFromPath(activeTab);
  const activeFileTab = openTabs.find((t) => t.path === activeTab);

  /** Per-model run / test + graph selectors — left dropdown */
  const modelRunTestDropdownItems = useMemo(() => {
    if (!activeModel) return [] as { label: string; description: string; cmd: DbtCommand; disabled?: boolean }[];
    const m = activeModel;
    return [
      {
        label: `Run — ${m} only`,
        description: `dbt run --select ${m}`,
        cmd: { command: 'run', args: [], modelName: m, label: `dbt run --select ${m}` },
      },
      {
        label: `Run — +${m} (upstream + model)`,
        description: 'Parents and this model',
        cmd: { command: 'run', args: [], modelName: `+${m}`, label: `dbt run --select +${m}` },
      },
      {
        label: `Run — ${m}+ (model + downstream)`,
        description: 'This model and children',
        cmd: { command: 'run', args: [], modelName: `${m}+`, label: `dbt run --select ${m}+` },
      },
      {
        label: `Test — ${m} (tests for this model)`,
        description: `dbt test --select ${m}`,
        cmd: { command: 'test', args: [], modelName: m, label: `dbt test --select ${m}` },
      },
    ];
  }, [activeModel]);

  useEffect(() => {
    fetch('/api/git')
      .then((r) => r.json())
      .then((d) => {
        if (d.branch) setGitBranch(d.branch);
        if (d.ahead) setGitAhead(d.ahead);
      })
      .catch(() => {});
  }, []);

  // Fetch available dbt targets from profiles.yml
  useEffect(() => {
    fetch('/api/profiles')
      .then((r) => r.json())
      .then((d: { targets?: string[]; defaultTarget?: string }) => {
        if (d.targets?.length) setAvailableTargets(d.targets);
        if (d.defaultTarget) setDbtTarget(d.defaultTarget);
      })
      .catch(() => {});
  }, []);

  // Ctrl+P / Cmd+P → Global Search
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'p') {
        e.preventDefault();
        setShowGlobalSearch((v) => !v);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  // Warn before browser tab close / refresh when there are unsaved changes
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (openTabs.some((t) => t.isDirty)) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [openTabs]);

  // ── File operations ────────────────────────────────────────────────────────

  const openFile = useCallback(
    async (node: FileNode) => {
      if (node.type !== 'file') return;
      const existing = openTabs.find((t) => t.path === node.path);
      if (existing) { setActiveTab(node.path); return; }
      try {
        const res = await fetch(`/api/file?path=${encodeURIComponent(node.path)}`);
        if (!res.ok) return;
        const { content } = await res.json();
        const ext = node.name.split('.').pop() ?? '';
        const language: OpenFileTab['language'] =
          ext === 'sql' ? 'sql' : ext === 'md' ? 'markdown' : ext === 'csv' ? 'csv' : 'yaml';
        setOpenTabs((prev) => [
          ...prev,
          { path: node.path, name: node.name, content, isDirty: false, language },
        ]);
        setActiveTab(node.path);
      } catch { /* ignore */ }
    },
    [openTabs]
  );

  const openFileByPath = useCallback(
    async (filePath: string) => {
      // filePath from manifest is relative to DBT_ROOT — resolve to an API-accessible path
      const name = filePath.split('/').pop() ?? filePath;
      const ext = name.split('.').pop() ?? '';
      const language: OpenFileTab['language'] =
        ext === 'sql' ? 'sql' : ext === 'md' ? 'markdown' : ext === 'csv' ? 'csv' : 'yaml';
      const existing = openTabs.find((t) => t.path === filePath || t.name === name);
      if (existing) { setActiveTab(existing.path); setShowGlobalSearch(false); return; }
      try {
        const res = await fetch(`/api/file?path=${encodeURIComponent(filePath)}`);
        if (!res.ok) return;
        const { content } = await res.json();
        setOpenTabs((prev) => [...prev, { path: filePath, name, content, isDirty: false, language }]);
        setActiveTab(filePath);
        setShowGlobalSearch(false);
      } catch { /* ignore */ }
    },
    [openTabs]
  );

  const closeTab = useCallback(
    (path: string) => {
      const tab = openTabs.find((t) => t.path === path);
      if (tab?.isDirty) {
        const ok = window.confirm(
          `"${tab.name}" has unsaved changes.\n\nDiscard changes and close?`
        );
        if (!ok) return;
      }
      setOpenTabs((prev) => {
        const idx = prev.findIndex((t) => t.path === path);
        const next = prev.filter((t) => t.path !== path);
        if (activeTab === path)
          setActiveTab(next.length > 0 ? next[Math.min(idx, next.length - 1)].path : null);
        return next;
      });
    },
    [activeTab, openTabs]
  );

  const updateTabContent = useCallback((path: string, content: string) => {
    setOpenTabs((prev) =>
      prev.map((t) => (t.path === path ? { ...t, content, isDirty: true } : t))
    );
  }, []);

  const saveFile = useCallback(
    async (path: string) => {
      const tab = openTabs.find((t) => t.path === path);
      if (!tab) return;
      await fetch('/api/file', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path, content: tab.content }),
      });
      setOpenTabs((prev) => prev.map((t) => (t.path === path ? { ...t, isDirty: false } : t)));
    },
    [openTabs]
  );

  const insertIntoEditor = useCallback(
    (code: string) => {
      if (!activeTab) return;
      const tab = openTabs.find((t) => t.path === activeTab);
      if (!tab) return;
      updateTabContent(activeTab, tab.content + '\n\n' + code);
    },
    [activeTab, openTabs, updateTabContent]
  );

  const handleModelCreated = useCallback(async (sqlPath: string) => {
    setTreeRefreshKey((k) => k + 1);
    setShowModelModal(false);
    try {
      const name = sqlPath.split('/').pop() ?? '';
      const res = await fetch(`/api/file?path=${encodeURIComponent(sqlPath)}`);
      if (!res.ok) return;
      const { content } = await res.json();
      setOpenTabs((prev) => [
        ...prev,
        { path: sqlPath, name, content, isDirty: false, language: 'sql' },
      ]);
      setActiveTab(sqlPath);
    } catch { /* ignore */ }
  }, []);

  // ── dbt commands ───────────────────────────────────────────────────────────

  const runDbt = useCallback((cmd: DbtCommand) => {
    setOutputOpen(true);
    setActiveOutputTab('output');
    setDbtRunning(cmd.label);
    setTimeout(() => {
      outputPanelRef.current?.runCommand({ ...cmd, target: dbtTarget });
    }, 0);
  // dbtTarget is read inside the timeout so include it as dep
  }, [dbtTarget]); // eslint-disable-line react-hooks/exhaustive-deps

  const handlePreview = useCallback(async (filePath: string) => {
    setOutputOpen(true);
    setActiveOutputTab('preview');
    setPreviewLoading(true);
    setPreviewError(null);
    setPreviewResult(null);
    try {
      const res = await fetch('/api/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filePath }),
      });
      const data = await res.json();
      if (!res.ok) {
        setPreviewError(data.error ?? 'Unknown error');
      } else {
        setPreviewResult(data as PreviewResult);
      }
    } catch (err) {
      setPreviewError(err instanceof Error ? err.message : 'Request failed');
    } finally {
      setPreviewLoading(false);
    }
  }, []);

  const handleCompile = useCallback(async (filePath: string) => {
    const res = await fetch('/api/compile', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ filePath }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error ?? 'Compile failed');
    return { sql: data.sql as string, compiledPath: data.compiledPath as string };
  }, []);

  const docsItems = [
    {
      label: 'docs generate',
      description: 'Build catalog.json — required before AI schema refresh & docs site',
      cmd: { command: 'docs', args: ['generate'], label: 'dbt docs generate' },
    },
    {
      label: 'docs serve',
      description: 'Start local docs server → click "Open Docs ↗" in output to browse',
      cmd: { command: 'docs', args: ['serve', '--no-browser'], label: 'dbt docs serve' },
    },
  ];

  const moreItems = [
    {
      label: 'build',
      description: 'Run + test all models in one pass (dbt build)',
      cmd: { command: 'build', args: [], label: 'dbt build' },
    },
    {
      label: 'compile',
      description: 'Render Jinja/refs to SQL — required before Preview Data works',
      cmd: { command: 'compile', args: [], label: 'dbt compile' },
    },
    {
      label: 'source freshness',
      description: 'Check when source tables were last loaded; flags stale sources',
      cmd: { command: 'source', args: ['freshness'], label: 'dbt source freshness' },
    },
    {
      label: 'debug',
      description: 'Verify profiles.yml, Athena connection, and dbt version',
      cmd: { command: 'debug', args: [], label: 'dbt debug' },
    },
    {
      label: 'deps',
      description: 'Install or update dbt packages listed in packages.yml',
      cmd: { command: 'deps', args: [], label: 'dbt deps' },
    },
    {
      label: 'seed',
      description: 'Load CSV files from the seeds/ folder into the warehouse',
      cmd: { command: 'seed', args: [], label: 'dbt seed' },
    },
  ];

  return (
    <div className="flex flex-col h-screen bg-[#1e1e1e] text-[#d4d4d4] overflow-hidden">
      {/* ── Top bar ── */}
      <div className="flex items-center gap-2 px-3 h-10 bg-[#323232] border-b border-[#3e3e42] shrink-0 z-20 overflow-x-auto select-none">
        {/* Brand */}
        <div className="flex items-center gap-1.5 shrink-0">
          <Database size={14} className="text-[#007acc]" />
          <span className="text-sm font-semibold text-white">DBT DataArch Studio</span>
        </div>
        <button
          onClick={() => setShowGitPanel((v) => !v)}
          title="Source Control"
          className={`flex items-center gap-1 px-1.5 py-0.5 rounded transition-colors shrink-0 ${
            showGitPanel
              ? 'bg-[#007acc]/20 text-[#4fc3f7]'
              : 'text-[#8b8b8b] hover:text-[#d4d4d4] hover:bg-[#3e3e42]'
          }`}
        >
          <GitBranch size={11} />
          <span className="text-[10px]">{gitBranch ?? 'git'}</span>
          {gitAhead > 0 && (
            <span className="text-[9px] bg-[#89d185]/20 text-[#89d185] rounded-full px-1 font-medium">
              ↑{gitAhead}
            </span>
          )}
        </button>

        <div className="w-px h-4 bg-[#3e3e42] mx-1 shrink-0" />

        {/* ── Environment target picker ── */}
        <div className="relative shrink-0">
          <button
            onClick={() => setShowTargetMenu((v) => !v)}
            title="Switch dbt target environment"
            className={`flex items-center gap-1.5 px-2 py-0.5 rounded border text-[11px] font-mono font-semibold transition-colors ${
              dbtTarget === 'prod' || dbtTarget === 'production'
                ? 'border-[#f59e0b]/50 bg-[#f59e0b]/10 text-[#f59e0b]'
                : 'border-[#4ade80]/40 bg-[#4ade80]/10 text-[#4ade80]'
            }`}
          >
            <span className={`w-1.5 h-1.5 rounded-full ${
              dbtTarget === 'prod' || dbtTarget === 'production' ? 'bg-[#f59e0b]' : 'bg-[#4ade80]'
            }`} />
            {dbtTarget}
            <ChevronDown size={9} />
          </button>
          {showTargetMenu && (
            <>
              <div className="fixed inset-0 z-30" onClick={() => setShowTargetMenu(false)} />
              <div className="absolute top-7 left-0 z-40 bg-[#252526] border border-[#3e3e42] rounded shadow-xl py-1 min-w-[100px] text-xs">
                {availableTargets.map((t) => (
                  <button
                    key={t}
                    onClick={() => { setDbtTarget(t); setShowTargetMenu(false); }}
                    className={`flex items-center gap-2 w-full px-3 py-1.5 text-left hover:bg-[#2a2d2e] transition-colors ${
                      t === dbtTarget ? 'text-[#d4d4d4] font-semibold' : 'text-[#8b8b8b]'
                    }`}
                  >
                    <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                      t === 'prod' || t === 'production' ? 'bg-[#f59e0b]' : 'bg-[#4ade80]'
                    }`} />
                    {t}
                    {t === dbtTarget && <span className="ml-auto text-[10px] text-[#007acc]">active</span>}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>

        <div className="w-px h-4 bg-[#3e3e42] mx-1 shrink-0" />

        {/* Selected model: run / test + graph — one dropdown on the left */}
        <div
          className="shrink-0 max-w-[200px]"
          title={
            activeModel
              ? `Run or test ${activeModel} (and graph)`
              : 'Open a .sql model tab first'
          }
        >
          <CmdDropdown
            label={
              activeModel
                ? activeModel.length > 16
                  ? `${activeModel.slice(0, 14)}…`
                  : activeModel
                : 'This model'
            }
          icon={
            <span className="flex items-center gap-0.5">
              <Play size={9} fill="currentColor" />
              <FlaskConical size={9} />
            </span>
          }
          items={modelRunTestDropdownItems}
          disabled={!activeModel}
          onCommand={runDbt}
        />
        </div>

        {/* Docs dropdown */}
        <CmdDropdown label="Docs" icon={<BookOpen size={11} />} items={docsItems} onCommand={runDbt} />

        {/* More dropdown */}
        <CmdDropdown label="More" icon={<Wrench size={11} />} items={moreItems} onCommand={runDbt} />

        <div className="w-px h-4 bg-[#3e3e42] mx-1 shrink-0" />

        {/* Lineage button */}
        <button
          onClick={() => setShowLineage(true)}
          title={activeModel ? `Full lineage — ${activeModel} pre-highlighted` : 'View full project lineage'}
          className="flex items-center gap-1 px-2.5 py-1 text-xs rounded text-[#d4d4d4] border border-[#5a5a5a] hover:bg-[#3e3e42] transition-colors shrink-0"
        >
          <GitBranch size={11} />
          Lineage
        </button>
        <button
          onClick={() => setShowSqlEditor(true)}
          title="Open SQL Editor and run Athena queries"
          className="flex items-center gap-1 px-2.5 py-1 text-xs rounded text-[#d4d4d4] border border-[#5a5a5a] hover:bg-[#3e3e42] transition-colors shrink-0"
        >
          <TerminalSquare size={11} />
          SQL Editor
        </button>

        <button
          onClick={() => setShowGlobalSearch(true)}
          title="Global search — models, sources, columns (Ctrl+P)"
          className="flex items-center gap-1 px-2.5 py-1 text-xs rounded text-[#d4d4d4] border border-[#5a5a5a] hover:bg-[#3e3e42] transition-colors shrink-0"
        >
          <Search size={11} />
          Search
        </button>

        <button
          onClick={() => setShowRunHistory(true)}
          title="View run history"
          className="flex items-center gap-1 px-2.5 py-1 text-xs rounded text-[#d4d4d4] border border-[#5a5a5a] hover:bg-[#3e3e42] transition-colors shrink-0"
        >
          <History size={11} />
          History
        </button>

        {/* ── Running indicator ── */}
        {dbtRunning && (
          <div className="flex items-center gap-1.5 px-2.5 py-1 text-xs rounded bg-[#007acc]/20 border border-[#007acc]/40 text-[#4fc3f7] shrink-0 ml-1 animate-pulse">
            <Loader2 size={11} className="animate-spin" />
            <span className="font-mono truncate max-w-[200px]">{dbtRunning}</span>
          </div>
        )}

        <div className="flex-1" />

        {/* Entire project — Run / Test (right side, before create actions) */}
        <div
          className="shrink-0 mr-1"
          title="Run or test the whole dbt project (no --select)"
        >
          <CmdDropdown
            label="Entire project"
            icon={
              <span className="flex items-center gap-0.5">
                <Play size={9} fill="currentColor" />
                <FlaskConical size={9} />
              </span>
            }
            items={PROJECT_RUN_TEST_ITEMS}
            onCommand={runDbt}
          />
        </div>

        <div className="w-px h-4 bg-[#3e3e42] mx-1 shrink-0" />

        {/* Create buttons */}
        <button
          onClick={() => setShowModelModal(true)}
          className="px-2.5 py-1 text-xs bg-[#0e639c] hover:bg-[#1177bb] rounded text-white font-medium transition-colors shrink-0"
        >
          + New Model
        </button>
        <button
          onClick={() => setShowSourceModal(true)}
          className="px-2.5 py-1 text-xs bg-[#1e7e34] hover:bg-[#28a745] rounded text-white font-medium transition-colors shrink-0"
        >
          + New Source
        </button>
        <button
          onClick={() => setShowSeedModal(true)}
          className="px-2.5 py-1 text-xs bg-[#7d6608] hover:bg-[#b8860b] rounded text-white font-medium transition-colors shrink-0"
        >
          + New Seed
        </button>
        <button
          onClick={() => setShowMacrosPanel(true)}
          title="Browse and create dbt macros"
          className="flex items-center gap-1 px-2.5 py-1 text-xs bg-[#6b3fa0] hover:bg-[#7c52b0] rounded text-white font-medium transition-colors shrink-0"
        >
          <Wrench size={11} />
          Macros
        </button>
      </div>

      {/* ── Main 3-pane area + resizable output ── */}
      <div className="flex flex-col flex-1 overflow-hidden min-h-0">
        {/* 3 horizontal panes */}
        <div className="flex flex-1 overflow-hidden min-h-0">
          {/* File explorer */}
          <div style={{ width: explorerWidth, minWidth: 140, maxWidth: 500 }} className="flex flex-col shrink-0 overflow-hidden h-full min-h-0">
            <FileExplorer
              onFileOpen={openFile}
              refreshKey={treeRefreshKey}
              activeFilePath={activeTab}
            />
          </div>

          {/* Drag handle — explorer | editor */}
          <ResizeHandle
            direction="horizontal"
            onDelta={(d) => setExplorerWidth((w) => Math.max(140, Math.min(500, w + d)))}
          />

          {/* Editor */}
          <EditorPane
            tabs={openTabs}
            activeTab={activeTab}
            onTabClick={setActiveTab}
            onTabClose={closeTab}
            onContentChange={updateTabContent}
            onSave={saveFile}
            onPreview={handlePreview}
            onCompile={handleCompile}
          />

          {/* Drag handle — editor | chat */}
          <ResizeHandle
            direction="horizontal"
            onDelta={(d) => setChatWidth((w) => Math.max(200, Math.min(600, w - d)))}
          />

          {/* Chat panel */}
          <div style={{ width: chatWidth, minWidth: 200, maxWidth: 600 }} className="flex flex-col shrink-0 overflow-hidden h-full min-h-0">
            <ChatPanel
              messages={chatMessages}
              onMessagesChange={setChatMessages}
              onInsertCode={insertIntoEditor}
              activeFilePath={activeTab}
              activeFileContent={activeFileTab?.content}
            />
          </div>

          {/* Git panel — slides in from the right */}
          {showGitPanel && (
            <>
              <div className="w-px bg-[#3e3e42] shrink-0" />
              <div className="w-[280px] shrink-0 h-full min-h-0 overflow-hidden">
                <GitPanel
                  onClose={() => setShowGitPanel(false)}
                  onRefreshTree={() => setTreeRefreshKey((k) => k + 1)}
                />
              </div>
            </>
          )}
        </div>

        {/* Drag handle — editor area | output panel */}
        {outputOpen && (
          <ResizeHandle
            direction="vertical"
            onDelta={(d) => setOutputHeight((h) => Math.max(80, Math.min(600, h - d)))}
          />
        )}

        {/* Output panel */}
        <div style={outputOpen ? { height: outputHeight } : { height: 36 }} className="shrink-0 flex flex-col overflow-hidden">
          <OutputPanel
            ref={outputPanelRef}
            open={outputOpen}
            onToggle={() => setOutputOpen((v) => !v)}
            dbtTarget={dbtTarget}
            onCommandComplete={(payload: CommandCompletePayload) => {
              const { exitCode, durationMs, label, target, lines } = payload;
              setDbtRunning(null);
              if (/^dbt\s+test\b/.test(label) || /^dbt\s+build\b/.test(label)) {
                setActiveOutputTab('tests');
              } else if (/^dbt\s+source\b.*freshness|^dbt\s+.*freshness/.test(label)) {
                setActiveOutputTab('freshness');
              }
              // Save to run history
              const status = exitCode === 0 ? 'success' : 'failed';
              const summary = [...lines].reverse().find(l => l.text.trim())?.text ?? '';
              const entry = {
                id: `run-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
                command: label,
                target,
                startedAt: new Date(Date.now() - durationMs).toISOString(),
                durationMs,
                exitCode,
                status,
                summary,
                lines,
              };
              fetch('/api/runs', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(entry),
              }).catch(() => {});
            }}
            previewResult={previewResult}
            previewLoading={previewLoading}
            previewError={previewError}
            activeOutputTab={activeOutputTab}
            onOutputTabChange={setActiveOutputTab}
          />
        </div>
      </div>

      {/* ── Modals ── */}
      {showModelModal && (
        <CreateModelModal
          onClose={() => setShowModelModal(false)}
          onCreated={handleModelCreated}
        />
      )}
      {showSourceModal && (
        <CreateSourceModal
          onClose={() => setShowSourceModal(false)}
          onCreated={async (filePath) => {
            setTreeRefreshKey((k) => k + 1);
            setShowSourceModal(false);
            // Refresh the tab in-place if it's already open, or open it fresh
            try {
              const res = await fetch(`/api/file?path=${encodeURIComponent(filePath)}`);
              if (!res.ok) return;
              const { content } = await res.json();
              const name = filePath.split('/').pop() ?? filePath;
              setOpenTabs((prev) => {
                const existing = prev.find((t) => t.path === filePath);
                if (existing) {
                  // Silently update content and clear dirty flag
                  return prev.map((t) =>
                    t.path === filePath ? { ...t, content, isDirty: false } : t
                  );
                }
                // Not open yet — open it as a new tab
                return [...prev, { path: filePath, name, content, isDirty: false, language: 'yaml' as const }];
              });
              setActiveTab(filePath);
            } catch { /* ignore */ }
          }}
        />
      )}

      {showSeedModal && (
        <CreateSeedModal
          onClose={() => setShowSeedModal(false)}
          onCreated={async (filePath) => {
            setTreeRefreshKey((k) => k + 1);
            setShowSeedModal(false);
            try {
              const res = await fetch(`/api/file?path=${encodeURIComponent(filePath)}`);
              if (!res.ok) return;
              const { content } = await res.json();
              const name = filePath.split('/').pop() ?? filePath;
              setOpenTabs((prev) => {
                const existing = prev.find((t) => t.path === filePath);
                if (existing) return prev.map((t) => t.path === filePath ? { ...t, content, isDirty: false } : t);
                const lang: OpenFileTab['language'] = filePath.endsWith('.csv') ? 'csv' : 'yaml';
                return [...prev, { path: filePath, name, content, isDirty: false, language: lang }];
              });
              setActiveTab(filePath);
            } catch { /* ignore */ }
          }}
        />
      )}

      {showLineage && (
        <LineageView
          modelName={activeModel}
          onClose={() => setShowLineage(false)}
          onOpenModel={(filePath, name) => {
            setShowLineage(false);
            openFile({ name, path: filePath, type: 'file' });
          }}
        />
      )}
      {showSqlEditor && (
        <SqlEditorPanel onClose={() => setShowSqlEditor(false)} />
      )}

      {showGlobalSearch && (
        <GlobalSearch
          onClose={() => setShowGlobalSearch(false)}
          onOpenFile={openFileByPath}
        />
      )}

      {showMacrosPanel && (
        <MacrosPanel
          onClose={() => setShowMacrosPanel(false)}
          onOpenFile={(filePath) => {
            setShowMacrosPanel(false);
            void openFileByPath(filePath);
          }}
        />
      )}

      {showRunHistory && (
        <RunHistoryPanel
          onClose={() => setShowRunHistory(false)}
          onRerun={(cmdLabel) => {
            setShowRunHistory(false);
            // Parse "dbt <command>" form back to a runnable DbtCommand
            const parts = cmdLabel.replace(/^dbt\s+/, '').split(/\s+/);
            const command = parts[0] ?? 'run';
            const selectIdx = parts.indexOf('--select');
            const modelName = selectIdx !== -1 ? parts[selectIdx + 1] : undefined;
            const restArgs = parts.slice(1).filter((_, i, arr) =>
              arr[i - 1] !== '--select' && arr[i] !== '--select' && arr[i] !== modelName
            );
            runDbt({ command, args: restArgs, modelName, label: cmdLabel });
          }}
        />
      )}
    </div>
  );
}

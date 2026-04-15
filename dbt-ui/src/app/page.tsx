'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import FileExplorer from '@/components/FileExplorer';
import EditorPane from '@/components/EditorPane';
import ChatPanel from '@/components/ChatPanel';
import CreateModelModal from '@/components/CreateModelModal';
import CreateSourceModal from '@/components/CreateSourceModal';
import OutputPanel, { type DbtCommand, type PreviewResult } from '@/components/OutputPanel';
import ResizeHandle from '@/components/ResizeHandle';
import type { FileNode, OpenFileTab, ChatMessage } from '@/types';
import {
  Database,
  GitBranch,
  Play,
  FlaskConical,
  Wrench,
  BookOpen,
  ChevronDown,
  Zap,
} from 'lucide-react';

// ─── Small helpers ───────────────────────────────────────────────────────────

function modelNameFromPath(p: string | null | undefined): string | null {
  if (!p) return null;
  const m = p.match(/([^/\\]+)\.sql$/);
  return m ? m[1] : null;
}

// Dropdown button (e.g. "Docs ▾")
function CmdDropdown({
  label,
  icon,
  items,
  disabled,
}: {
  label: string;
  icon: React.ReactNode;
  items: { label: string; cmd: DbtCommand }[];
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Close on outside click
  const handleBlur = () => setTimeout(() => setOpen(false), 150);

  return (
    <div ref={ref} className="relative" onBlur={handleBlur}>
      <button
        disabled={disabled}
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1 px-2.5 py-1 text-xs rounded text-[#d4d4d4] border border-[#5a5a5a] hover:bg-[#3e3e42] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
      >
        {icon}
        {label}
        <ChevronDown size={10} className="ml-0.5" />
      </button>
      {open && (
        <div className="absolute top-full left-0 mt-1 bg-[#252526] border border-[#3e3e42] rounded shadow-xl z-50 min-w-[160px]">
          {items.map((item) => (
            <button
              key={item.label}
              // items[i].cmd is read by parent via onClick
              data-cmd={JSON.stringify(item.cmd)}
              onClick={(e) => {
                setOpen(false);
                // bubble up as custom event
                const el = e.currentTarget;
                el.dispatchEvent(new CustomEvent('dbt-cmd', { bubbles: true, detail: item.cmd }));
              }}
              className="block w-full text-left px-3 py-1.5 text-xs text-[#d4d4d4] hover:bg-[#3e3e42] transition-colors"
            >
              {item.label}
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
  const [treeRefreshKey, setTreeRefreshKey] = useState(0);
  const [outputOpen, setOutputOpen] = useState(false);
  // Each command object is wrapped with a unique ts so re-running the same
  // command triggers a fresh useEffect in OutputPanel
  const [pendingCommand, setPendingCommand] = useState<(DbtCommand & { _ts: number }) | null>(null);
  // Preview state
  const [previewResult, setPreviewResult] = useState<PreviewResult | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [activeOutputTab, setActiveOutputTab] = useState<'output' | 'preview'>('output');
  // Resizable panel dimensions
  const [explorerWidth, setExplorerWidth] = useState(240);
  const [chatWidth, setChatWidth] = useState(320);
  const [outputHeight, setOutputHeight] = useState(220);

  const activeModel = modelNameFromPath(activeTab);
  const activeFileTab = openTabs.find((t) => t.path === activeTab);

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
          ext === 'sql' ? 'sql' : ext === 'md' ? 'markdown' : 'yaml';
        setOpenTabs((prev) => [
          ...prev,
          { path: node.path, name: node.name, content, isDirty: false, language },
        ]);
        setActiveTab(node.path);
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
    setPendingCommand({ ...cmd, _ts: Date.now() });
  }, []);

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

  // Catch the custom event bubbled from CmdDropdown items
  const handleDropdownCmd = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      const target = e.target as HTMLElement;
      const btn = target.closest('[data-cmd]') as HTMLElement | null;
      if (!btn) return;
      try {
        const cmd = JSON.parse(btn.dataset.cmd ?? '{}') as DbtCommand;
        runDbt(cmd);
      } catch { /* ignore */ }
    },
    [runDbt]
  );

  const docsItems = [
    { label: 'docs generate', cmd: { command: 'docs', args: ['generate'], label: 'dbt docs generate' } },
    { label: 'docs serve', cmd: { command: 'docs', args: ['serve'], label: 'dbt docs serve' } },
  ];

  const moreItems = [
    { label: 'source freshness', cmd: { command: 'source', args: ['freshness'], label: 'dbt source freshness' } },
    { label: 'compile', cmd: { command: 'compile', args: [], label: 'dbt compile' } },
    { label: 'debug', cmd: { command: 'debug', args: [], label: 'dbt debug' } },
    { label: 'deps', cmd: { command: 'deps', args: [], label: 'dbt deps' } },
  ];

  return (
    // Capture bubbled dbt-cmd custom events from dropdowns
    <div
      className="flex flex-col h-screen bg-[#1e1e1e] text-[#d4d4d4] overflow-hidden"
      onClick={handleDropdownCmd}
    >
      {/* ── Top bar ── */}
      <div className="flex items-center gap-2 px-3 h-10 bg-[#323232] border-b border-[#3e3e42] shrink-0 z-20 overflow-x-auto select-none">
        {/* Brand */}
        <div className="flex items-center gap-1.5 shrink-0">
          <Database size={14} className="text-[#007acc]" />
          <span className="text-sm font-semibold text-white">DBT Studio</span>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <GitBranch size={10} className="text-[#8b8b8b]" />
          <span className="text-[10px] text-[#8b8b8b]">mursion_dbt_athena</span>
        </div>

        <div className="w-px h-4 bg-[#3e3e42] mx-1 shrink-0" />

        {/* ── dbt command buttons ── */}
        {/* Run all */}
        <button
          onClick={() => runDbt({ command: 'run', args: [], label: 'dbt run' })}
          title="dbt run"
          className="flex items-center gap-1 px-2.5 py-1 text-xs rounded text-white bg-[#0e639c] hover:bg-[#1177bb] transition-colors shrink-0"
        >
          <Play size={11} fill="currentColor" /> Run
        </button>

        {/* Run model */}
        <button
          disabled={!activeModel}
          onClick={() =>
            runDbt({
              command: 'run',
              args: [],
              modelName: activeModel!,
              label: `dbt run --select ${activeModel}`,
            })
          }
          title={activeModel ? `dbt run --select ${activeModel}` : 'Open a .sql model first'}
          className="flex items-center gap-1 px-2.5 py-1 text-xs rounded text-[#d4d4d4] border border-[#5a5a5a] hover:bg-[#3e3e42] disabled:opacity-40 disabled:cursor-not-allowed transition-colors shrink-0"
        >
          <Zap size={11} />
          {activeModel ? `Run ${activeModel}` : 'Run Model'}
        </button>

        {/* Test all */}
        <button
          onClick={() => runDbt({ command: 'test', args: [], label: 'dbt test' })}
          title="dbt test"
          className="flex items-center gap-1 px-2.5 py-1 text-xs rounded text-[#d4d4d4] border border-[#5a5a5a] hover:bg-[#3e3e42] transition-colors shrink-0"
        >
          <FlaskConical size={11} /> Test
        </button>

        {/* Test model */}
        <button
          disabled={!activeModel}
          onClick={() =>
            runDbt({
              command: 'test',
              args: [],
              modelName: activeModel!,
              label: `dbt test --select ${activeModel}`,
            })
          }
          title={activeModel ? `dbt test --select ${activeModel}` : 'Open a .sql model first'}
          className="flex items-center gap-1 px-2.5 py-1 text-xs rounded text-[#d4d4d4] border border-[#5a5a5a] hover:bg-[#3e3e42] disabled:opacity-40 disabled:cursor-not-allowed transition-colors shrink-0"
        >
          <FlaskConical size={11} />
          {activeModel ? `Test ${activeModel}` : 'Test Model'}
        </button>

        {/* Docs dropdown */}
        <CmdDropdown label="Docs" icon={<BookOpen size={11} />} items={docsItems} />

        {/* More dropdown */}
        <CmdDropdown label="More" icon={<Wrench size={11} />} items={moreItems} />

        <div className="flex-1" />

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
            open={outputOpen}
            onToggle={() => setOutputOpen((v) => !v)}
            pendingCommand={pendingCommand}
            onCommandComplete={() => { /* intentionally empty — OutputPanel uses a ref internally */ }}
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
          onCreated={() => {
            setTreeRefreshKey((k) => k + 1);
            setShowSourceModal(false);
          }}
        />
      )}
    </div>
  );
}

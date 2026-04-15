'use client';

import dynamic from 'next/dynamic';
import { useCallback, useEffect } from 'react';
import { X, Save, FileCode, Eye } from 'lucide-react';
import type { OpenFileTab } from '@/types';

const MonacoEditor = dynamic(() => import('@monaco-editor/react'), { ssr: false });

interface Props {
  tabs: OpenFileTab[];
  activeTab: string | null;
  onTabClick: (path: string) => void;
  onTabClose: (path: string) => void;
  onContentChange: (path: string, content: string) => void;
  onSave: (path: string) => void;
  onPreview?: (filePath: string) => void;
}

export default function EditorPane({
  tabs,
  activeTab,
  onTabClick,
  onTabClose,
  onContentChange,
  onSave,
  onPreview,
}: Props) {
  const activeFileTab = tabs.find((t) => t.path === activeTab);

  // Cmd/Ctrl + S to save
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 's') {
        e.preventDefault();
        if (activeTab) onSave(activeTab);
      }
    },
    [activeTab, onSave]
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

  return (
    <div className="flex-1 flex flex-col bg-[#1e1e1e] overflow-hidden min-w-0">
      {/* Tab bar */}
      <div className="flex bg-[#252526] border-b border-[#3e3e42] overflow-x-auto shrink-0 select-none">
        {tabs.map((tab) => {
          const isActive = tab.path === activeTab;
          return (
            <div
              key={tab.path}
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

      {/* Breadcrumb + actions */}
      {activeFileTab && (
        <div className="flex items-center justify-between px-3 py-1 bg-[#1e1e1e] border-b border-[#3e3e42] shrink-0">
          <span className="text-xs text-[#6e6e6e] font-mono truncate">{activeFileTab.path}</span>
          <div className="flex items-center gap-1 shrink-0">
            {/* Preview Data — only for .sql files */}
            {activeFileTab.path.endsWith('.sql') && onPreview && (
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
              disabled={!activeFileTab.isDirty}
              className="flex items-center gap-1 text-xs text-[#8b8b8b] hover:text-[#d4d4d4] disabled:opacity-30 disabled:cursor-not-allowed px-2 py-0.5 rounded hover:bg-[#3e3e42] transition-colors"
              title="Save (⌘S)"
            >
              <Save size={11} />
              {activeFileTab.isDirty ? 'Save' : 'Saved'}
            </button>
          </div>
        </div>
      )}

      {/* Monaco Editor */}
      {activeFileTab && (
        <div className="flex-1 overflow-hidden">
          <MonacoEditor
            key={activeFileTab.path}
            height="100%"
            language={activeFileTab.language === 'yaml' ? 'yaml' : activeFileTab.language}
            value={activeFileTab.content}
            theme="vs-dark"
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
            }}
          />
        </div>
      )}
    </div>
  );
}

'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  ChevronRight,
  ChevronDown,
  Folder,
  FolderOpen,
  FileCode,
  FileText,
  RefreshCw,
} from 'lucide-react';
import type { FileNode } from '@/types';

const POLL_INTERVAL_MS = 5_000; // re-fetch tree every 5 seconds

interface Props {
  onFileOpen: (node: FileNode) => void;
  refreshKey: number;
  activeFilePath: string | null;
  /** If the file is open with unsaved changes, delete will ask to discard first. */
  isFileDirty?: (path: string) => boolean;
  onFileDeleted?: (path: string) => void;
  onFileRenamed?: (oldPath: string, newPath: string) => void;
}

function FileIcon({ name }: { name: string }) {
  const ext = name.split('.').pop();
  if (ext === 'sql') return <FileCode size={13} className="text-[#569cd6] shrink-0" />;
  if (ext === 'yml' || ext === 'yaml') return <FileText size={13} className="text-[#4ec9b0] shrink-0" />;
  if (ext === 'md') return <FileText size={13} className="text-[#ce9178] shrink-0" />;
  return <FileText size={13} className="text-[#8b8b8b] shrink-0" />;
}

function FolderLabel({ name }: { name: string }) {
  const colorMap: Record<string, string> = {
    models: 'text-[#dcb67a]',
    sources: 'text-[#4ec9b0]',
    marts: 'text-[#c586c0]',
    warehouse: 'text-[#569cd6]',
    utility: 'text-[#f7c948]',
    staging: 'text-[#9cdcfe]',
    intermediate: 'text-[#ce9178]',
    macros: 'text-[#dcdcaa]',
    seeds: 'text-[#b5cea8]',
    snapshots: 'text-[#f48771]',
    tests: 'text-[#f44747]',
    target: 'text-[#808080]',
  };
  return (
    <span className={`text-xs ml-0.5 ${colorMap[name] ?? 'text-[#d4d4d4]'}`}>{name}</span>
  );
}

interface TreeNodeProps {
  node: FileNode;
  depth: number;
  onFileOpen: (node: FileNode) => void;
  onFileContextMenu?: (e: React.MouseEvent, node: FileNode) => void;
  activeFilePath: string | null;
  defaultOpen?: boolean;
}

function TreeNode({
  node,
  depth,
  onFileOpen,
  onFileContextMenu,
  activeFilePath,
  defaultOpen = false,
}: TreeNodeProps) {
  const [expanded, setExpanded] = useState(defaultOpen || depth < 1);
  const isActive = node.type === 'file' && node.path === activeFilePath;

  if (node.type === 'directory') {
    return (
      <div>
        <div
          className="flex items-center gap-1 py-[3px] px-1 cursor-pointer hover:bg-[#2a2d2e] rounded select-none group"
          style={{ paddingLeft: `${depth * 14 + 4}px` }}
          onClick={() => setExpanded((v) => !v)}
        >
          <span className="shrink-0 text-[#8b8b8b]">
            {expanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
          </span>
          <span className="shrink-0 text-[#dcb67a]">
            {expanded ? <FolderOpen size={13} /> : <Folder size={13} />}
          </span>
          <FolderLabel name={node.name} />
        </div>
        {expanded &&
          node.children?.map((child) => (
            <TreeNode
              key={child.path}
              node={child}
              depth={depth + 1}
              onFileOpen={onFileOpen}
              onFileContextMenu={onFileContextMenu}
              activeFilePath={activeFilePath}
            />
          ))}
      </div>
    );
  }

  return (
    <div
      className={`flex items-center gap-1.5 py-[3px] px-1 cursor-pointer rounded select-none ${
        isActive ? 'bg-[#094771] text-white' : 'hover:bg-[#2a2d2e] text-[#d4d4d4]'
      }`}
      style={{ paddingLeft: `${depth * 14 + 20}px` }}
      onClick={() => onFileOpen(node)}
      onContextMenu={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onFileContextMenu?.(e, node);
      }}
      title={node.path}
    >
      <FileIcon name={node.name} />
      <span className="text-xs truncate">{node.name}</span>
    </div>
  );
}

type CtxMenu = { x: number; y: number; node: FileNode } | null;

export default function FileExplorer({
  onFileOpen,
  refreshKey,
  activeFilePath,
  isFileDirty,
  onFileDeleted,
  onFileRenamed,
}: Props) {
  const [tree, setTree] = useState<FileNode | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastSynced, setLastSynced] = useState<Date | null>(null);
  const treeRef = useRef<string>(''); // serialised tree for change detection
  const [ctxMenu, setCtxMenu] = useState<CtxMenu>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const closeCtxMenu = useCallback(() => setCtxMenu(null), []);

  const fetchTree = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const res = await fetch('/api/tree');
      const data: FileNode = await res.json();
      const serialised = JSON.stringify(data);
      // Only update state when the tree actually changed
      if (serialised !== treeRef.current) {
        treeRef.current = serialised;
        setTree(data);
      }
      setLastSynced(new Date());
    } catch {
      // ignore network hiccups
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  // Initial load + re-fetch when parent triggers a refresh (e.g. file created)
  useEffect(() => {
    fetchTree(false);
  }, [refreshKey, fetchTree]);

  // Background polling — detects manual changes to models/ without needing a button press
  useEffect(() => {
    const id = setInterval(() => fetchTree(true), POLL_INTERVAL_MS);
    return () => clearInterval(id);
  }, [fetchTree]);

  // Close context menu: outside click, Escape, scroll
  useEffect(() => {
    if (!ctxMenu) return;
    const onDocMouseDown = (e: MouseEvent) => {
      if (menuRef.current?.contains(e.target as Node)) return;
      closeCtxMenu();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeCtxMenu();
    };
    const onScroll = () => closeCtxMenu();
    document.addEventListener('mousedown', onDocMouseDown, true);
    document.addEventListener('keydown', onKey);
    window.addEventListener('scroll', onScroll, true);
    return () => {
      document.removeEventListener('mousedown', onDocMouseDown, true);
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('scroll', onScroll, true);
    };
  }, [ctxMenu, closeCtxMenu]);

  const handleFileContextMenu = useCallback((e: React.MouseEvent, node: FileNode) => {
    if (node.type !== 'file') return;
    setCtxMenu({ x: e.clientX, y: e.clientY, node });
  }, []);

  const runDelete = async (path: string, name: string) => {
    if (isFileDirty?.(path)) {
      const ok = window.confirm(
        `"${name}" has unsaved changes.\n\nDelete file from disk and discard editor changes?`
      );
      if (!ok) return;
    } else {
      const ok = window.confirm(`Delete "${name}"?\n\nThis cannot be undone.`);
      if (!ok) return;
    }
    try {
      const res = await fetch(`/api/file?path=${encodeURIComponent(path)}`, { method: 'DELETE' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        window.alert((data as { error?: string }).error ?? `Delete failed (${res.status})`);
        return;
      }
      closeCtxMenu();
      onFileDeleted?.(path);
    } catch {
      window.alert('Delete failed (network error)');
    }
  };

  const runRename = async (path: string, currentName: string) => {
    const next = window.prompt('New file name (same extension)', currentName);
    if (next == null) return;
    const trimmed = next.trim();
    if (!trimmed || trimmed === currentName) {
      closeCtxMenu();
      return;
    }
    if (trimmed.includes('/') || trimmed.includes('\\')) {
      window.alert('Use a file name only, no path separators.');
      return;
    }
    try {
      const res = await fetch('/api/file', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path, newName: trimmed }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string; newPath?: string };
      if (!res.ok) {
        window.alert(data.error ?? `Rename failed (${res.status})`);
        return;
      }
      if (data.newPath) {
        closeCtxMenu();
        onFileRenamed?.(path, data.newPath);
      }
    } catch {
      window.alert('Rename failed (network error)');
    }
  };

  return (
    <div className="w-full h-full bg-[#252526] border-r border-[#3e3e42] flex flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-[#3e3e42] shrink-0">
        <span className="text-[10px] font-semibold text-[#bdbdbd] uppercase tracking-widest">
          Explorer
        </span>
        <button
          onClick={() => void fetchTree()}
          title="Refresh"
          className="text-[#8b8b8b] hover:text-[#d4d4d4] p-0.5 rounded hover:bg-[#3e3e42] transition-colors"
        >
          <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      {/* Tree */}
      <div className="flex-1 overflow-y-auto py-1 text-[#d4d4d4]">
        {loading ? (
          <div className="flex items-center gap-2 px-3 py-2 text-xs text-[#8b8b8b]">
            <RefreshCw size={12} className="animate-spin" />
            Loading...
          </div>
        ) : tree ? (
          tree.children?.map((node) => (
            <TreeNode
              key={node.path}
              node={node}
              depth={0}
              onFileOpen={onFileOpen}
              onFileContextMenu={handleFileContextMenu}
              activeFilePath={activeFilePath}
              defaultOpen={node.name === 'models'}
            />
          ))
        ) : (
          <div className="text-xs text-[#8b8b8b] px-3 py-2">No files found</div>
        )}
      </div>

      {/* Footer: project root + last synced */}
      <div className="px-3 py-1.5 border-t border-[#3e3e42] shrink-0">
        <p className="text-[10px] text-[#5a5a5a] truncate" title="Project root">
          {tree?.name ?? '...'}
        </p>
        {lastSynced && (
          <p className="text-[9px] text-[#3e3e42] mt-0.5">
            synced {lastSynced.toLocaleTimeString()}
          </p>
        )}
      </div>

      {ctxMenu && ctxMenu.node.type === 'file' && (
        <div
          ref={menuRef}
          role="menu"
          className="fixed z-[10000] min-w-[140px] rounded border border-[#3e3e42] bg-[#252526] py-0.5 shadow-xl text-xs"
          style={{ left: ctxMenu.x, top: ctxMenu.y }}
        >
          <button
            type="button"
            role="menuitem"
            className="block w-full px-3 py-1.5 text-left text-[#d4d4d4] hover:bg-[#3e3e42]"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => runRename(ctxMenu.node.path, ctxMenu.node.name)}
          >
            Rename…
          </button>
          <button
            type="button"
            role="menuitem"
            className="block w-full px-3 py-1.5 text-left text-[#f48771] hover:bg-[#3e3e42]"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => runDelete(ctxMenu.node.path, ctxMenu.node.name)}
          >
            Delete
          </button>
        </div>
      )}
    </div>
  );
}

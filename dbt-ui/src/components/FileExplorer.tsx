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
  activeFilePath: string | null;
  defaultOpen?: boolean;
}

function TreeNode({ node, depth, onFileOpen, activeFilePath, defaultOpen = false }: TreeNodeProps) {
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
      title={node.path}
    >
      <FileIcon name={node.name} />
      <span className="text-xs truncate">{node.name}</span>
    </div>
  );
}

export default function FileExplorer({ onFileOpen, refreshKey, activeFilePath }: Props) {
  const [tree, setTree] = useState<FileNode | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastSynced, setLastSynced] = useState<Date | null>(null);
  const treeRef = useRef<string>(''); // serialised tree for change detection

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

  return (
    <div className="w-full h-full bg-[#252526] border-r border-[#3e3e42] flex flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-[#3e3e42] shrink-0">
        <span className="text-[10px] font-semibold text-[#bdbdbd] uppercase tracking-widest">
          Explorer
        </span>
        <button
          onClick={fetchTree}
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
    </div>
  );
}

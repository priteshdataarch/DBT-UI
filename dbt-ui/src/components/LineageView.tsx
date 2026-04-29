'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import {
  X, GitBranch, Loader2, AlertCircle, Database,
  Table2, ZoomIn, ZoomOut, Maximize2, RefreshCw,
} from 'lucide-react';
import type { LineageNode, LineageEdge } from '@/app/api/lineage/route';

interface Props {
  /** If provided, that model is pre-highlighted when the graph opens */
  modelName?: string | null;
  onClose: () => void;
  onOpenModel: (filePath: string, name: string) => void;
}

// ── Layout constants ───────────────────────────────────────────────────────
const NODE_W = 190;
const NODE_H = 42;
const H_GAP = 90;
const V_GAP = 12;
const PAD = 60;

interface Viewport { x: number; y: number; scale: number }
interface PositionedNode extends LineageNode { x: number; y: number }

// ── Layout ─────────────────────────────────────────────────────────────────
function computeLayout(nodes: LineageNode[]) {
  const levels = new Map<number, LineageNode[]>();
  for (const n of nodes) {
    if (!levels.has(n.level)) levels.set(n.level, []);
    levels.get(n.level)!.push(n);
  }
  const sortedLevels = Array.from(levels.keys()).sort((a, b) => a - b);

  const colX = new Map<number, number>();
  let curX = PAD;
  for (const lvl of sortedLevels) {
    colX.set(lvl, curX);
    curX += NODE_W + H_GAP;
  }

  const maxColSize = Math.max(...Array.from(levels.values()).map(a => a.length));
  const totalH = maxColSize * (NODE_H + V_GAP) - V_GAP;

  const positioned: PositionedNode[] = [];
  for (const lvl of sortedLevels) {
    const col = [...levels.get(lvl)!].sort((a, b) => a.name.localeCompare(b.name));
    const colH = col.length * (NODE_H + V_GAP) - V_GAP;
    const startY = PAD + (totalH - colH) / 2;
    col.forEach((n, i) =>
      positioned.push({ ...n, x: colX.get(lvl)!, y: startY + i * (NODE_H + V_GAP) })
    );
  }

  return { positioned, svgW: curX - H_GAP + PAD, svgH: totalH + PAD * 2 };
}

// ── Path helpers ───────────────────────────────────────────────────────────
function getPathIds(nodeId: string, edges: LineageEdge[]): Set<string> {
  const ids = new Set([nodeId]);
  const walkUp = (id: string) => edges.forEach(e => {
    if (e.target === id && !ids.has(e.source)) { ids.add(e.source); walkUp(e.source); }
  });
  const walkDown = (id: string) => edges.forEach(e => {
    if (e.source === id && !ids.has(e.target)) { ids.add(e.target); walkDown(e.target); }
  });
  walkUp(nodeId);
  walkDown(nodeId);
  return ids;
}

// ── Colours ────────────────────────────────────────────────────────────────
function nodeColors(node: LineageNode, highlight: 'focus' | 'path' | 'dim' | 'normal') {
  if (highlight === 'dim') return { fill: '#1a1a1a', stroke: '#2a2a2a', strokeW: 1, text: '#3a3a3a', accent: '#2a2a2a' };
  if (highlight === 'focus') return { fill: '#0e639c', stroke: '#4fc3f7', strokeW: 2.5, text: '#ffffff', accent: '#4fc3f7' };
  if (node.type === 'source') {
    const bright = highlight === 'path';
    return { fill: bright ? '#0d3b2a' : '#0a2018', stroke: bright ? '#4ec9b0' : '#1e6b50', strokeW: bright ? 2 : 1, text: bright ? '#4ec9b0' : '#2a8c6a', accent: bright ? '#4ec9b0' : '#1e6b50' };
  }
  if (highlight === 'path') return { fill: '#152840', stroke: '#569cd6', strokeW: 2, text: '#9cdcfe', accent: '#569cd6' };
  return { fill: '#252526', stroke: '#3e3e42', strokeW: 1, text: '#8a8a8a', accent: '#3e3e42' };
}

function NodeIcon({ type }: { type: LineageNode['type'] }) {
  if (type === 'source') return <Database size={11} />;
  if (type === 'seed') return <Table2 size={11} />;
  return <GitBranch size={11} />;
}

// ── Edge ───────────────────────────────────────────────────────────────────
function Edge({ edge, posMap, state }: {
  edge: LineageEdge;
  posMap: Map<string, PositionedNode>;
  state: 'path' | 'dim' | 'normal';
}) {
  const s = posMap.get(edge.source), t = posMap.get(edge.target);
  if (!s || !t) return null;
  const x1 = s.x + NODE_W, y1 = s.y + NODE_H / 2;
  const x2 = t.x, y2 = t.y + NODE_H / 2;
  const cx = (x1 + x2) / 2;
  const color = state === 'path' ? '#569cd6' : state === 'dim' ? '#252526' : '#353535';
  const sw = state === 'path' ? 2 : 1;
  return (
    <g opacity={state === 'dim' ? 0.15 : 1}>
      <path d={`M${x1} ${y1} C${cx} ${y1},${cx} ${y2},${x2} ${y2}`}
        fill="none" stroke={color} strokeWidth={sw} />
      <polygon points={`${x2},${y2} ${x2 - 6},${y2 - 3.5} ${x2 - 6},${y2 + 3.5}`} fill={color} />
    </g>
  );
}

// ── Component ──────────────────────────────────────────────────────────────
export default function LineageView({ modelName, onClose, onOpenModel }: Props) {
  const [nodes, setNodes] = useState<LineageNode[]>([]);
  const [edges, setEdges] = useState<LineageEdge[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [vp, setVp] = useState<Viewport>({ x: 0, y: 0, scale: 1 });
  const [tooltip, setTooltip] = useState<{ text: string; cx: number; cy: number } | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const dragRef = useRef<{ sx: number; sy: number; vx: number; vy: number } | null>(null);

  // ── Fetch full graph ──────────────────────────────────────────────────────
  const fetchLineage = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/lineage');
      const data = await res.json();
      if (!res.ok || data.error) { setError(data.error ?? 'Failed to load lineage'); return; }
      setNodes(data.nodes);
      setEdges(data.edges);
      // Pre-select the active model if provided
      if (modelName) {
        const match = (data.nodes as LineageNode[]).find(
          n => n.name === modelName && n.type === 'model'
        );
        if (match) setSelectedId(match.id);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Network error');
    } finally {
      setLoading(false);
    }
  }, [modelName]);

  useEffect(() => { fetchLineage(); }, [fetchLineage]);

  // ── Auto-fit ──────────────────────────────────────────────────────────────
  const fitToScreen = useCallback(() => {
    if (!svgRef.current || nodes.length === 0) return;
    const { svgW, svgH } = computeLayout(nodes);
    const rect = svgRef.current.getBoundingClientRect();
    const scale = Math.min(rect.width / svgW, rect.height / svgH) * 0.93;
    setVp({ x: (rect.width - svgW * scale) / 2, y: (rect.height - svgH * scale) / 2, scale });
  }, [nodes]);

  useEffect(() => { if (!loading && nodes.length > 0) fitToScreen(); }, [loading, nodes, fitToScreen]);

  // ── Keyboard ──────────────────────────────────────────────────────────────
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key === 'Escape') selectedId ? setSelectedId(null) : onClose();
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onClose, selectedId]);

  // ── Wheel zoom ────────────────────────────────────────────────────────────
  const handleWheel = useCallback((e: React.WheelEvent<SVGSVGElement>) => {
    e.preventDefault();
    const factor = e.deltaY < 0 ? 1.12 : 1 / 1.12;
    const rect = svgRef.current!.getBoundingClientRect();
    const mx = e.clientX - rect.left, my = e.clientY - rect.top;
    setVp(v => {
      const ns = Math.max(0.08, Math.min(4, v.scale * factor));
      const r = ns / v.scale;
      return { scale: ns, x: mx - (mx - v.x) * r, y: my - (my - v.y) * r };
    });
  }, []);

  // ── Pan ───────────────────────────────────────────────────────────────────
  const onMD = (e: React.MouseEvent<SVGSVGElement>) => {
    if ((e.target as Element).closest('[data-node]')) return;
    dragRef.current = { sx: e.clientX, sy: e.clientY, vx: vp.x, vy: vp.y };
    e.currentTarget.style.cursor = 'grabbing';
  };
  const onMM = (e: React.MouseEvent<SVGSVGElement>) => {
    const drag = dragRef.current;
    if (!drag) return;
    // Capture drag values synchronously before the async state updater runs,
    // so the ref can't be nulled by onMU between now and when React processes the update.
    const { vx, vy, sx, sy } = drag;
    setVp(v => ({ ...v, x: vx + e.clientX - sx, y: vy + e.clientY - sy }));
  };
  const onMU = (e: React.MouseEvent<SVGSVGElement>) => { dragRef.current = null; e.currentTarget.style.cursor = 'grab'; };
  const zoom = (d: number) => setVp(v => ({ ...v, scale: Math.max(0.08, Math.min(4, v.scale * d)) }));

  // ── Layout + state ────────────────────────────────────────────────────────
  const { positioned, svgW, svgH } = nodes.length > 0
    ? computeLayout(nodes)
    : { positioned: [], svgW: 0, svgH: 0 };

  const posMap = new Map(positioned.map(n => [n.id, n]));
  const pathIds = selectedId ? getPathIds(selectedId, edges) : null;

  const selectedNode = selectedId ? posMap.get(selectedId) : null;

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-[#181818]">
      {/* ── Header ── */}
      <div className="flex items-center gap-2 px-4 h-11 bg-[#1f1f1f] border-b border-[#2e2e2e] shrink-0 select-none">
        <GitBranch size={14} className="text-[#569cd6]" />
        <span className="text-sm font-semibold text-[#d4d4d4]">Full Project Lineage</span>

        {selectedNode && (
          <>
            <span className="text-[#3e3e42] mx-1">·</span>
            <span className="text-xs font-mono text-[#4fc3f7]">{selectedNode.name}</span>
            <span className="text-[10px] text-[#5a5a5a] ml-1">path highlighted</span>
            <button onClick={() => setSelectedId(null)}
              className="text-[10px] text-[#5a5a5a] hover:text-[#d4d4d4] underline ml-1">
              clear
            </button>
          </>
        )}

        <div className="ml-auto flex items-center gap-1">
          {/* Legend */}
          <div className="hidden sm:flex items-center gap-3 mr-3">
            {[
              { bg: '#0e639c', border: '#4fc3f7', label: 'selected' },
              { bg: '#0a2018', border: '#4ec9b0', label: 'source' },
              { bg: '#152840', border: '#569cd6', label: 'path' },
              { bg: '#252526', border: '#3e3e42', label: 'model' },
            ].map(({ bg, border, label }) => (
              <span key={label} className="flex items-center gap-1 text-[10px] text-[#6a6a6a]">
                <span className="inline-block w-2.5 h-2.5 rounded-sm border"
                  style={{ background: bg, borderColor: border }} />
                {label}
              </span>
            ))}
          </div>
          <button onClick={() => zoom(1.2)} title="Zoom in"
            className="p-1.5 text-[#6a6a6a] hover:text-[#d4d4d4] hover:bg-[#2e2e2e] rounded">
            <ZoomIn size={13} />
          </button>
          <button onClick={() => zoom(1 / 1.2)} title="Zoom out"
            className="p-1.5 text-[#6a6a6a] hover:text-[#d4d4d4] hover:bg-[#2e2e2e] rounded">
            <ZoomOut size={13} />
          </button>
          <button onClick={fitToScreen} title="Fit to screen"
            className="p-1.5 text-[#6a6a6a] hover:text-[#d4d4d4] hover:bg-[#2e2e2e] rounded">
            <Maximize2 size={13} />
          </button>
          <button onClick={fetchLineage} title="Refresh"
            className="p-1.5 text-[#6a6a6a] hover:text-[#d4d4d4] hover:bg-[#2e2e2e] rounded">
            <RefreshCw size={13} />
          </button>
          <div className="w-px h-4 bg-[#2e2e2e] mx-1" />
          <button onClick={onClose} title="Close (Esc)"
            className="p-1.5 text-[#6a6a6a] hover:text-[#d4d4d4] hover:bg-[#2e2e2e] rounded">
            <X size={14} />
          </button>
        </div>
      </div>

      {/* ── Canvas ── */}
      <div className="flex-1 relative overflow-hidden min-h-0">
        {loading && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-[#6a6a6a]">
            <Loader2 size={32} className="animate-spin" />
            <span className="text-sm">Building full lineage graph…</span>
          </div>
        )}

        {!loading && error && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-center px-6">
            <AlertCircle size={32} className="text-yellow-500" />
            <p className="text-sm text-[#d4d4d4]">{error}</p>
            {error.includes('compile') && (
              <p className="text-xs text-[#6a6a6a]">
                Run <span className="font-mono text-[#569cd6]">More → compile</span> to generate <span className="font-mono">target/manifest.json</span> first.
              </p>
            )}
          </div>
        )}

        {!loading && !error && positioned.length > 0 && (
          <>
            <div className="absolute top-3 left-1/2 -translate-x-1/2 z-10 pointer-events-none">
              <span className="text-[10px] text-[#2e2e2e] bg-[#181818] px-2 py-0.5 rounded select-none">
                Scroll = zoom · Drag = pan · Click node = highlight path · Double-click = open in editor
              </span>
            </div>

            <svg
              ref={svgRef}
              className="w-full h-full"
              style={{ cursor: 'grab' }}
              onWheel={handleWheel}
              onMouseDown={onMD}
              onMouseMove={onMM}
              onMouseUp={onMU}
              onMouseLeave={onMU}
              onClick={e => { if (!(e.target as Element).closest('[data-node]')) setSelectedId(null); }}
            >
              <g transform={`translate(${vp.x},${vp.y}) scale(${vp.scale})`}>
                {/* Dot grid */}
                <defs>
                  <pattern id="dotgrid" width="22" height="22" patternUnits="userSpaceOnUse">
                    <circle cx="1" cy="1" r="0.7" fill="#222" />
                  </pattern>
                </defs>
                <rect x={-9999} y={-9999} width={19998} height={19998} fill="url(#dotgrid)" />

                {/* Canvas border hint */}
                <rect x={0} y={0} width={svgW} height={svgH}
                  fill="none" stroke="#222" strokeWidth={1} rx={8} />

                {/* Edges */}
                {edges.map((e, i) => {
                  const inPath = pathIds ? pathIds.has(e.source) && pathIds.has(e.target) : false;
                  const dim = pathIds !== null && !inPath;
                  return <Edge key={i} edge={e} posMap={posMap}
                    state={dim ? 'dim' : inPath ? 'path' : 'normal'} />;
                })}

                {/* Nodes */}
                {positioned.map(node => {
                  const isFocus = node.id === selectedId;
                  const inPath = pathIds ? pathIds.has(node.id) : false;
                  const dim = pathIds !== null && !inPath;
                  const hl = isFocus ? 'focus' : dim ? 'dim' : inPath ? 'path' : 'normal';
                  const c = nodeColors(node, hl);
                  const canOpen = !!node.filePath && node.type !== 'source';
                  const label = node.name.length > 19 ? node.name.slice(0, 17) + '…' : node.name;

                  return (
                    <g key={node.id} data-node="1"
                      transform={`translate(${node.x},${node.y})`}
                      style={{ cursor: canOpen ? 'pointer' : 'default' }}
                      onClick={e => { e.stopPropagation(); setSelectedId(p => p === node.id ? null : node.id); }}
                      onDoubleClick={() => { if (canOpen && node.filePath) onOpenModel(node.filePath, node.name); }}
                      onMouseEnter={() => setTooltip({ text: node.name, cx: node.x + NODE_W / 2, cy: node.y })}
                      onMouseLeave={() => setTooltip(null)}
                    >
                      {/* shadow */}
                      <rect x={2} y={2} width={NODE_W} height={NODE_H} rx={5} fill="rgba(0,0,0,0.45)" />
                      {/* box */}
                      <rect width={NODE_W} height={NODE_H} rx={5}
                        fill={c.fill} stroke={c.stroke} strokeWidth={c.strokeW} />
                      {/* left accent */}
                      <rect width={3} height={NODE_H} rx={2} fill={c.accent} />
                      {/* icon */}
                      <g transform="translate(11,15)" fill={c.text}><NodeIcon type={node.type} /></g>
                      {/* label */}
                      <text x={28} y={NODE_H / 2 + 4} fontSize={11}
                        fill={c.text} fontFamily="ui-monospace,monospace"
                        className="select-none">{label}</text>
                      {/* open hint */}
                      {canOpen && !isFocus && (
                        <text x={NODE_W - 8} y={NODE_H / 2 + 4} fontSize={9}
                          fill={c.stroke} textAnchor="end" className="select-none">↗</text>
                      )}
                    </g>
                  );
                })}

                {/* Tooltip in SVG space */}
                {tooltip && (
                  <g transform={`translate(${tooltip.cx},${tooltip.cy - 8})`} style={{ pointerEvents: 'none' }}>
                    <rect x={-70} y={-18} width={140} height={20} rx={3}
                      fill="#1f1f1f" stroke="#3e3e42" strokeWidth={1} />
                    <text x={0} y={-4} fontSize={11} fill="#d4d4d4"
                      textAnchor="middle" fontFamily="ui-monospace,monospace"
                      className="select-none">{tooltip.text}</text>
                  </g>
                )}
              </g>
            </svg>
          </>
        )}

        {!loading && !error && positioned.length === 0 && (
          <div className="absolute inset-0 flex items-center justify-center">
            <p className="text-sm text-[#5a5a5a]">No lineage data found.</p>
          </div>
        )}
      </div>

      {/* ── Footer ── */}
      {!loading && !error && positioned.length > 0 && (
        <div className="flex items-center gap-4 px-4 py-1.5 bg-[#1f1f1f] border-t border-[#2e2e2e] shrink-0 select-none">
          <span className="text-[10px] text-[#5a5a5a]">
            <span className="text-[#d4d4d4]">{positioned.length}</span> nodes
          </span>
          <span className="text-[10px] text-[#5a5a5a]">
            <span className="text-[#4ec9b0]">{positioned.filter(n => n.type === 'source').length}</span> sources
          </span>
          <span className="text-[10px] text-[#5a5a5a]">
            <span className="text-[#9cdcfe]">{positioned.filter(n => n.type === 'model').length}</span> models
          </span>
          {selectedNode && (
            <>
              <span className="text-[#2e2e2e]">·</span>
              <span className="text-[10px] text-[#5a5a5a]">
                <span className="text-[#569cd6]">{pathIds ? pathIds.size - 1 : 0}</span> nodes in <span className="font-mono text-[#4fc3f7]">{selectedNode.name}</span> path
              </span>
            </>
          )}
          <span className="ml-auto text-[10px] text-[#3a3a3a]">
            {Math.round(vp.scale * 100)}%
          </span>
        </div>
      )}
    </div>
  );
}

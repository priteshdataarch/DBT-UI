import { NextRequest, NextResponse } from 'next/server';
import { loadManifest } from '@/lib/dbt';

export interface LineageNode {
  id: string;
  name: string;
  type: 'model' | 'source' | 'seed' | 'snapshot';
  filePath: string | null;
  level: number; // topological depth (0 = sources, 1, 2, ... by depth)
}

export interface LineageEdge {
  source: string;
  target: string;
}

export interface LineageResponse {
  nodes: LineageNode[];
  edges: LineageEdge[];
  error?: string;
}

function resourceType(rt: string): LineageNode['type'] {
  if (rt === 'source') return 'source';
  if (rt === 'seed') return 'seed';
  if (rt === 'snapshot') return 'snapshot';
  return 'model';
}

/** Assign levels via longest-path BFS so nodes sit in the right column */
function assignLevels(
  nodes: Pick<LineageNode, 'id'>[],
  edges: LineageEdge[]
): Map<string, number> {
  const nodeIds = new Set(nodes.map(n => n.id));
  // in-degree count
  const inDeg = new Map<string, number>();
  for (const n of nodes) inDeg.set(n.id, 0);
  for (const e of edges) {
    if (nodeIds.has(e.target)) inDeg.set(e.target, (inDeg.get(e.target) ?? 0) + 1);
  }

  // Build child map
  const children = new Map<string, string[]>();
  for (const e of edges) {
    if (!children.has(e.source)) children.set(e.source, []);
    children.get(e.source)!.push(e.target);
  }

  const levels = new Map<string, number>();
  const queue: string[] = [];
  for (const [id, deg] of inDeg) {
    if (deg === 0) { queue.push(id); levels.set(id, 0); }
  }

  // Kahn's algorithm — propagate maximum level
  const remaining = new Map(inDeg);
  while (queue.length > 0) {
    const id = queue.shift()!;
    const cur = levels.get(id) ?? 0;
    for (const child of (children.get(id) ?? [])) {
      const next = cur + 1;
      if (!levels.has(child) || levels.get(child)! < next) levels.set(child, next);
      const deg = (remaining.get(child) ?? 1) - 1;
      remaining.set(child, deg);
      if (deg <= 0) queue.push(child);
    }
  }

  // Fallback for any node not reached (cycles)
  for (const n of nodes) {
    if (!levels.has(n.id)) levels.set(n.id, 0);
  }

  return levels;
}

export async function GET(req: NextRequest): Promise<NextResponse<LineageResponse>> {
  const manifest = await loadManifest();
  if (!manifest) {
    return NextResponse.json(
      { nodes: [], edges: [], error: 'manifest.json not found — run "dbt compile" first' },
      { status: 404 }
    );
  }

  const nodes: LineageNode[] = [];
  const edges: LineageEdge[] = [];
  const nodeIds = new Set<string>();

  // Add only model / seed / snapshot nodes — explicitly exclude test, analysis, exposure, metric, etc.
  const INCLUDE_TYPES = new Set(['model', 'seed', 'snapshot']);
  for (const [uid, node] of Object.entries(manifest.nodes)) {
    if (!INCLUDE_TYPES.has(node.resource_type)) continue;
    const type = resourceType(node.resource_type);
    nodes.push({ id: uid, name: node.name, type, filePath: node.original_file_path ?? null, level: 0 });
    nodeIds.add(uid);
  }

  // Build edges from parent_map and collect referenced source ids
  const referencedSourceIds = new Set<string>();
  for (const [uid] of Object.entries(manifest.nodes)) {
    for (const parentId of manifest.parent_map[uid] ?? []) {
      edges.push({ source: parentId, target: uid });
      if (!nodeIds.has(parentId)) referencedSourceIds.add(parentId);
    }
  }

  // Add referenced source nodes
  for (const src of Object.values(manifest.sources)) {
    if (!referencedSourceIds.has(src.unique_id)) continue;
    nodes.push({
      id: src.unique_id,
      name: `${src.source_name}.${src.name}`,
      type: 'source',
      filePath: null,
      level: 0,
    });
    nodeIds.add(src.unique_id);
  }

  // Remove edges where source/target node not in our set
  const validEdges = edges.filter(e => nodeIds.has(e.source) && nodeIds.has(e.target));

  // Assign topological levels
  const levels = assignLevels(nodes, validEdges);
  for (const n of nodes) n.level = levels.get(n.id) ?? 0;

  // Optional: filter to just the neighbourhood of a model
  const modelParam = req.nextUrl.searchParams.get('model');
  if (modelParam) {
    const targetEntry = nodes.find(n => n.name === modelParam && n.type === 'model');
    if (targetEntry) {
      // Return full graph but caller can use this to pre-select a node
      return NextResponse.json({ nodes, edges: validEdges, selectedId: targetEntry.id } as LineageResponse & { selectedId: string });
    }
  }

  return NextResponse.json({ nodes, edges: validEdges });
}

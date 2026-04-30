import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs/promises';
import path from 'path';

const DBT_ROOT = process.env.DBT_PROJECT_ROOT
  ? path.resolve(process.env.DBT_PROJECT_ROOT)
  : path.resolve(process.cwd(), '..');

// ── Types ─────────────────────────────────────────────────────────────────────

export interface MacroArg {
  name: string;
  default?: string;
}

export interface MacroDef {
  name: string;
  args: MacroArg[];
  docstring: string;    // lines between macro tag and first SQL
  body: string;         // full raw body
  filePath: string;     // relative to DBT_ROOT
  source: 'project' | 'package';
  packageName?: string;
}

export interface MacrosResponse {
  project: MacroDef[];
  packages: Record<string, MacroDef[]>;
}

// ── Parser ────────────────────────────────────────────────────────────────────

const MACRO_RE = /\{%-?\s*macro\s+(\w+)\s*\(([^)]*)\)\s*-?%\}([\s\S]*?)\{%-?\s*endmacro\s*-?%\}/g;

function parseMacros(src: string, filePath: string, source: 'project' | 'package', packageName?: string): MacroDef[] {
  const defs: MacroDef[] = [];
  let m: RegExpExecArray | null;
  MACRO_RE.lastIndex = 0;
  while ((m = MACRO_RE.exec(src)) !== null) {
    const name       = m[1];
    const argsRaw    = m[2].trim();
    const body       = m[3];

    const args: MacroArg[] = argsRaw
      ? argsRaw.split(',').map((a) => {
          const [n, def] = a.split('=').map((s) => s.trim());
          return { name: n.replace(/^['"]+|['"]+$/g, ''), ...(def ? { default: def.replace(/^['"]+|['"]+$/g, '') } : {}) };
        }).filter((a) => a.name)
      : [];

    // Extract leading comment/docstring from the body
    const docLines: string[] = [];
    for (const line of body.split('\n')) {
      const t = line.trim();
      if (!t) continue;
      if (t.startsWith('{#') || t.startsWith('--')) {
        docLines.push(t.replace(/^\{#\s*|\s*#\}$/g, '').replace(/^--\s*/, ''));
      } else {
        break;
      }
    }

    defs.push({ name, args, docstring: docLines.join(' ').trim(), body: body.trim(), filePath, source, packageName });
  }
  return defs;
}

// ── Scanner ───────────────────────────────────────────────────────────────────

async function scanDir(dir: string, filePath: string, source: 'project' | 'package', packageName?: string): Promise<MacroDef[]> {
  const results: MacroDef[] = [];
  let entries: string[];
  try {
    entries = await fs.readdir(dir);
  } catch { return results; }

  for (const entry of entries) {
    const full = path.join(dir, entry);
    let stat;
    try { stat = await fs.stat(full); } catch { continue; }
    const rel  = path.join(filePath, entry);
    if (stat.isDirectory()) {
      results.push(...await scanDir(full, rel, source, packageName));
    } else if (entry.endsWith('.sql')) {
      try {
        const content = await fs.readFile(full, 'utf-8');
        results.push(...parseMacros(content, rel, source, packageName));
      } catch { /* skip unreadable */ }
    }
  }
  return results;
}

// ── GET ───────────────────────────────────────────────────────────────────────

export async function GET() {
  // Project macros (macros/ at root)
  const projectMacrosDir = path.join(DBT_ROOT, 'macros');
  const projectMacros    = await scanDir(projectMacrosDir, 'macros', 'project');

  // Package macros (dbt_packages/*/macros/)
  const packagesDir = path.join(DBT_ROOT, 'dbt_packages');
  const packages: Record<string, MacroDef[]> = {};
  try {
    const pkgNames = await fs.readdir(packagesDir);
    for (const pkg of pkgNames) {
      const macrosDir = path.join(packagesDir, pkg, 'macros');
      const defs      = await scanDir(macrosDir, `dbt_packages/${pkg}/macros`, 'package', pkg);
      if (defs.length > 0) packages[pkg] = defs;
    }
  } catch { /* no packages */ }

  return NextResponse.json({ project: projectMacros, packages } satisfies MacrosResponse);
}

// ── POST — create a new macro file ───────────────────────────────────────────

export async function POST(req: NextRequest) {
  const { name, args, body, subPath } = await req.json() as {
    name: string;
    args?: string;
    body?: string;
    subPath?: string;
  };

  if (!name?.trim()) {
    return NextResponse.json({ error: 'Macro name is required' }, { status: 400 });
  }

  const safeName = name.trim().replace(/[^a-z0-9_]/gi, '_');
  const dir      = subPath?.trim()
    ? path.join(DBT_ROOT, 'macros', subPath.trim())
    : path.join(DBT_ROOT, 'macros');

  await fs.mkdir(dir, { recursive: true });

  const argStr  = args?.trim() || '';
  const macroBody = body?.trim() || `    {# TODO: implement ${safeName} #}`;
  const content = `{% macro ${safeName}(${argStr}) %}\n${macroBody}\n{% endmacro %}\n`;
  const filePath = path.join(dir, `${safeName}.sql`);

  try {
    await fs.writeFile(filePath, content, 'utf-8');
    return NextResponse.json({ ok: true, path: path.relative(DBT_ROOT, filePath) });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

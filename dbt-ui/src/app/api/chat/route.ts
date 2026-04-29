import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';
import { retrieveContext } from '@/lib/rag';
import { loadUserSystemAppend } from '@/lib/assistantUserInstructions';
import { loadSchema, INTERMEDIATE_MODELS } from '@/lib/catalog';
import { buildSqlPrompt, buildAuthoringPrompt } from '@/lib/prompts';

// ── SQL mode system prompt — loaded from prompts/rag-sql-system.txt ──────────

async function buildSqlSystemPrompt(
  schema: string,
  catalogAvailable: boolean,
  includeExplanation: boolean,
  flavor: 'live' | 'ondemand' | 'neutral'
): Promise<string> {
  const schemaSection = catalogAvailable
    ? `Relevant Database Schema (from dbt catalog — real Athena column types):\n${schema}`
    : `Relevant Schema (from manifest — column types may be incomplete):\n${schema}`;

  const outputRule = includeExplanation
    ? 'Return SQL first, then a brief plain-English explanation (3–5 sentences max).'
    : 'Return ONLY SQL in one ```sql``` block. No prose, no bullet points.';

  const flavorRule =
    flavor === 'live'
      ? "Add WHERE session_type = 'live' when filtering to live sessions."
      : flavor === 'ondemand'
        ? "Add WHERE session_type = 'ondemand' when filtering to ondemand sessions."
        : 'Do NOT add any session_type filter unless the user explicitly asks for live or ondemand.';

  return buildSqlPrompt({ schemaSection, outputRule, flavorRule });
}

function detectQueryFlavor(question: string): 'live' | 'ondemand' | 'neutral' {
  const q = question.toLowerCase();
  if (q.includes('live') && !q.includes('ondemand')) return 'live';
  if (q.includes('ondemand') && !q.includes('live')) return 'ondemand';
  return 'neutral';
}

function wantsExplanation(question: string): boolean {
  return /\b(explain|why|walk me through|what does this do|break down)\b/i.test(question);
}

function extractSql(text: string): string {
  const fenced = text.match(/```sql\s*([\s\S]*?)```/i);
  if (fenced?.[1]) return fenced[1].trim();
  const generic = text.match(/```\s*([\s\S]*?)```/);
  if (generic?.[1]) return generic[1].trim();
  return text.trim();
}

function normalizeSqlForParsing(sql: string): string {
  return sql
    .replace(/\{\{\s*ref\(\s*'([^']+)'\s*\)\s*\}\}/gi, '$1')
    .replace(/\{\{\s*source\(\s*'([^']+)'\s*,\s*'([^']+)'\s*\)\s*\}\}/gi, '$1.$2');
}

function buildAliasToTable(sql: string): Record<string, string> {
  const aliasMap: Record<string, string> = {};
  const normalized = normalizeSqlForParsing(sql);
  const re = /\b(from|join)\s+([a-zA-Z0-9_."$]+)(?:\s+(?:as\s+)?([a-zA-Z_][a-zA-Z0-9_]*))?/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(normalized)) !== null) {
    const rawTable = m[2].replace(/"/g, '');
    const table = rawTable.split('.').pop() ?? rawTable;
    const alias = m[3] ?? table;
    aliasMap[alias] = table;
  }
  return aliasMap;
}

function extractJoinOnClauses(sql: string): string[] {
  const normalized = normalizeSqlForParsing(sql);
  const clauses: string[] = [];
  const re = /\bjoin\b[\s\S]*?\bon\b([\s\S]*?)(?=\bjoin\b|\bwhere\b|\bgroup\s+by\b|\border\s+by\b|\blimit\b|$)/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(normalized)) !== null) {
    clauses.push(m[1]);
  }
  return clauses;
}

function extractBaseAlias(sql: string): { alias: string; table: string } | null {
  const normalized = normalizeSqlForParsing(sql);
  const m = normalized.match(/\bfrom\s+([a-zA-Z0-9_."$]+)(?:\s+(?:as\s+)?([a-zA-Z_][a-zA-Z0-9_]*))?/i);
  if (!m) return null;
  const rawTable = m[1].replace(/"/g, '');
  const table = rawTable.split('.').pop() ?? rawTable;
  const alias = m[2] ?? table;
  return { alias, table };
}

function extractTopN(question: string): number | null {
  const m = question.match(/\btop\s+(\d+)\b/i);
  if (!m) return null;
  return Number(m[1]);
}

function extractSelectAndGroupBy(sql: string): string {
  const normalized = normalizeSqlForParsing(sql);
  const selectMatch = normalized.match(/\bselect\b([\s\S]*?)\bfrom\b/i);
  const groupMatch = normalized.match(/\bgroup\s+by\b([\s\S]*?)(?=\border\s+by\b|\blimit\b|$)/i);
  return `${selectMatch?.[1] ?? ''}\n${groupMatch?.[1] ?? ''}`;
}

function extractCoreClauses(sql: string): string {
  const normalized = normalizeSqlForParsing(sql);
  const selectMatch = normalized.match(/\bselect\b([\s\S]*?)\bfrom\b/i)?.[1] ?? '';
  const whereMatch = normalized.match(/\bwhere\b([\s\S]*?)(?=\bgroup\s+by\b|\border\s+by\b|\blimit\b|$)/i)?.[1] ?? '';
  const groupMatch = normalized.match(/\bgroup\s+by\b([\s\S]*?)(?=\border\s+by\b|\blimit\b|$)/i)?.[1] ?? '';
  const orderMatch = normalized.match(/\border\s+by\b([\s\S]*?)(?=\blimit\b|$)/i)?.[1] ?? '';
  return [selectMatch, whereMatch, groupMatch, orderMatch].join('\n');
}

function extractUnqualifiedColumns(sql: string): Set<string> {
  const normalized = normalizeSqlForParsing(sql);
  const selectPart = normalized.match(/\bselect\b([\s\S]*?)\bfrom\b/i)?.[1] ?? '';

  // Capture select aliases so they are not mistaken for source columns
  // Handles both "expr AS alias" and "expr alias".
  const aliasTokens = new Set<string>();
  const asAliasRe = /\bas\s+([a-zA-Z_][a-zA-Z0-9_]*)\b/gi;
  let am: RegExpExecArray | null;
  while ((am = asAliasRe.exec(selectPart)) !== null) {
    aliasTokens.add(am[1].toLowerCase());
  }
  const bareAliasRe = /(?:\)|\b[a-zA-Z_][a-zA-Z0-9_]*)\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*(?:,|$)/g;
  while ((am = bareAliasRe.exec(selectPart)) !== null) {
    aliasTokens.add(am[1].toLowerCase());
  }

  const scope = extractCoreClauses(sql);
  const noStrings = scope.replace(/'[^']*'/g, ' ');
  const noQualified = noStrings.replace(/\b[a-zA-Z_][a-zA-Z0-9_]*\.[a-zA-Z_][a-zA-Z0-9_]*\b/g, ' ');
  const tokenRe = /\b[a-zA-Z_][a-zA-Z0-9_]*\b/g;
  const reserved = new Set([
    'select', 'from', 'where', 'group', 'by', 'order', 'limit', 'and', 'or', 'as', 'on', 'join', 'left', 'right',
    'inner', 'outer', 'case', 'when', 'then', 'else', 'end', 'desc', 'asc', 'distinct', 'sum', 'avg', 'min', 'max',
    'count', 'coalesce', 'concat', 'row_number', 'rank', 'dense_rank', 'over', 'partition', 'having', 'is', 'null',
    'not', 'in', 'like', 'between', 'true', 'false'
  ]);

  const cols = new Set<string>();
  let m: RegExpExecArray | null;
  while ((m = tokenRe.exec(noQualified)) !== null) {
    const t = m[0].toLowerCase();
    if (!reserved.has(t) && !aliasTokens.has(t) && !/^\d+$/.test(t)) cols.add(t);
  }
  return cols;
}

function extractReferencedColumnsForTable(
  sql: string,
  aliasMap: Record<string, string>,
  tableName: string
): Set<string> {
  const normalized = normalizeSqlForParsing(sql);
  const aliases = Object.entries(aliasMap)
    .filter(([, t]) => t === tableName)
    .map(([a]) => a);
  const cols = new Set<string>();
  if (aliases.length === 0) return cols;

  const re = /\b([a-zA-Z_][a-zA-Z0-9_]*)\.([a-zA-Z_][a-zA-Z0-9_]*)\b/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(normalized)) !== null) {
    const alias = m[1];
    const col = m[2].toLowerCase();
    if (aliases.includes(alias)) cols.add(col);
  }
  return cols;
}

interface CoverageReport {
  requiredCanonical: string[];
  requiredPhysicalCandidates: string[];
  availableInFScore: string[];
  missingInFScoreButInTeam: string[];
  missingEverywhere: string[];
}

function inferRequiredPhysicalColumns(question: string): Set<string> {
  const q = question.toLowerCase();
  const cols = new Set<string>();

  // metrics / facts
  if (/\battempts?\b/.test(q)) cols.add('attempt');
  if (/\bskill(s)?\b/.test(q)) cols.add('skill');
  if (/\b(score|performance|performing)\b/.test(q)) cols.add('skill_score');

  // people / entities
  if (/\buser\s*name\b|\bname of user\b|\busers?\b/.test(q)) {
    cols.add('full_name');
    cols.add('first_name');
    cols.add('last_name');
    cols.add('user_id');
  }
  if (/\bclient(s)?\b/.test(q)) {
    cols.add('client_name');
    cols.add('client_id');
  }
  if (/\bteam(s)?\b|\bcohorts?\b/.test(q)) {
    cols.add('team_name');
    cols.add('team_id');
  }
  if (/\bproject(s)?\b|\bpathways?\b/.test(q)) {
    cols.add('project_name');
    cols.add('project_id');
  }
  if (/\bscenario(s)?\b/.test(q)) {
    cols.add('scenario_name');
    cols.add('scenario_id');
  }

  return cols;
}

function buildCoverageReport(
  question: string,
  modelColumns: Record<string, Set<string>>
): CoverageReport {
  const required = Array.from(inferRequiredPhysicalColumns(question));
  const fScore = modelColumns.f_score ?? new Set<string>();
  const team = modelColumns.f_team_sessions_final ?? new Set<string>();

  const inScore: string[] = [];
  const inTeamOnly: string[] = [];
  const missing: string[] = [];

  for (const col of required) {
    if (fScore.has(col)) inScore.push(col);
    else if (team.has(col)) inTeamOnly.push(col);
    else missing.push(col);
  }

  return {
    requiredCanonical: required,
    requiredPhysicalCandidates: required,
    availableInFScore: inScore,
    missingInFScoreButInTeam: inTeamOnly,
    missingEverywhere: missing,
  };
}

function validateSqlAgainstCatalog(
  sql: string,
  modelColumns: Record<string, Set<string>>,
  flavor: 'live' | 'ondemand' | 'neutral',
  userQuestion: string,
  coverage?: CoverageReport
): string[] {
  const errors: string[] = [];
  const aliasMap = buildAliasToTable(sql);
  const normalized = normalizeSqlForParsing(sql);

  // ── Prohibited table check (highest priority) ─────────────────────────
  for (const tableName of Object.values(aliasMap)) {
    if (INTERMEDIATE_MODELS.has(tableName)) {
      errors.push(
        `Prohibited table \`${tableName}\` used directly. Use \`f_score\` or \`f_team_sessions_final\` instead — they already contain all data from \`${tableName}\`.`
      );
    }
  }

  // ── Allowed analytics tables policy ─────────────────────────────────────
  const tables = new Set(Object.values(aliasMap));
  const allowedAnalyticsTables = new Set(['f_score', 'f_team_sessions_final']);
  for (const tableName of tables) {
    if (!allowedAnalyticsTables.has(tableName) && !INTERMEDIATE_MODELS.has(tableName)) {
      errors.push(
        `Table \`${tableName}\` is outside preferred analytics scope. Use only \`f_score\` (preferred) or \`f_team_sessions_final\` (fallback when columns are missing in f_score).`
      );
    }
  }

  // ── Column existence check ─────────────────────────────────────────────
  const colRefRegex = /\b([a-zA-Z_][a-zA-Z0-9_]*)\.([a-zA-Z_][a-zA-Z0-9_]*)\b/g;
  let m: RegExpExecArray | null;
  while ((m = colRefRegex.exec(normalized)) !== null) {
    const alias = m[1];
    const col = m[2];
    const table = aliasMap[alias];
    if (!table) continue;
    const cols = modelColumns[table];
    if (!cols) continue;
    if (!cols.has(col.toLowerCase())) {
      errors.push(`Unknown column \`${alias}.${col}\` for table \`${table}\`.`);
    }
  }

  // If query uses only f_team_sessions_final, verify f_score does not already have all used columns.
  if (tables.has('f_team_sessions_final') && !tables.has('f_score')) {
    const usedOnTeamSessions = extractReferencedColumnsForTable(sql, aliasMap, 'f_team_sessions_final');
    const fScoreCols = modelColumns.f_score;
    if (fScoreCols && usedOnTeamSessions.size > 0) {
      const missingInFScore = Array.from(usedOnTeamSessions).filter((c) => !fScoreCols.has(c));
      if (missingInFScore.length === 0) {
        errors.push(
          'All referenced columns exist in `f_score`. Prefer `f_score` instead of `f_team_sessions_final`.'
        );
      }
    }
  }

  // If both tables are used, f_team_sessions_final must contribute at least one column not present in f_score.
  if (tables.has('f_team_sessions_final') && tables.has('f_score')) {
    const teamColsUsed = extractReferencedColumnsForTable(sql, aliasMap, 'f_team_sessions_final');
    const fScoreCols = modelColumns.f_score;
    if (fScoreCols && teamColsUsed.size > 0) {
      const trulyFallbackCols = Array.from(teamColsUsed).filter((c) => !fScoreCols.has(c));
      if (trulyFallbackCols.length === 0) {
        errors.push(
          '`f_team_sessions_final` is joined but does not add any column missing from `f_score`. Remove this join.'
        );
      }
    }
  }

  // Coverage policy from user intent: use f_team_sessions_final only when needed columns are missing in f_score.
  if (coverage) {
    if (coverage.missingInFScoreButInTeam.length === 0 && tables.has('f_team_sessions_final')) {
      errors.push(
        'Intent coverage indicates all required columns are available in `f_score`; remove `f_team_sessions_final`.'
      );
    }
    if (coverage.missingInFScoreButInTeam.length > 0 && !tables.has('f_team_sessions_final')) {
      errors.push(
        `Intent requires fallback columns not in f_score: ${coverage.missingInFScoreButInTeam.join(', ')}. Join f_team_sessions_final for these columns.`
      );
    }
    if (coverage.missingEverywhere.length > 0) {
      errors.push(
        `Requested fields not found in either f_score or f_team_sessions_final: ${coverage.missingEverywhere.join(', ')}.`
      );
    }
  }

  // Unqualified column guardrails:
  // 1) multi-table queries must qualify columns with aliases
  // 2) if base is f_score and unqualified cols are not in f_score, require fallback join usage
  const unqualifiedCols = extractUnqualifiedColumns(sql);
  if (tables.size > 1 && unqualifiedCols.size > 0) {
    errors.push(
      `Multi-table query has unqualified columns: ${Array.from(unqualifiedCols).join(', ')}. Qualify all columns with table aliases (e.g., s.attempt, t.full_name).`
    );
  }
  const base = extractBaseAlias(sql);
  if (base?.table === 'f_score' && unqualifiedCols.size > 0) {
    const fScoreCols = modelColumns.f_score ?? new Set<string>();
    const missing = Array.from(unqualifiedCols).filter((c) => !fScoreCols.has(c));
    if (missing.length > 0 && !tables.has('f_team_sessions_final')) {
      errors.push(
        `Columns not found in f_score without fallback join: ${missing.join(', ')}. Join f_team_sessions_final only for these missing columns.`
      );
    }
  }

  // ── Prefer readable business names over IDs in output ───────────────────
  // Example: client_name over client_id, team_name over team_id.
  if (!/\b(ids?|identifier|key)\b/i.test(userQuestion)) {
    const presentableZone = extractSelectAndGroupBy(sql);
    const idPairs: Array<{ idCol: string; nameCol: string }> = [
      { idCol: 'client_id', nameCol: 'client_name' },
      { idCol: 'team_id', nameCol: 'team_name' },
      { idCol: 'project_id', nameCol: 'project_name' },
      { idCol: 'scenario_id', nameCol: 'scenario_name' },
      { idCol: 'user_id', nameCol: 'full_name' },
    ];

    for (const [alias, table] of Object.entries(aliasMap)) {
      const cols = modelColumns[table];
      if (!cols) continue;
      for (const pair of idPairs) {
        if (!cols.has(pair.idCol) || !cols.has(pair.nameCol)) continue;
        const usesId = new RegExp(`\\b${alias}\\.${pair.idCol}\\b`, 'i').test(presentableZone);
        const usesName = new RegExp(`\\b${alias}\\.${pair.nameCol}\\b`, 'i').test(presentableZone);
        if (usesId && !usesName) {
          errors.push(
            `Prefer readable field \`${alias}.${pair.nameCol}\` over \`${alias}.${pair.idCol}\` in SELECT/GROUP BY unless IDs were explicitly requested.`
          );
        }
      }
    }
  }

  // ── Join-minimization heuristics ──────────────────────────────────────
  const joinClauses = extractJoinOnClauses(sql).join('\n');
  const colRefRegexJoinScan = /\b([a-zA-Z_][a-zA-Z0-9_]*)\.([a-zA-Z_][a-zA-Z0-9_]*)\b/g;
  const allRefsByAlias = new Map<string, Set<string>>();
  let r: RegExpExecArray | null;
  while ((r = colRefRegexJoinScan.exec(normalized)) !== null) {
    const a = r[1], c = r[2];
    if (!allRefsByAlias.has(a)) allRefsByAlias.set(a, new Set());
    allRefsByAlias.get(a)!.add(c.toLowerCase());
  }
  const joinRefsByAlias = new Map<string, Set<string>>();
  while ((r = colRefRegexJoinScan.exec(joinClauses)) !== null) {
    const a = r[1], c = r[2];
    if (!joinRefsByAlias.has(a)) joinRefsByAlias.set(a, new Set());
    joinRefsByAlias.get(a)!.add(c.toLowerCase());
  }

  for (const alias of Object.keys(aliasMap)) {
    if (base && alias === base.alias) continue;
    const allCols = allRefsByAlias.get(alias) ?? new Set<string>();
    const joinCols = joinRefsByAlias.get(alias) ?? new Set<string>();
    const nonJoinCols = Array.from(allCols).filter((c) => !joinCols.has(c));
    if (allCols.size > 0 && nonJoinCols.length === 0) {
      errors.push(`Potential unnecessary join: alias \`${alias}\` is used only in JOIN condition.`);
    }
  }

  // Specific anti-pattern: joining only to filter live/ondemand even though base already has session_type
  if (base) {
    const baseCols = modelColumns[base.table];
    if (baseCols?.has('session_type')) {
      for (const alias of Object.keys(aliasMap)) {
        if (alias === base.alias) continue;
        const reFilter = new RegExp(`\\b${alias}\\.session_type\\b`, 'i');
        if (reFilter.test(normalized)) {
          errors.push(
            `Use \`${base.alias}.session_type\` from base table \`${base.table}\` instead of joining alias \`${alias}\` only for session_type filter.`
          );
        }
      }
    }
  }

  // Intent-shape check: top N should include LIMIT N or ranking <= N
  const topN = extractTopN(userQuestion);
  if (topN) {
    const hasLimit = new RegExp(`\\blimit\\s+${topN}\\b`, 'i').test(normalized);
    const hasRank = new RegExp(`\\b(row_number|rank|dense_rank)\\s*\\(`, 'i').test(normalized)
      && new RegExp(`<=\\s*${topN}\\b`, 'i').test(normalized);
    if (!hasLimit && !hasRank) {
      errors.push(`Top-${topN} intent missing LIMIT ${topN} (or ranking filter <= ${topN}).`);
    }
  }

  return Array.from(new Set(errors));
}

// ── Authoring mode system prompt — loaded from prompts/authoring-system.txt ──

async function buildAuthoringSystemPrompt(
  contextText: string,
  activeFilePath?: string,
  activeFileContent?: string
): Promise<string> {
  const contextSection = contextText
    ? `**Relevant model schemas from your project:**\n${contextText}`
    : '';
  const activeFileSection = activeFilePath
    ? `**Currently open file:** \`${activeFilePath}\``
    : '';
  const activeContentSection = activeFileContent
    ? `**Current file content:**\n\`\`\`sql\n${activeFileContent.slice(0, 2000)}\n\`\`\``
    : '';

  return buildAuthoringPrompt({ contextSection, activeFileSection, activeContentSection });
}

// ── Route handler ──────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const { messages, activeFilePath, activeFileContent } = await req.json();

  if (!process.env.OPENAI_API_KEY) {
    return NextResponse.json({
      message: '⚠️ **No API key configured.**\n\nPlease set `OPENAI_API_KEY` in your `.env.local` file and restart the dev server.',
      sources: [],
      schemaChunks: [],
      mode: 'error',
    });
  }

  const lastUserMessage: string = messages[messages.length - 1]?.content ?? '';

  const { contextText, sources, mode, schemaChunks, catalogAvailable } =
    await retrieveContext(lastUserMessage, activeFilePath, process.env.OPENAI_API_KEY);
  const queryFlavor = detectQueryFlavor(lastUserMessage);
  const includeExplanation = wantsExplanation(lastUserMessage);

  let systemPrompt: string;
  if (mode === 'sql') {
    systemPrompt = await buildSqlSystemPrompt(
      contextText,
      catalogAvailable ?? true,
      includeExplanation,
      queryFlavor
    );
  } else {
    systemPrompt = await buildAuthoringSystemPrompt(contextText, activeFilePath, activeFileContent);
  }

  // Append optional user instructions (from .env or assistant-extra-instructions.md)
  const userAppend = await loadUserSystemAppend();
  const fullSystemPrompt = systemPrompt + userAppend;

  if (!catalogAvailable && mode === 'sql') {
    // Warn user but still try
    console.warn('[chat] SQL query requested but catalog.json not found — falling back to manifest');
  }

  try {
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: fullSystemPrompt },
        ...(mode === 'sql'
          ? [{ role: 'user' as const, content: lastUserMessage }]
          : messages.slice(-10)),
      ],
      max_tokens: 2000,
      temperature: 0,
    });
    let finalMessage = completion.choices[0]?.message?.content ?? 'No response generated.';

    // SQL validation + one-shot repair
    if (mode === 'sql') {
      const schema = await loadSchema();
      if (schema) {
        const modelColumns: Record<string, Set<string>> = {};
        for (const model of schema) {
          modelColumns[model.name] = new Set(model.columns.map((c) => c.name.toLowerCase()));
        }
        const coverage = buildCoverageReport(lastUserMessage, modelColumns);

        let sql = extractSql(finalMessage);
        let errors = validateSqlAgainstCatalog(sql, modelColumns, queryFlavor, lastUserMessage, coverage);
        for (let pass = 1; pass <= 2 && errors.length > 0; pass++) {
          const repairPrompt = `You generated SQL with schema violations (repair pass ${pass}/2).
Fix the SQL using only valid table/column combinations from the schema context.
Table policy: prefer \`f_score\` as the base table; use \`f_team_sessions_final\` only if required columns are missing in \`f_score\`.
Do not use other fact/intermediate tables for analytical output.
In multi-table SQL, qualify all columns with aliases (e.g., s.attempt, t.full_name).
Also minimize joins: if all required columns exist in one table, remove unnecessary joins.
For "top N" requests, ensure LIMIT N or ranking <= N is present.
Return ONLY corrected SQL in one \`\`\`sql block.

Original SQL:
\`\`\`sql
${sql}
\`\`\`

Validation errors:
${errors.map((e) => `- ${e}`).join('\n')}

Coverage report from user intent:
- inferred required columns: ${coverage.requiredPhysicalCandidates.join(', ') || '(none inferred)'}
- present in f_score: ${coverage.availableInFScore.join(', ') || '(none)'}
- missing in f_score but present in f_team_sessions_final: ${coverage.missingInFScoreButInTeam.join(', ') || '(none)'}
- missing in both: ${coverage.missingEverywhere.join(', ') || '(none)'}`;

          const repair = await openai.chat.completions.create({
            model: 'gpt-4o-mini',
            messages: [
              { role: 'system', content: fullSystemPrompt },
              { role: 'user', content: repairPrompt },
            ],
            max_tokens: 1600,
            temperature: 0,
          });
          finalMessage = repair.choices[0]?.message?.content ?? finalMessage;
          sql = extractSql(finalMessage);
          errors = validateSqlAgainstCatalog(sql, modelColumns, queryFlavor, lastUserMessage, coverage);
        }
        if (errors.length > 0) {
          finalMessage =
            `⚠️ I could not produce a schema-valid query.\n\n` +
            `Validation issues:\n${errors.map((e) => `- ${e}`).join('\n')}\n\n` +
            `Try this safe pattern: base on f_score for metrics; join f_team_sessions_final only for columns missing in f_score, and qualify all columns with aliases.`;
        }
      }
    }

    return NextResponse.json({
      message: finalMessage,
      sources,
      schemaChunks: schemaChunks ?? [],
      mode,
      catalogAvailable,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json(
      { message: `Error calling OpenAI: ${message}`, sources: [], schemaChunks: [], mode },
      { status: 500 }
    );
  }
}

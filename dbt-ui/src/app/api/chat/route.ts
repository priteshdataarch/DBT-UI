import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';
import { retrieveContext } from '@/lib/rag';

export async function POST(req: NextRequest) {
  const { messages, activeFilePath, activeFileContent } = await req.json();

  if (!process.env.OPENAI_API_KEY) {
    return NextResponse.json({
      message:
        '⚠️ **No API key configured.**\n\nPlease set `OPENAI_API_KEY` in your `.env.local` file and restart the dev server.',
      sources: [],
    });
  }

  const lastUserMessage: string = messages[messages.length - 1]?.content ?? '';

  // Use the new manifest-aware retrieval, passing the active file path
  // so the graph context is scoped to the currently-open model
  const { contextText, sources } = await retrieveContext(lastUserMessage, activeFilePath);

  const systemPrompt = `You are a senior dbt SQL expert and data engineer.
Help write dbt models, sources, YAML schemas, macros, and tests.

**Project context:**
- Project name: mursion_dbt_athena
- Warehouse: AWS Athena with Iceberg tables (Parquet format)
- Default config: \`{{ config(materialized='table', table_type='iceberg', format='parquet') }}\`

**dbt conventions in this project:**
- \`{{ ref('model_name') }}\` to reference other models
- \`{{ source('source_name', 'table_name') }}\` to reference raw sources
- Naming: \`f_\` fact tables · \`d_\` dimensions · \`m_\` mapping/bridge · \`stg_\` staging
- Sources live in: \`models/sources/{source_name}/sources.yaml\`
- Always include the config block at the top of SQL files
${
  contextText
    ? `\n**Relevant context from your dbt project (use this for accurate refs and configs):**\n${contextText}`
    : ''
}
${activeFilePath ? `\n**Currently open file:** \`${activeFilePath}\`` : ''}
${
  activeFileContent
    ? `\n**Current file content:**\n\`\`\`sql\n${activeFileContent.slice(0, 2000)}\n\`\`\``
    : ''
}

When generating code:
1. Always wrap SQL in a \`\`\`sql code block and YAML in a \`\`\`yaml block
2. Use the exact model names and source names from the project context above
3. Match the config pattern (iceberg/parquet) shown in the context
4. Add a brief explanation before each code block
5. Suggest tests (unique, not_null) when generating schema YAML`;

  try {
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: systemPrompt },
        ...messages.slice(-10),
      ],
      max_tokens: 2000,
      temperature: 0.2,
    });

    return NextResponse.json({
      message: completion.choices[0]?.message?.content ?? 'No response generated.',
      sources,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json(
      { message: `Error calling OpenAI: ${message}`, sources: [] },
      { status: 500 }
    );
  }
}

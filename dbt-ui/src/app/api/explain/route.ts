import { NextResponse } from 'next/server';
import OpenAI from 'openai';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export async function POST(request: Request) {
  const { sql } = (await request.json()) as { sql: string };

  if (!sql?.trim()) {
    return NextResponse.json({ error: 'SQL is required' }, { status: 400 });
  }

  if (!process.env.OPENAI_API_KEY) {
    return NextResponse.json({ error: 'OPENAI_API_KEY not configured' }, { status: 500 });
  }

  const prompt = `You are a senior data analyst. Explain the following SQL query in plain English.

Structure your explanation as:
1. **Purpose** — what business question this query answers (1-2 sentences)
2. **Tables used** — list each table/CTE and what it contributes
3. **Key logic** — important filters, joins, aggregations, or window functions
4. **Output** — what columns the result contains and what each means

Be concise and business-friendly. Avoid repeating the SQL back verbatim.

SQL:
\`\`\`sql
${sql.trim()}
\`\`\``;

  try {
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 600,
      temperature: 0.3,
    });

    const explanation = completion.choices[0]?.message?.content?.trim() ?? 'No explanation generated.';
    return NextResponse.json({ explanation });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: `OpenAI error: ${msg}` }, { status: 500 });
  }
}

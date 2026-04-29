import { NextResponse } from 'next/server';
import { buildAllSchemaChunks } from '@/lib/catalog';
import { buildIndex, getIndexStatus } from '@/lib/vectorStore';
import { invalidateCatalogCache } from '@/lib/catalog';

// GET — return current index status
export async function GET() {
  const status = await getIndexStatus();
  return NextResponse.json(status);
}

// POST — rebuild the full vector index (streams SSE progress)
export async function POST() {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: 'OPENAI_API_KEY not set in .env.local' },
      { status: 500 }
    );
  }

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (msg: object) =>
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(msg)}\n\n`));

      try {
        send({ step: 'Reading dbt artifacts…' });

        // Force re-read catalog + manifest from disk
        invalidateCatalogCache();
        const chunks = await buildAllSchemaChunks();

        if (chunks.length === 0) {
          send({
            step: 'error',
            message:
              'No models found in catalog.json. Run `dbt docs generate` first then retry.',
          });
          controller.close();
          return;
        }

        send({ step: `Found ${chunks.length} tables. Building embeddings…`, total: chunks.length });

        await buildIndex(chunks, apiKey, (step, done, total) => {
          send({ step, done, total });
        });

        send({
          step: 'done',
          message: `Schema indexed — ${chunks.length} tables embedded successfully.`,
          chunkCount: chunks.length,
          createdAt: new Date().toISOString(),
        });
      } catch (err) {
        send({
          step: 'error',
          message: err instanceof Error ? err.message : 'Unknown error during indexing',
        });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}

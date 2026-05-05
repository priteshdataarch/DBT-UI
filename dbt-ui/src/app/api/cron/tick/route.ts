import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { isScheduleDue } from '@/lib/scheduling';
import { runDbtSync, invalidateCache } from '@/lib/dbt';

function verifyCronSecret(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return false;
  const auth = req.headers.get('authorization');
  if (auth === `Bearer ${secret}`) return true;
  const h = req.headers.get('x-cron-secret');
  if (h === secret) return true;
  const q = req.nextUrl.searchParams.get('secret');
  if (q === secret) return true;
  return false;
}

export async function POST(req: NextRequest) {
  if (!verifyCronSecret(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const now = new Date();
  const schedules = await prisma.schedule.findMany({ where: { enabled: true } });

  const results: { id: string; ran: boolean; exitCode?: number }[] = [];

  for (const s of schedules) {
    if (!isScheduleDue(s.cronExpr, s.timezone, s.lastRunAt, now)) {
      results.push({ id: s.id, ran: false });
      continue;
    }

    const log = await prisma.scheduleRunLog.create({
      data: { scheduleId: s.id, startedAt: now },
    });

    const { exitCode, summary } = await runDbtSync({
      command: s.command,
      args: [],
      modelName: s.selectArg,
      target: s.dbtTarget,
    });

    if (['run', 'compile', 'docs'].includes(s.command)) {
      try {
        invalidateCache();
      } catch {
        /* ignore */
      }
    }

    await prisma.scheduleRunLog.update({
      where: { id: log.id },
      data: { finishedAt: new Date(), exitCode, summary },
    });

    await prisma.schedule.update({
      where: { id: s.id },
      data: { lastRunAt: new Date() },
    });

    results.push({ id: s.id, ran: true, exitCode });
  }

  return NextResponse.json({ ok: true, at: now.toISOString(), results });
}

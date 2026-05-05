import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getOrCreateDefaultTeamId } from '@/lib/teamScope';
import { requireEditor, requireReader } from '@/lib/apiAuth';
import type { SessionContext } from '@/lib/apiAuth';

async function resolveTeamId(ctx: SessionContext): Promise<string> {
  if (ctx.bypass) {
    return getOrCreateDefaultTeamId();
  }
  return ctx.teamId;
}

export async function GET() {
  const ctx = await requireReader();
  if (ctx instanceof NextResponse) return ctx;

  const teamId = await resolveTeamId(ctx);

  const rows = await prisma.schedule.findMany({
    where: { teamId },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      name: true,
      cronExpr: true,
      timezone: true,
      enabled: true,
      dbtTarget: true,
      command: true,
      selectArg: true,
      lastRunAt: true,
      createdAt: true,
      logs: { take: 3, orderBy: { startedAt: 'desc' } },
    },
  });

  return NextResponse.json({ schedules: rows });
}

export async function POST(req: NextRequest) {
  const ctx = await requireEditor();
  if (ctx instanceof NextResponse) return ctx;

  const teamId = await resolveTeamId(ctx);

  const body = (await req.json()) as {
    name?: string;
    cronExpr?: string;
    timezone?: string;
    dbtTarget?: string;
    command?: string;
    selectArg?: string | null;
    enabled?: boolean;
  };

  if (!body.name?.trim() || !body.cronExpr?.trim()) {
    return NextResponse.json({ error: 'name and cronExpr are required' }, { status: 400 });
  }

  const row = await prisma.schedule.create({
    data: {
      teamId,
      name: body.name.trim(),
      cronExpr: body.cronExpr.trim(),
      timezone: body.timezone?.trim() || 'UTC',
      dbtTarget: body.dbtTarget?.trim() || 'dev',
      command: body.command?.trim() || 'run',
      selectArg: body.selectArg?.trim() || null,
      enabled: body.enabled !== false,
      createdById: ctx.bypass ? null : ctx.userId,
    },
  });

  return NextResponse.json({ schedule: row });
}

export async function PATCH(req: NextRequest) {
  const ctx = await requireEditor();
  if (ctx instanceof NextResponse) return ctx;

  const teamId = await resolveTeamId(ctx);

  const body = (await req.json()) as {
    id?: string;
    name?: string;
    cronExpr?: string;
    timezone?: string;
    dbtTarget?: string;
    command?: string;
    selectArg?: string | null;
    enabled?: boolean;
  };

  if (!body.id) {
    return NextResponse.json({ error: 'id is required' }, { status: 400 });
  }

  const existing = await prisma.schedule.findFirst({ where: { id: body.id, teamId } });
  if (!existing) {
    return NextResponse.json({ error: 'Schedule not found' }, { status: 404 });
  }

  const row = await prisma.schedule.update({
    where: { id: body.id },
    data: {
      ...(body.name !== undefined ? { name: body.name.trim() } : {}),
      ...(body.cronExpr !== undefined ? { cronExpr: body.cronExpr.trim() } : {}),
      ...(body.timezone !== undefined ? { timezone: body.timezone.trim() } : {}),
      ...(body.dbtTarget !== undefined ? { dbtTarget: body.dbtTarget.trim() } : {}),
      ...(body.command !== undefined ? { command: body.command.trim() } : {}),
      ...(body.selectArg !== undefined
        ? { selectArg: body.selectArg === null || body.selectArg === '' ? null : body.selectArg.trim() }
        : {}),
      ...(body.enabled !== undefined ? { enabled: body.enabled } : {}),
    },
  });

  return NextResponse.json({ schedule: row });
}

export async function DELETE(req: NextRequest) {
  const ctx = await requireEditor();
  if (ctx instanceof NextResponse) return ctx;

  const teamId = await resolveTeamId(ctx);

  const id = req.nextUrl.searchParams.get('id');
  if (!id) {
    return NextResponse.json({ error: 'id query required' }, { status: 400 });
  }

  const deleted = await prisma.schedule.deleteMany({ where: { id, teamId } });
  if (deleted.count === 0) {
    return NextResponse.json({ error: 'Schedule not found' }, { status: 404 });
  }

  return NextResponse.json({ ok: true });
}

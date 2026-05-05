import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireAdmin, requireReader } from '@/lib/auth';

export async function GET() {
  const ctx = await requireReader();
  if (ctx instanceof NextResponse) return ctx;

  if (ctx.bypass) {
    return NextResponse.json({
      teamName: null,
      members: [] as { userId: string; email: string; name: string | null; role: string }[],
      mode: 'single' as const,
      hint: 'Set DBT_UI_REQUIRE_LOGIN=true and AUTH_SECRET to enable multi-user teams.',
    });
  }

  const team = await prisma.team.findUnique({
    where: { id: ctx.teamId },
    include: {
      members: {
        include: { user: { select: { id: true, email: true, name: true } } },
      },
    },
  });

  if (!team) {
    return NextResponse.json({ error: 'Team not found' }, { status: 404 });
  }

  return NextResponse.json({
    teamName: team.name,
    teamId: team.id,
    mode: 'team' as const,
    members: team.members.map((m) => ({
      userId: m.userId,
      email: m.user.email,
      name: m.user.name,
      role: m.role,
    })),
  });
}

/** Add an existing user to the team (admin only). Body: { email, role } */
export async function POST(req: NextRequest) {
  const gate = await requireAdmin();
  if (gate instanceof NextResponse) return gate;
  if (gate.bypass) {
    return NextResponse.json(
      { error: 'Team invites require DBT_UI_REQUIRE_LOGIN=true and a signed-in admin.' },
      { status: 400 }
    );
  }

  const body = (await req.json()) as { email?: string; role?: 'ADMIN' | 'EDITOR' | 'VIEWER' };
  const email = body.email?.trim().toLowerCase();
  if (!email) {
    return NextResponse.json({ error: 'email is required' }, { status: 400 });
  }

  const role = body.role ?? 'EDITOR';
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    return NextResponse.json({ error: 'No user with that email — they must register first.' }, { status: 404 });
  }

  try {
    await prisma.teamMember.create({
      data: { teamId: gate.teamId, userId: user.id, role },
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes('Unique constraint')) {
      return NextResponse.json({ error: 'User is already in this team' }, { status: 409 });
    }
    throw e;
  }
}

/** Second bootstrap user when no login (optional): not supported — use register + login flow. */

/** PATCH body: { userId, role } — admin only */
export async function PATCH(req: NextRequest) {
  const gate = await requireAdmin();
  if (gate instanceof NextResponse) return gate;
  if (gate.bypass) {
    return NextResponse.json({ error: 'Role changes require enforced login.' }, { status: 400 });
  }

  const body = (await req.json()) as { userId?: string; role?: 'ADMIN' | 'EDITOR' | 'VIEWER' };
  if (!body.userId || !body.role) {
    return NextResponse.json({ error: 'userId and role required' }, { status: 400 });
  }

  const updated = await prisma.teamMember.updateMany({
    where: { teamId: gate.teamId, userId: body.userId },
    data: { role: body.role },
  });

  if (updated.count === 0) {
    return NextResponse.json({ error: 'Member not found' }, { status: 404 });
  }

  return NextResponse.json({ ok: true });
}

/** DELETE ?userId= — admin only; cannot remove self if last admin (simplified: allow) */
export async function DELETE(req: NextRequest) {
  const gate = await requireAdmin();
  if (gate instanceof NextResponse) return gate;
  if (gate.bypass) {
    return NextResponse.json({ error: 'Removals require enforced login.' }, { status: 400 });
  }

  const userId = req.nextUrl.searchParams.get('userId');
  if (!userId) {
    return NextResponse.json({ error: 'userId query required' }, { status: 400 });
  }

  await prisma.teamMember.deleteMany({
    where: { teamId: gate.teamId, userId },
  });

  return NextResponse.json({ ok: true });
}

import { NextRequest, NextResponse } from 'next/server';
import { hash } from 'bcryptjs';
import { prisma } from '@/lib/prisma';
import { requireAdmin } from '@/lib/apiAuth';

/** Admin creates a new user account and adds them to the current team. */
export async function POST(req: NextRequest) {
  const gate = await requireAdmin();
  if (gate instanceof NextResponse) return gate;
  if (gate.bypass) {
    return NextResponse.json(
      { error: 'Creating users requires DBT_UI_REQUIRE_LOGIN=true and a signed-in admin.' },
      { status: 400 }
    );
  }

  const body = (await req.json()) as {
    email?: string;
    password?: string;
    name?: string;
    role?: 'ADMIN' | 'EDITOR' | 'VIEWER';
  };

  const email = body.email?.trim().toLowerCase();
  if (!email || !body.password || body.password.length < 8) {
    return NextResponse.json(
      { error: 'email and password (min 8 characters) required' },
      { status: 400 }
    );
  }

  const role = body.role ?? 'EDITOR';
  const passwordHash = await hash(body.password, 10);

  try {
    await prisma.user.create({
      data: {
        email,
        passwordHash,
        name: body.name?.trim() || null,
        teamMembers: { create: { teamId: gate.teamId, role } },
      },
    });
    return NextResponse.json({ ok: true, email });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes('Unique constraint')) {
      return NextResponse.json({ error: 'Email already exists' }, { status: 409 });
    }
    console.error('[team/user]', e);
    return NextResponse.json({ error: 'Failed to create user' }, { status: 500 });
  }
}

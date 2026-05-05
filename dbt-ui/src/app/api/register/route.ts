import { NextRequest, NextResponse } from 'next/server';
import { hash } from 'bcryptjs';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db';
import { getOrCreateDefaultTeamId } from '@/lib/auth';

function registrationErrorMessage(e: unknown): string {
  if (e instanceof Prisma.PrismaClientKnownRequestError) {
    if (e.code === 'P2021' || e.code === 'P1001' || e.code === 'P2022') {
      return 'Database is not reachable or tables are missing. From the dbt-ui folder run: pnpm exec prisma db push';
    }
  }
  const msg = e instanceof Error ? e.message : String(e);
  const lower = msg.toLowerCase();
  if (
    lower.includes('no such table') ||
    lower.includes('does not exist') ||
    lower.includes('sqlite_error')
  ) {
    return 'Database tables are missing. From the dbt-ui folder run: pnpm exec prisma db push && pnpm exec prisma generate';
  }
  if (process.env.NODE_ENV === 'development') {
    return `Registration failed: ${msg}`;
  }
  return 'Registration failed — check the server terminal for details.';
}

/** Whether first-admin bootstrap is still allowed (no auth). */
export async function GET() {
  try {
    const count = await prisma.user.count();
    return NextResponse.json({ bootstrapOpen: count === 0 });
  } catch {
    return NextResponse.json({ bootstrapOpen: false, error: 'database_unavailable' }, { status: 503 });
  }
}

/** Bootstrap the first admin user (no session required). Disabled once any user exists. */
export async function POST(req: NextRequest) {
  try {
    const count = await prisma.user.count();
    if (count > 0) {
      return NextResponse.json(
        { error: 'Registration is closed — users already exist. Ask an admin to add you.' },
        { status: 403 }
      );
    }

    const body = (await req.json()) as { email?: string; password?: string; name?: string };
    const email = body.email?.trim().toLowerCase();
    const password = body.password;
    if (!email || !password || password.length < 8) {
      return NextResponse.json(
        { error: 'Valid email and password (min 8 characters) required' },
        { status: 400 }
      );
    }

    const passwordHash = await hash(password, 10);
    const teamId = await getOrCreateDefaultTeamId();

    const user = await prisma.user.create({
      data: {
        email,
        passwordHash,
        name: body.name?.trim() || null,
        teamMembers: {
          create: { teamId, role: 'ADMIN' },
        },
      },
    });

    return NextResponse.json({ ok: true, userId: user.id, email: user.email });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
      return NextResponse.json({ error: 'Email already registered' }, { status: 409 });
    }
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes('Unique constraint')) {
      return NextResponse.json({ error: 'Email already registered' }, { status: 409 });
    }
    console.error('[register]', e);
    return NextResponse.json({ error: registrationErrorMessage(e) }, { status: 500 });
  }
}

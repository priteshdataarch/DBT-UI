import { NextRequest, NextResponse } from 'next/server';
import { isLoginEnforced } from '@/lib/auth/apiAuth';
import { requireEditor } from '@/lib/auth';
import {
  refreshFileLock,
  releaseFileLock,
  tryAcquireFileLock,
} from '@/lib/fileLocks';

/** Acquire or refresh an exclusive edit lock for a path (multi-user mode only). */
export async function POST(req: NextRequest) {
  const gate = await requireEditor();
  if (gate instanceof NextResponse) return gate;

  if (!isLoginEnforced()) {
    return NextResponse.json({ bypass: true });
  }

  if (gate.bypass) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const filePath = typeof body.path === 'string' ? body.path : '';
  const token = typeof body.token === 'string' ? body.token : undefined;
  if (!filePath) {
    return NextResponse.json({ error: 'path is required' }, { status: 400 });
  }

  if (token?.trim()) {
    const ok = await refreshFileLock({
      teamId: gate.teamId,
      userId: gate.userId,
      path: filePath,
      token: token.trim(),
    });
    if (!ok) {
      return NextResponse.json(
        { error: 'Lock expired or invalid — reopen the file.' },
        { status: 410 }
      );
    }
    return NextResponse.json({ ok: true, token: token.trim() });
  }

  const result = await tryAcquireFileLock({
    teamId: gate.teamId,
    userId: gate.userId,
    path: filePath,
  });

  if (!result.ok) {
    return NextResponse.json(
      { locked: true, lockedByEmail: result.lockedByEmail },
      { status: 423 }
    );
  }

  return NextResponse.json({
    ok: true,
    token: result.token,
    expiresAt: result.expiresAt,
  });
}

export async function DELETE(req: NextRequest) {
  const gate = await requireEditor();
  if (gate instanceof NextResponse) return gate;

  if (!isLoginEnforced()) {
    return NextResponse.json({ bypass: true });
  }

  if (gate.bypass) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const filePath = typeof body.path === 'string' ? body.path : '';
  const token = typeof body.token === 'string' ? body.token.trim() : '';
  if (!filePath || !token) {
    return NextResponse.json({ error: 'path and token are required' }, { status: 400 });
  }

  await releaseFileLock({
    teamId: gate.teamId,
    userId: gate.userId,
    path: filePath,
    token,
  });
  return NextResponse.json({ ok: true });
}

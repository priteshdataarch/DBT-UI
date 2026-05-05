import { NextRequest, NextResponse } from 'next/server';
import { readFile, writeFile, createFile, listDir, deleteFile, renameFile } from '@/lib/files';
import { requireEditor, requireReader } from '@/lib/auth';

export async function GET(req: NextRequest) {
  const gate = await requireReader();
  if (gate instanceof NextResponse) return gate;

  const listPath = req.nextUrl.searchParams.get('list');
  if (listPath) {
    try {
      const result = await listDir(listPath);
      return NextResponse.json(result);
    } catch {
      return NextResponse.json({ error: 'Cannot list directory' }, { status: 404 });
    }
  }

  const filePath = req.nextUrl.searchParams.get('path');
  if (!filePath) return NextResponse.json({ error: 'path or list is required' }, { status: 400 });

  try {
    const content = await readFile(filePath);
    return NextResponse.json({ content });
  } catch {
    return NextResponse.json({ error: 'File not found' }, { status: 404 });
  }
}

export async function PUT(req: NextRequest) {
  const gate = await requireEditor();
  if (gate instanceof NextResponse) return gate;

  const { path: filePath, content } = await req.json();
  if (!filePath) return NextResponse.json({ error: 'path is required' }, { status: 400 });

  try {
    await writeFile(filePath, content ?? '');
    // Intentionally no git add/commit here — models/seeds are edited via this API
    // and must show up in Source Control for manual staging. Use GitPanel to commit.
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('File write error:', error);
    return NextResponse.json({ error: 'Failed to write file' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const gate = await requireEditor();
  if (gate instanceof NextResponse) return gate;

  const { path: filePath, content } = await req.json();
  if (!filePath) return NextResponse.json({ error: 'path is required' }, { status: 400 });

  try {
    await createFile(filePath, content ?? '');
    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to create file';
    return NextResponse.json({ error: message }, { status: 409 });
  }
}

export async function DELETE(req: NextRequest) {
  const gate = await requireEditor();
  if (gate instanceof NextResponse) return gate;

  const filePath = req.nextUrl.searchParams.get('path');
  if (!filePath) return NextResponse.json({ error: 'path is required' }, { status: 400 });

  try {
    await deleteFile(filePath);
    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to delete file';
    const code = (error as NodeJS.ErrnoException)?.code;
    const lower = message.toLowerCase();
    let status = 500;
    if (code === 'ENOENT') status = 404;
    else if (
      lower.includes('traversal') ||
      lower.includes('not allowed') ||
      lower.includes('not a file') ||
      lower.includes('cannot be deleted') ||
      lower.includes('reserved')
    ) {
      status = 400;
    } else {
      status = 404;
    }
    return NextResponse.json({ error: message }, { status });
  }
}

export async function PATCH(req: NextRequest) {
  const gate = await requireEditor();
  if (gate instanceof NextResponse) return gate;

  const { path: oldPath, newName } = await req.json();
  if (!oldPath || !newName || typeof newName !== 'string') {
    return NextResponse.json({ error: 'path and newName are required' }, { status: 400 });
  }

  try {
    const newPath = await renameFile(oldPath, newName.trim());
    return NextResponse.json({ success: true, newPath });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to rename file';
    const code = (error as NodeJS.ErrnoException)?.code;
    let status = 400;
    if (code === 'ENOENT') status = 404;
    else if (message.includes('already exists')) status = 409;
    return NextResponse.json({ error: message }, { status });
  }
}

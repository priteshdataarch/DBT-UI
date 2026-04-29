import { NextRequest, NextResponse } from 'next/server';
import { readFile, writeFile, createFile, listDir } from '@/lib/fileSystem';
import { commitAndPush } from '@/lib/git';

export async function GET(req: NextRequest) {
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
  const { path: filePath, content } = await req.json();
  if (!filePath) return NextResponse.json({ error: 'path is required' }, { status: 400 });

  try {
    await writeFile(filePath, content ?? '');
    const git = await commitAndPush(filePath, 'update');
    return NextResponse.json({ success: true, git });
  } catch (error) {
    console.error('File write error:', error);
    return NextResponse.json({ error: 'Failed to write file' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const { path: filePath, content } = await req.json();
  if (!filePath) return NextResponse.json({ error: 'path is required' }, { status: 400 });

  try {
    await createFile(filePath, content ?? '');
    const git = await commitAndPush(filePath, 'add');
    return NextResponse.json({ success: true, git });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to create file';
    return NextResponse.json({ error: message }, { status: 409 });
  }
}

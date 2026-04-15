import { NextRequest, NextResponse } from 'next/server';
import { readFile, writeFile, createFile } from '@/lib/fileSystem';

export async function GET(req: NextRequest) {
  const filePath = req.nextUrl.searchParams.get('path');
  if (!filePath) return NextResponse.json({ error: 'path is required' }, { status: 400 });

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
    return NextResponse.json({ success: true });
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
    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to create file';
    return NextResponse.json({ error: message }, { status: 409 });
  }
}

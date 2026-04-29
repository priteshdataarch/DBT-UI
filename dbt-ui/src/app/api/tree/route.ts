import { NextResponse } from 'next/server';
import { getFileTree } from '@/lib/fileSystem';
import type { FileNode } from '@/types';

export async function GET() {
  try {
    const tree: FileNode = await getFileTree();
    return NextResponse.json(tree);
  } catch (error) {
    console.error('Tree fetch error:', error);
    return NextResponse.json({ error: 'Failed to read file tree' }, { status: 500 });
  }
}

import { NextResponse } from 'next/server';
import { getFileTree } from '@/lib/fileSystem';

export async function GET() {
  try {
    const tree = await getFileTree();
    return NextResponse.json(tree);
  } catch (error) {
    console.error('Tree fetch error:', error);
    return NextResponse.json({ error: 'Failed to read file tree' }, { status: 500 });
  }
}

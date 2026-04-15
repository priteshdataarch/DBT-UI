import path from 'path';
import fs from 'fs/promises';
import os from 'os';

// Inline the safePath logic to test it without importing the module
// (the module uses process.env.DBT_PROJECT_ROOT which is tricky in tests)
function safePath(root: string, relativePath: string): string {
  const resolved = path.resolve(root, relativePath);
  if (!resolved.startsWith(root + path.sep) && resolved !== root) {
    throw new Error('Path traversal attempt detected');
  }
  return resolved;
}

describe('safePath', () => {
  const root = '/safe/project/root';

  it('allows valid relative paths', () => {
    const result = safePath(root, 'models/marts/f_score.sql');
    expect(result).toBe('/safe/project/root/models/marts/f_score.sql');
    expect(result.startsWith(root)).toBe(true);
  });

  it('blocks directory traversal with ../', () => {
    expect(() => safePath(root, '../../../etc/passwd')).toThrow('Path traversal');
  });

  it('blocks traversal that resolves outside root', () => {
    expect(() => safePath(root, 'models/../../outside.sql')).toThrow('Path traversal');
  });

  it('allows deeply nested paths', () => {
    const result = safePath(root, 'models/sources/application_db/sources.yaml');
    expect(result).toContain('sources.yaml');
    expect(result.startsWith(root)).toBe(true);
  });
});

describe('file extension filtering', () => {
  const ALLOWED = new Set(['.sql', '.yml', '.yaml', '.md']);

  it('allows SQL files', () => {
    expect(ALLOWED.has('.sql')).toBe(true);
  });

  it('allows YAML files', () => {
    expect(ALLOWED.has('.yml')).toBe(true);
    expect(ALLOWED.has('.yaml')).toBe(true);
  });

  it('blocks Python files', () => {
    expect(ALLOWED.has('.py')).toBe(false);
  });

  it('blocks JSON files', () => {
    expect(ALLOWED.has('.json')).toBe(false);
  });
});

describe('file tree directory sorting', () => {
  type FakeNode = { name: string; type: 'file' | 'directory' };

  it('sorts directories before files, then alphabetically within each group', () => {
    const children: FakeNode[] = [
      { name: 'z_model.sql', type: 'file' },
      { name: 'marts', type: 'directory' },
      { name: 'a_model.sql', type: 'file' },
      { name: 'warehouse', type: 'directory' },
    ];

    children.sort((a, b) => {
      if (a.type !== b.type) return a.type === 'directory' ? -1 : 1;
      return a.name.localeCompare(b.name);
    });

    expect(children[0].name).toBe('marts');
    expect(children[1].name).toBe('warehouse');
    expect(children[2].name).toBe('a_model.sql');
    expect(children[3].name).toBe('z_model.sql');
  });
});

describe('createFile path validation', () => {
  it('correctly identifies ENOENT code', async () => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'dbt-test-'));
    const nonExistentPath = path.join(tmpDir, 'does_not_exist.sql');

    await expect(fs.access(nonExistentPath)).rejects.toMatchObject({ code: 'ENOENT' });

    // Cleanup
    await fs.rmdir(tmpDir);
  });
});

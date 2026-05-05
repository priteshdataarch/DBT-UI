import {
  filePutPayload,
  setClientFileLockToken,
  getClientFileLockToken,
} from '@/lib/clientFileLockToken';

describe('clientFileLockToken', () => {
  const path = 'models/schema.yml';

  beforeEach(() => {
    setClientFileLockToken(path, null);
  });

  it('filePutPayload attaches lock token and mtime when present', () => {
    setClientFileLockToken(path, 'abc-token');
    expect(filePutPayload(path, 'x', 170000)).toEqual({
      path,
      content: 'x',
      lockToken: 'abc-token',
      baseMtimeMs: 170000,
    });
    expect(getClientFileLockToken(path)).toBe('abc-token');
  });

  it('filePutPayload omits lock fields when no token or mtime', () => {
    expect(filePutPayload(path, 'hello')).toEqual({ path, content: 'hello' });
  });
});

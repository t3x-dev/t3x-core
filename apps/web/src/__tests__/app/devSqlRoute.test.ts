import { NextRequest } from 'next/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { GET, POST } from '@/app/api/dev/sql/route';

const executeRawSQLMock = vi.hoisted(() => vi.fn());

vi.mock('@/infrastructure/db', () => ({
  executeRawSQL: executeRawSQLMock,
}));

function createPostRequest(sql: string) {
  return new NextRequest('http://localhost/api/dev/sql', {
    method: 'POST',
    body: JSON.stringify({ sql }),
    headers: { 'content-type': 'application/json' },
  });
}

describe('dev SQL route', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    executeRawSQLMock.mockReset();
  });

  it('requires an explicit opt-in even in development mode', async () => {
    vi.stubEnv('NODE_ENV', 'development');

    const res = await GET();
    const body = await res.json();

    expect(res.status).toBe(403);
    expect(body.error).toContain('T3X_ENABLE_DEV_SQL=true');
    expect(executeRawSQLMock).not.toHaveBeenCalled();
  });

  it('executes SQL only when development mode and the opt-in flag are enabled', async () => {
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('T3X_ENABLE_DEV_SQL', 'true');
    executeRawSQLMock.mockResolvedValueOnce([{ ok: true }]);

    const res = await POST(createPostRequest('SELECT 1'));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toEqual({
      rows: [{ ok: true }],
      rowCount: 1,
    });
    expect(executeRawSQLMock).toHaveBeenCalledWith('SELECT 1');
  });
});

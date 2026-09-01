// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const fetchWithTimeoutMock = vi.fn();

vi.mock('@/infrastructure/core', async () => {
  const actual =
    await vi.importActual<typeof import('@/infrastructure/core')>('@/infrastructure/core');
  return {
    ...actual,
    fetchWithTimeout: (...args: unknown[]) => fetchWithTimeoutMock(...args),
  };
});

import { listYOpsLog } from '@/infrastructure/trees';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify({ success: true, data: body }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

beforeEach(() => {
  fetchWithTimeoutMock.mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('listYOpsLog URL shape', () => {
  it('requests active rows by default', async () => {
    fetchWithTimeoutMock.mockResolvedValueOnce(jsonResponse([]));
    await listYOpsLog('conv_1');
    expect(fetchWithTimeoutMock.mock.calls[0][0]).toContain(
      '/conversations/conv_1/yops?active_only=true'
    );
  });

  it('can request the full audit log', async () => {
    fetchWithTimeoutMock.mockResolvedValueOnce(jsonResponse([]));
    await listYOpsLog('conv_1', undefined, { activeOnly: false });
    const url = fetchWithTimeoutMock.mock.calls[0][0] as string;
    expect(url).toContain('/conversations/conv_1/yops');
    expect(url).not.toContain('active_only=true');
  });
});

import { afterEach, describe, expect, it, vi } from 'vitest';
import { getCurrentPersonalNamespace } from '@/infrastructure/namespaces';

describe('getCurrentPersonalNamespace', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns the authenticated user personal namespace', async () => {
    const namespace = {
      namespace_id: 'ns_test_a',
      slug: 'test-a',
      kind: 'personal' as const,
      display_name: 'test-a',
      created_at: '2026-10-30T00:00:00.000Z',
    };
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({ success: true, data: namespace }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    );

    await expect(getCurrentPersonalNamespace()).resolves.toEqual(namespace);
    expect(fetchMock.mock.calls[0]?.[0]).toMatch(/\/api\/v1\/namespaces\/me$/);
  });

  it('returns null when the authenticated user has not created a namespace', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          success: false,
          error: { code: 'NOT_FOUND', message: 'Personal namespace not created yet' },
        }),
        { status: 404, headers: { 'Content-Type': 'application/json' } }
      )
    );

    await expect(getCurrentPersonalNamespace()).resolves.toBeNull();
  });
});

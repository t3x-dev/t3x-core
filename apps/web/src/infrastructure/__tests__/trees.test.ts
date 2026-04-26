// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Hoisted mock for the fetchWithTimeout boundary. Inspecting the call args
// pins the actual HTTP body shape — the layer above (yopsLog / yopsService)
// is already covered for the option-forwarding contract; this test fills
// the last gap by asserting the wire format.
const fetchWithTimeoutMock = vi.fn();

vi.mock('@/infrastructure/core', async () => {
  const actual =
    await vi.importActual<typeof import('@/infrastructure/core')>('@/infrastructure/core');
  return {
    ...actual,
    fetchWithTimeout: (...args: unknown[]) => fetchWithTimeoutMock(...args),
  };
});

import { createYOpsEntry } from '@/infrastructure/trees';

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

describe('createYOpsEntry HTTP body shape', () => {
  const ops = [{ set: { path: 'trip/dest', value: 'HZ' } }] as never;
  const baseEntry = {
    id: 'yl_1',
    conversation_id: 'conv_1',
    project_id: 'proj_1',
    source: 'pipeline',
    turn_hash: null,
    yops: ops,
    created_at: '2026-04-26T00:00:00Z',
    superseded_ids: [],
  };

  it('omits replace_active_llm_draft when no options are passed', async () => {
    // Legacy callers (gold edits, compression, MCP, any pre-#900 caller)
    // must keep their existing append-only semantics. Omitting the field
    // entirely lets the API use its default (false), which is the
    // backward-compatible path.
    fetchWithTimeoutMock.mockResolvedValueOnce(jsonResponse(baseEntry));

    await createYOpsEntry('conv_1', ops, 'pipeline');

    const [, init] = fetchWithTimeoutMock.mock.calls[0];
    const body = JSON.parse((init as RequestInit).body as string) as Record<string, unknown>;
    expect(body).not.toHaveProperty('replace_active_llm_draft');
    // Sanity: the rest of the payload is still what callers expect.
    expect(body.source).toBe('pipeline');
    expect(body.yops).toEqual(ops);
  });

  it('emits replace_active_llm_draft: true when option is set', async () => {
    // Apply-from-staged-Extract-draft path: the hook reads hasDraft and
    // passes { replaceActiveLLMDraft: true } so the API marks prior
    // active LLM drafts as superseded inside the same transaction. Pin
    // the wire field name + value here — earlier tests pin the
    // function-arg shape; this one pins what actually goes over HTTP.
    fetchWithTimeoutMock.mockResolvedValueOnce(jsonResponse(baseEntry));

    await createYOpsEntry('conv_1', ops, 'pipeline', undefined, {
      replaceActiveLLMDraft: true,
    });

    const [, init] = fetchWithTimeoutMock.mock.calls[0];
    const body = JSON.parse((init as RequestInit).body as string) as Record<string, unknown>;
    expect(body.replace_active_llm_draft).toBe(true);
  });

  it('emits replace_active_llm_draft: false when explicitly false', async () => {
    // Manual-edit Apply path (scriptDirty without hasDraft): hook passes
    // { replaceActiveLLMDraft: false }. The wire still includes the
    // field — explicit false is distinguishable from omission so the
    // API's default-false branch is exercised intentionally, not by
    // accident.
    fetchWithTimeoutMock.mockResolvedValueOnce(jsonResponse(baseEntry));

    await createYOpsEntry('conv_1', ops, 'manual', undefined, {
      replaceActiveLLMDraft: false,
    });

    const [, init] = fetchWithTimeoutMock.mock.calls[0];
    const body = JSON.parse((init as RequestInit).body as string) as Record<string, unknown>;
    expect(body.replace_active_llm_draft).toBe(false);
  });

  it('preserves metadata alongside replace_active_llm_draft', async () => {
    // Both fields independently optional; passing both at once is the
    // shape future callers (e.g. compression with a replace flag) will
    // need to use. Confirm they don't clobber each other.
    fetchWithTimeoutMock.mockResolvedValueOnce(jsonResponse(baseEntry));

    await createYOpsEntry(
      'conv_1',
      ops,
      'pipeline',
      { extracted_at: '2026-04-26T00:00:00Z' },
      { replaceActiveLLMDraft: true }
    );

    const [, init] = fetchWithTimeoutMock.mock.calls[0];
    const body = JSON.parse((init as RequestInit).body as string) as Record<string, unknown>;
    expect(body.metadata).toEqual({ extracted_at: '2026-04-26T00:00:00Z' });
    expect(body.replace_active_llm_draft).toBe(true);
  });
});

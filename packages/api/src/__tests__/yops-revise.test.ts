import { Hono } from 'hono';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  mockFindConversationById,
  mockInsertYOpsLogEntry,
  mockGetDB,
  mockResolveProviderAndModel,
  mockGenerateStructured,
} = vi.hoisted(() => ({
  mockFindConversationById: vi.fn(),
  mockInsertYOpsLogEntry: vi.fn(),
  mockGetDB: vi.fn(),
  mockResolveProviderAndModel: vi.fn(),
  mockGenerateStructured: vi.fn(),
}));

vi.mock('@t3x-dev/storage', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@t3x-dev/storage')>();
  return {
    ...actual,
    findConversationById: mockFindConversationById,
    insertYOpsLogEntry: mockInsertYOpsLogEntry,
  };
});

vi.mock('../lib/db', () => ({
  getDB: mockGetDB,
  closeDB: vi.fn(() => Promise.resolve()),
}));

vi.mock('../lib/provider-resolver', () => ({
  resolveProviderAndModel: mockResolveProviderAndModel,
}));

import { yopsReviseRoutes } from '../routes/yops-revise.openapi';

const app = new Hono();
app.route('/', yopsReviseRoutes);

const tree = {
  key: 'trip',
  slots: { destination: 'Hangzhou' },
  children: [],
};

const turn = {
  turn_hash: 'sha256:t1',
  role: 'user',
  content: 'The trip destination should be Tokyo.',
};

async function postRevise(overrides: Record<string, unknown> = {}) {
  return app.request('/v1/conversations/conv_1/yops/revise', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      feedback: 'Use Tokyo as the destination.',
      trees: [tree],
      relations: [],
      yops: [{ set: { path: 'trip/destination', value: 'Hangzhou' } }],
      turns: [turn],
      provider: 'openai',
      model: 'gpt-5.4',
      ...overrides,
    }),
  });
}

describe('POST /v1/conversations/{conversationId}/yops/revise', () => {
  beforeEach(() => {
    mockFindConversationById.mockReset();
    mockInsertYOpsLogEntry.mockReset();
    mockGetDB.mockReset();
    mockResolveProviderAndModel.mockReset();
    mockGenerateStructured.mockReset();

    mockGetDB.mockResolvedValue({ id: 'db' });
    mockFindConversationById.mockResolvedValue({
      conversationId: 'conv_1',
      projectId: 'proj_1',
    });
    mockResolveProviderAndModel.mockResolvedValue({
      ok: true,
      providerId: 'openai',
      provider: { id: 'openai', generateStructured: mockGenerateStructured },
      model: 'gpt-5.4',
      registry: {},
    });
  });

  it('returns sourced revised ops and a deterministic dry-run preview', async () => {
    mockGenerateStructured.mockResolvedValue({
      data: {
        reason: 'Updated the destination per feedback.',
        yops: [{ set: { path: 'trip/destination', value: 'Tokyo' } }],
      },
      usage: { inputTokens: 10, outputTokens: 5 },
    });

    const res = await postRevise();

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.kind).toBe('ok');
    expect(body.data.reason).toBe('Updated the destination per feedback.');
    expect(body.data.ops).toHaveLength(1);
    expect(body.data.ops[0].source).toMatchObject({
      type: 'llm',
      model: 'gpt-5.4',
      turn_ref: {
        turn_hash: 'sha256:t1',
        quote: 'The trip destination should be Tokyo.',
      },
    });
    expect(body.data.dry_run).toMatchObject({
      ok: true,
      applied: 1,
    });
    expect(body.data.dry_run.preview.trees[0].slots.destination).toBe('Tokyo');
  });

  it('returns validation_failed when revised ops do not dry-run cleanly', async () => {
    mockGenerateStructured.mockResolvedValue({
      data: {
        reason: 'Tried to add a relation to a missing node.',
        yops: [{ relate: { from: 'missing', to: 'trip', type: 'supports' } }],
      },
      usage: { inputTokens: 10, outputTokens: 5 },
    });

    const res = await postRevise();

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.kind).toBe('validation_failed');
    expect(body.data.dry_run.ok).toBe(false);
    expect(body.data.dry_run.error).toMatchObject({
      op_index: 0,
      code: 'RELATE_NOT_FOUND',
    });
  });

  it('does not persist yops_log entries before explicit Apply', async () => {
    mockGenerateStructured.mockResolvedValue({
      data: {
        reason: 'Updated the destination per feedback.',
        yops: [{ set: { path: 'trip/destination', value: 'Tokyo' } }],
      },
      usage: { inputTokens: 10, outputTokens: 5 },
    });

    const res = await postRevise();

    expect(res.status).toBe(200);
    expect(mockInsertYOpsLogEntry).not.toHaveBeenCalled();
  });

  it('preserves relation metadata in dry-run previews', async () => {
    mockGenerateStructured.mockResolvedValue({
      data: {
        reason: 'Updated the destination per feedback.',
        yops: [{ set: { path: 'trip/destination', value: 'Tokyo' } }],
      },
      usage: { inputTokens: 10, outputTokens: 5 },
    });

    const res = await postRevise({
      trees: [tree, { key: 'plan', slots: {}, children: [] }],
      relations: [
        {
          from: 'trip',
          to: 'plan',
          type: 'depends',
          from_project: 'proj_source',
          to_project: 'proj_target',
        },
      ],
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.kind).toBe('ok');
    expect(body.data.dry_run.preview.relations[0]).toMatchObject({
      from: 'trip',
      to: 'plan',
      type: 'depends',
      from_project: 'proj_source',
      to_project: 'proj_target',
    });
  });
});

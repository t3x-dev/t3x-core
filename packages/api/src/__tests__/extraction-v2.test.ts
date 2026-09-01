import { beforeEach, describe, expect, it, vi } from 'vitest';

const coreMock = vi.hoisted(() => ({ extractAndApply: vi.fn() }));
const storageMock = vi.hoisted(() => ({
  deleteYOpsLogEntry: vi.fn(),
  findConversationById: vi.fn(),
  findTurnsByConversation: vi.fn(),
  findTurnsByHashes: vi.fn(),
  listActiveYOpsLogByConversation: vi.fn(),
}));
const providerMock = vi.hoisted(() => ({ resolveProviderAndModel: vi.fn() }));
const replayMock = vi.hoisted(() => ({
  getConversationInheritedBaseline: vi.fn(),
  replayEntriesOnBaselineFailFast: vi.fn(),
}));

vi.mock('@t3x-dev/core', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@t3x-dev/core')>()),
  extractAndApply: coreMock.extractAndApply,
}));
vi.mock('@t3x-dev/storage', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@t3x-dev/storage')>()),
  ...storageMock,
}));
vi.mock('../lib/provider-resolver', () => providerMock);
vi.mock('../lib/yops-log-utils', () => replayMock);

import { runApiExtractionV2 } from '../lib/extraction-v2';
import { createInferenceRuntime } from '../lib/inference';

const inference = {
  runtime: createInferenceRuntime(),
  runId: 'test:extraction-v2',
  scope: {
    actor: { kind: 'user' as const, id: 'user:test' },
    projectId: 'proj_1',
    projectVisibility: 'unknown' as const,
  },
};

describe('runApiExtractionV2', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    storageMock.findConversationById.mockResolvedValue({ conversationId: 'conv_1' });
    storageMock.findTurnsByConversation.mockResolvedValue([
      { turnHash: 'turn_1', role: 'user', content: 'Keep the audit trail.' },
    ]);
    storageMock.findTurnsByHashes.mockResolvedValue([
      { turnHash: 'turn_1', role: 'user', content: 'Keep the audit trail.' },
    ]);
    providerMock.resolveProviderAndModel.mockResolvedValue({
      ok: true,
      providerId: 'provider_1',
      provider: { generate: vi.fn() },
      model: 'model_1',
    });
    coreMock.extractAndApply.mockResolvedValue({
      ok: true,
      snapshot: {
        trees: [{ key: 'prd', slots: { title: 'Audit trail' }, children: [] }],
        relations: [],
      },
      compiled: { ops: [] },
    });
  });

  it('uses a server-resolved Workspace baseline without consulting conversation YOps logs', async () => {
    const baselineSnapshot = {
      trees: [{ key: 'prd', slots: { title: 'Existing' }, children: [] }],
      relations: [],
    };

    const result = await runApiExtractionV2({
      db: {} as never,
      conversationId: 'conv_1',
      turnHashes: ['turn_1'],
      baselineSnapshot,
      inference,
    });

    expect(result.ok).toBe(true);
    expect(storageMock.findTurnsByHashes).toHaveBeenCalledWith(expect.anything(), {
      conversationId: 'conv_1',
      turnHashes: ['turn_1'],
    });
    expect(storageMock.findTurnsByConversation).not.toHaveBeenCalled();
    expect(storageMock.listActiveYOpsLogByConversation).not.toHaveBeenCalled();
    expect(replayMock.getConversationInheritedBaseline).not.toHaveBeenCalled();
    expect(coreMock.extractAndApply).toHaveBeenCalledWith(
      expect.objectContaining({ mode: 'incremental', snapshot: baselineSnapshot })
    );
  });
});

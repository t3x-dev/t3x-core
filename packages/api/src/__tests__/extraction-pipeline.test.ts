/**
 * Extraction pipeline event adapter tests.
 *
 * The generator now preserves the JSON/SSE event surface while delegating
 * extraction semantics to the canonical v2 helper.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ExtractionPipelineParams, PipelineEvent } from '../lib/extraction-pipeline';

const mockDB = {
  transaction: vi.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn(mockDB)),
};

const mockConversation = {
  projectId: 'proj_test1',
  conversationId: 'conv_test1',
  alias: null,
};

const mockRunApiExtractionV2 = vi.fn();
const mockRecordEvent = vi.fn();
const mockCreateTopic = vi.fn();
const mockListTopicsByConversation = vi.fn();
const mockInsertYOpsLogEntry = vi.fn();
const mockSetAliasIfNull = vi.fn();
const mockRebuildTreesFromSnapshot = vi.fn();

vi.mock('../lib/db', () => ({
  getDB: vi.fn(() => Promise.resolve(mockDB)),
  closeDB: vi.fn(() => Promise.resolve()),
}));

vi.mock('../middleware/logger', () => ({
  pinoLogger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

vi.mock('@t3x-dev/storage', () => ({
  findConversationById: vi.fn(() => Promise.resolve(mockConversation)),
  recordEvent: (...args: unknown[]) => mockRecordEvent(...args),
  listTopicsByConversation: (...args: unknown[]) => mockListTopicsByConversation(...args),
  createTopic: (...args: unknown[]) => mockCreateTopic(...args),
  insertYOpsLogEntry: (...args: unknown[]) => mockInsertYOpsLogEntry(...args),
  setAliasIfNull: (...args: unknown[]) => mockSetAliasIfNull(...args),
}));

vi.mock('../lib/tree-state-sync', () => ({
  rebuildTreesFromSnapshot: (...args: unknown[]) => mockRebuildTreesFromSnapshot(...args),
}));

vi.mock('../lib/extraction-v2', () => ({
  runApiExtractionV2: (...args: unknown[]) => mockRunApiExtractionV2(...args),
}));

import { runExtractionPipeline } from '../lib/extraction-pipeline';

async function collectEvents(params: ExtractionPipelineParams): Promise<PipelineEvent[]> {
  const events: PipelineEvent[] = [];
  for await (const event of runExtractionPipeline(params)) {
    events.push(event);
  }
  return events;
}

describe('runExtractionPipeline', () => {
  const baseParams: ExtractionPipelineParams = {
    conversationId: 'conv_test1',
    projectId: 'proj_test1',
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockListTopicsByConversation.mockResolvedValue([]);
    mockCreateTopic.mockResolvedValue({ id: 'topic_new' });
    mockInsertYOpsLogEntry.mockResolvedValue({ id: 'yops_log_1' });
    mockSetAliasIfNull.mockResolvedValue('trip_plan');
    mockRebuildTreesFromSnapshot.mockResolvedValue(undefined);
  });

  it('yields the canonical success event sequence and persists the snapshot', async () => {
    mockRunApiExtractionV2.mockResolvedValueOnce({
      ok: true,
      mode: 'bootstrap',
      snapshot: {
        trees: [{ key: 'trip_plan', slots: { destination: 'Hangzhou' }, children: [] }],
        relations: [],
      },
      ops: [{ define: { path: 'trip_plan' }, source: { type: 'llm' } }],
      lastTurnHash: 'sha256:turn1',
    });

    const events = await collectEvents(baseParams);

    expect(events.map((event) => event.type)).toEqual([
      'status',
      'yop',
      'status',
      'reorganized',
      'status',
      'done',
    ]);

    expect(events.find((event) => event.type === 'done')?.data).toMatchObject({
      status: 'completed',
      yops_log_id: 'yops_log_1',
    });

    expect(mockRunApiExtractionV2).toHaveBeenCalledWith({
      db: mockDB,
      conversationId: 'conv_test1',
      turnHashes: undefined,
      topicId: undefined,
      forceExtract: undefined,
    });

    expect(mockInsertYOpsLogEntry).toHaveBeenCalledWith(
      mockDB,
      expect.objectContaining({
        conversationId: 'conv_test1',
        projectId: 'proj_test1',
        topicId: 'topic_new',
      })
    );
    expect(mockRebuildTreesFromSnapshot).toHaveBeenCalled();
    expect(mockRecordEvent).toHaveBeenNthCalledWith(
      1,
      mockDB,
      expect.objectContaining({ type: 'extraction.started' })
    );
    expect(mockRecordEvent).toHaveBeenNthCalledWith(
      2,
      mockDB,
      expect.objectContaining({ type: 'extraction.done' })
    );
  });

  it('yields skipped when the v2 pipeline returns no ops and no trees', async () => {
    mockRunApiExtractionV2.mockResolvedValueOnce({
      ok: true,
      mode: 'bootstrap',
      snapshot: { trees: [], relations: [] },
      ops: [],
      lastTurnHash: '',
    });

    const events = await collectEvents(baseParams);

    expect(events.map((event) => event.type)).toEqual(['status', 'skipped']);
    expect(events[1].data.reason).toBe('No extractable content found in the conversation.');
    expect(mockRecordEvent).not.toHaveBeenCalled();
    expect(mockInsertYOpsLogEntry).not.toHaveBeenCalled();
  });

  it('yields skipped with the current snapshot when the v2 pipeline returns no semantic changes', async () => {
    mockRunApiExtractionV2.mockResolvedValueOnce({
      ok: true,
      mode: 'incremental',
      snapshot: {
        trees: [{ key: 'trip_plan', slots: { destination: 'Hangzhou' }, children: [] }],
        relations: [],
      },
      ops: [],
      lastTurnHash: 'sha256:turn2',
    });

    const events = await collectEvents(baseParams);

    expect(events.map((event) => event.type)).toEqual(['status', 'skipped']);
    expect(events[1].data).toEqual({
      reason: 'No semantic changes detected from the selected turns.',
      snapshot: {
        trees: [{ key: 'trip_plan', slots: { destination: 'Hangzhou' }, children: [] }],
        relations: [],
      },
      delta: [],
    });
    expect(mockRecordEvent).not.toHaveBeenCalled();
    expect(mockInsertYOpsLogEntry).not.toHaveBeenCalled();
  });

  it('maps invalid turn selection to INVALID_REQUEST', async () => {
    mockRunApiExtractionV2.mockResolvedValueOnce({
      ok: false,
      kind: 'invalid_request',
      message: 'None of the specified turn_hashes were found',
    });

    const events = await collectEvents(baseParams);

    expect(events.at(-1)).toEqual({
      type: 'error',
      data: {
        code: 'INVALID_REQUEST',
        message: 'None of the specified turn_hashes were found',
      },
    });
  });

  it('maps provider unavailability to LLM_NOT_CONFIGURED', async () => {
    mockRunApiExtractionV2.mockResolvedValueOnce({
      ok: false,
      kind: 'provider_unavailable',
      message: 'No configured extraction provider is available',
    });

    const events = await collectEvents(baseParams);

    expect(events.at(-1)).toEqual({
      type: 'error',
      data: {
        code: 'LLM_NOT_CONFIGURED',
        message: 'No configured extraction provider is available',
      },
    });
  });
});

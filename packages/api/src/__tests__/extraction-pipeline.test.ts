/**
 * Extraction Pipeline Tests
 *
 * Verifies that the async generator yields PipelineEvents in the correct
 * order and handles each pipeline path (skip, drift, success, error).
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ExtractionPipelineParams, PipelineEvent } from '../lib/extraction-pipeline';

// ═══════════════════════════════════════════════════════════════════════════
// Mocks — must be declared before importing the module under test
// ═══════════════════════════════════════════════════════════════════════════

const mockDB = {
  transaction: vi.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn(mockDB)),
};

vi.mock('../lib/db', () => ({
  getDB: vi.fn(() => Promise.resolve(mockDB)),
  closeDB: vi.fn(() => Promise.resolve()),
}));

vi.mock('../middleware/logger', () => ({
  pinoLogger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

// ── Storage mocks ──
const mockConversation = {
  projectId: 'proj_test1',
  conversationId: 'conv_test1',
  alias: null,
};
const mockTurns = [
  {
    turnHash: 'sha256:turn1',
    role: 'user',
    content: 'I prefer dark roast coffee',
    createdAt: new Date('2025-01-01'),
  },
  {
    turnHash: 'sha256:turn2',
    role: 'assistant',
    content: 'Got it, dark roast noted.',
    createdAt: new Date('2025-01-02'),
  },
];
const mockProject = { projectId: 'proj_test1', extractionStyle: null, ownerId: null };

vi.mock('@t3x-dev/storage', () => ({
  findConversationById: vi.fn(() => Promise.resolve(mockConversation)),
  findTurnsByConversation: vi.fn(() => Promise.resolve(mockTurns)),
  findProjectById: vi.fn(() => Promise.resolve(mockProject)),
  findUserById: vi.fn(() => Promise.resolve(null)),
  listYOpsLogByConversation: vi.fn(() => Promise.resolve([])),
  listYOpsLogByTopic: vi.fn(() => Promise.resolve([])),
  listTopicsByConversation: vi.fn(() => Promise.resolve([])),
  createTopic: vi.fn(() => Promise.resolve({ id: 'topic_new' })),
  insertYOpsLogEntry: vi.fn(() => Promise.resolve({ id: 'yops_log_1' })),
  // T6: alias derivation — default to no-op (alias already present path is
  // covered above via `alias: null` + mock returning null means setAliasIfNull
  // did nothing). Tests that care about alias-specific behavior should
  // override this with vi.mocked(...).
  setAliasIfNull: vi.fn(() => Promise.resolve(null)),
  recordEvent: vi.fn(() => Promise.resolve(1n)),
}));

// ── Core mocks ──
vi.mock('@t3x-dev/core', () => ({
  DEFAULT_STYLE: {
    granularity: 'balanced',
    quote_length: 'contextual',
    update_stance: 'balanced',
    tier3: 'skip',
  },
  computeSessionContext: vi.fn(() => ({ newTurnCount: 2, totalTurnCount: 2, extractionCount: 0 })),
  decideAction: vi.fn(() => 'extract'),
  checkReadiness: vi.fn(() => ({ pass: true, reason: 'ok' })),
  preFilterDrift: vi.fn(() => ({ needsLLM: false })),
  detectDrift: vi.fn(() => Promise.resolve({ drifted: false })),
  flattenTrees: vi.fn(() => []),
  Extractor: vi.fn().mockImplementation(() => ({
    extract: vi.fn(() =>
      Promise.resolve({
        ok: true,
        yops: [
          {
            op: 'upsert',
            path: '/coffee',
            value: { key: 'coffee', slots: { roast: 'dark' }, children: [] },
          },
        ],
        snapshot: {
          trees: [{ key: 'coffee', slots: { roast: 'dark' }, children: [] }],
          relations: [],
        },
        usage: { inputTokens: 100, outputTokens: 50 },
      })
    ),
  })),
  createMeaningPipeline: vi.fn(() => ({
    run: vi.fn(() =>
      Promise.resolve({
        content: {
          trees: [{ key: 'coffee', slots: { roast: 'dark' }, children: [] }],
          relations: [],
        },
        meta: {
          completedAgents: ['organizer'],
          agentErrors: [],
          stepSnapshots: [{ agent: 'organizer', frameCount: 1, quality: { score: 0.9 } }],
          totalUsage: { inputTokens: 50, outputTokens: 25 },
        },
        quality: { score: 0.9, frameCount: 1, maxDepth: 1, duplicateTypes: 0 },
      })
    ),
  })),
  GateRunner: vi.fn().mockImplementation(() => ({
    run: vi.fn(() =>
      Promise.resolve({
        structure: { passed: true, checks: [] },
      })
    ),
  })),
  checkDiffCompatibility: vi.fn(() => ({ compatible: true, errors: [] })),
  detectAmbiguity: vi.fn(() => Promise.resolve({ clean: true, questions: [] })),
  pipelineEmitter: { emit: vi.fn() },
}));

// ── Provider registry mock ──
const mockProvider = { id: 'mock-provider', generate: vi.fn() };
const mockRegistryInstance = {
  tryWithFallback: vi.fn((_role: string, fn: (p: unknown) => unknown) => fn(mockProvider)),
};

vi.mock('../lib/provider-registry', () => ({
  getProviderRegistry: vi.fn(() => Promise.resolve(mockRegistryInstance)),
}));

vi.mock('../lib/usage-tracking', () => ({
  wrapWithUsageTracking: vi.fn((provider: unknown) => ({
    provider,
    usage: { inputTokens: 100, outputTokens: 50 },
  })),
  recordUsageFireAndForget: vi.fn(),
}));

vi.mock('../lib/tree-state-sync', () => ({
  rebuildTreesFromSnapshot: vi.fn(() => Promise.resolve()),
}));

vi.mock('../lib/yops-log-utils', () => ({
  replayYOpsLog: vi.fn(() => ({ trees: [], relations: [] })),
  toYOpsLogEntries: vi.fn((records: unknown[]) => records),
}));

vi.mock('../schemas/contracts', () => ({
  ExtractionStyleSchema: {
    safeParse: vi.fn(() => ({ success: false })),
  },
}));

// ── Import module under test (AFTER all mocks) ──
import { runExtractionPipeline } from '../lib/extraction-pipeline';

// ═══════════════════════════════════════════════════════════════════════════
// Helper
// ═══════════════════════════════════════════════════════════════════════════

async function collectEvents(params: ExtractionPipelineParams): Promise<PipelineEvent[]> {
  const events: PipelineEvent[] = [];
  for await (const event of runExtractionPipeline(params)) {
    events.push(event);
  }
  return events;
}

// ═══════════════════════════════════════════════════════════════════════════
// Tests
// ═══════════════════════════════════════════════════════════════════════════

describe('runExtractionPipeline', () => {
  const baseParams: ExtractionPipelineParams = {
    conversationId: 'conv_test1',
    projectId: 'proj_test1',
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    // Do NOT call vi.restoreAllMocks() — it removes vi.mock() implementations
  });

  it('yields events in correct order for a successful extraction', async () => {
    const events = await collectEvents(baseParams);

    const types = events.map((e) => e.type);
    expect(types).toEqual([
      'status', // session_state
      'status', // readiness_gate
      'status', // drift_check clear
      'status', // extracting
      'yop', // each yop
      'status', // reorganizing
      'reorganized', // pipeline result
      'status', // validating
      'gate', // gate result
      'status', // persisting
      'done', // final
    ]);
  });

  it('yields session_state and readiness_gate status events', async () => {
    const events = await collectEvents(baseParams);

    const sessionEvent = events.find((e) => e.data.step === 'session_state');
    expect(sessionEvent).toBeDefined();
    expect(sessionEvent!.type).toBe('status');
    expect(sessionEvent!.data.result).toBe('proceed');

    const readinessEvent = events.find((e) => e.data.step === 'readiness_gate');
    expect(readinessEvent).toBeDefined();
    expect(readinessEvent!.type).toBe('status');
    expect(readinessEvent!.data.result).toBe('proceed');
  });

  it('yields skipped event when session decision is wait', async () => {
    const { decideAction } = await import('@t3x-dev/core');
    vi.mocked(decideAction).mockReturnValueOnce('wait');

    const events = await collectEvents(baseParams);

    const types = events.map((e) => e.type);
    expect(types).toContain('status');
    expect(types).toContain('skipped');
    expect(types).not.toContain('done');

    const skippedEvent = events.find((e) => e.type === 'skipped');
    expect(skippedEvent!.data.reason).toBe('wait');
  });

  it('yields skipped event when readiness gate fails', async () => {
    const { checkReadiness } = await import('@t3x-dev/core');
    // biome-ignore lint/suspicious/noExplicitAny: mock type mismatch in tests
    vi.mocked(checkReadiness).mockReturnValueOnce({ pass: false, reason: 'too_short' } as any);

    const events = await collectEvents(baseParams);

    const types = events.map((e) => e.type);
    expect(types).toContain('skipped');
    expect(types).not.toContain('done');

    const skippedEvent = events.find((e) => e.type === 'skipped');
    expect(skippedEvent!.data.reason).toBe('too_short');
  });

  it('skips session state and readiness gate when forceExtract is true', async () => {
    const events = await collectEvents({ ...baseParams, forceExtract: true });

    const types = events.map((e) => e.type);
    expect(types).not.toContain('skipped');
    // Should not have session_state or readiness_gate status events
    const statusSteps = events.filter((e) => e.type === 'status').map((e) => e.data.step);
    expect(statusSteps).not.toContain('session_state');
    expect(statusSteps).not.toContain('readiness_gate');
    expect(types).toContain('done');
  });

  it('yields error when conversation is not found', async () => {
    const { findConversationById } = await import('@t3x-dev/storage');
    // biome-ignore lint/suspicious/noExplicitAny: mock type mismatch in tests
    vi.mocked(findConversationById).mockResolvedValueOnce(null as any);

    const events = await collectEvents(baseParams);

    expect(events).toHaveLength(1);
    expect(events[0].type).toBe('error');
    expect(events[0].data.code).toBe('CONVERSATION_NOT_FOUND');
  });

  it('yields error when no turns are found', async () => {
    const { findTurnsByConversation } = await import('@t3x-dev/storage');
    vi.mocked(findTurnsByConversation).mockResolvedValueOnce([]);

    const events = await collectEvents(baseParams);

    expect(events).toHaveLength(1);
    expect(events[0].type).toBe('error');
    expect(events[0].data.code).toBe('CONVERSATION_NOT_FOUND');
  });

  it('yields error when extraction fails', async () => {
    const { Extractor } = await import('@t3x-dev/core');
    vi.mocked(Extractor).mockImplementationOnce(
      () =>
        ({
          extract: vi.fn(() =>
            Promise.resolve({
              ok: false,
              error: 'LLM returned invalid YAML',
              usage: { inputTokens: 100, outputTokens: 0 },
            })
          ),
          // biome-ignore lint/suspicious/noExplicitAny: mock type mismatch in tests
        }) as any
    );

    const events = await collectEvents({ ...baseParams, forceExtract: true });

    const types = events.map((e) => e.type);
    expect(types).toContain('error');
    const errorEvent = events.find((e) => e.type === 'error');
    expect(errorEvent!.data.code).toBe('EXTRACTION_FAILED');
    expect(errorEvent!.data.message).toBe('LLM returned invalid YAML');
  });

  it('yields yop events for each extracted yop', async () => {
    const events = await collectEvents({ ...baseParams, forceExtract: true });

    const yopEvents = events.filter((e) => e.type === 'yop');
    expect(yopEvents).toHaveLength(1);
    expect(yopEvents[0].data).toMatchObject({
      op: 'upsert',
      path: '/coffee',
      index: 0,
      total: 1,
    });
  });

  it('yields done event with all final data', async () => {
    const events = await collectEvents({ ...baseParams, forceExtract: true });

    const doneEvent = events.find((e) => e.type === 'done');
    expect(doneEvent).toBeDefined();
    expect(doneEvent!.data.status).toBe('completed');
    expect(doneEvent!.data.yops_log_id).toBe('yops_log_1');
    expect(doneEvent!.data.snapshot).toBeDefined();
    expect(doneEvent!.data.delta).toBeDefined();
  });

  it('yields reorganized event with snapshot', async () => {
    const events = await collectEvents({ ...baseParams, forceExtract: true });

    const reorgEvent = events.find((e) => e.type === 'reorganized');
    expect(reorgEvent).toBeDefined();
    expect(reorgEvent!.data.snapshot).toBeDefined();
  });

  it('yields gate event after validation', async () => {
    const events = await collectEvents({ ...baseParams, forceExtract: true });

    const gateEvent = events.find((e) => e.type === 'gate');
    expect(gateEvent).toBeDefined();
    expect(gateEvent!.data.gate_result).toBeDefined();
  });

  it('yields error when AllProvidersFailedError is thrown', async () => {
    mockRegistryInstance.tryWithFallback.mockImplementationOnce(() => {
      const err = new Error('No providers available');
      err.name = 'AllProvidersFailedError';
      throw err;
    });

    const events = await collectEvents({ ...baseParams, forceExtract: true });

    const errorEvent = events.find((e) => e.type === 'error');
    expect(errorEvent).toBeDefined();
    expect(errorEvent!.data.code).toBe('LLM_NOT_CONFIGURED');
  });

  it('yields advisory event when ambiguity is detected', async () => {
    const { detectAmbiguity } = await import('@t3x-dev/core');
    vi.mocked(detectAmbiguity).mockResolvedValueOnce({
      clean: false,
      questions: [{ text: 'Did you mean light or medium roast?', type: 'clarification' }],
      // biome-ignore lint/suspicious/noExplicitAny: mock type mismatch in tests
    } as any);

    const events = await collectEvents({ ...baseParams, forceExtract: true });

    const advisoryEvent = events.find((e) => e.type === 'advisory');
    expect(advisoryEvent).toBeDefined();
    expect(advisoryEvent!.data.questions).toHaveLength(1);
  });
});

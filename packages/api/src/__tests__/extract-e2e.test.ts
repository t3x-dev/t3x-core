/**
 * Tree Extraction E2E Test
 *
 * Simulates a multi-round conversation about a Hangzhou trip,
 * mocking LLM responses for both FrameExtractor and MeaningPipeline agents.
 * Tests both first extraction (full mode) and incremental extraction (delta mode).
 *
 * Replaces the need to manually chat 5 rounds in the WebUI.
 */

import type { AnyDB } from '@t3x-dev/storage';
import { insertConversation, insertProject, insertTurn } from '@t3x-dev/storage';
import { Hono } from 'hono';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { setupTestDB, testData } from './setup';

// biome-ignore lint/suspicious/noExplicitAny: test helper
type ApiResponse = any;

let mockDB: AnyDB;

vi.mock('../lib/db', () => ({
  getDB: vi.fn(() => Promise.resolve(mockDB)),
  closeDB: vi.fn(() => Promise.resolve()),
}));

// Mock provider registry
const { mockGetProviderRegistry } = vi.hoisted(() => ({
  mockGetProviderRegistry: vi.fn(),
}));

vi.mock('../lib/provider-registry', () => ({
  getProviderRegistry: mockGetProviderRegistry,
}));

import { treeExtractRoutes } from '../routes/tree-extract.openapi';

// ============================================================
// Conversation Data — 杭州旅行 5 轮对话
// ============================================================

const CONVERSATION_TURNS = [
  // Round 1
  { role: 'user' as const, content: '我和两个朋友想去杭州玩，计划三天两夜，每人预算 3000 左右。' },
  {
    role: 'assistant' as const,
    content:
      '杭州三天两夜的行程可以安排得很丰富！西湖、灵隐寺、龙井茶园都是热门景点。你们有什么偏好吗？',
  },
  // Round 2
  {
    role: 'user' as const,
    content: '对了，小王花生过敏，这个一定要注意。还有我听说河坊街太商业化了，不想去。',
  },
  {
    role: 'assistant' as const,
    content: '好的，记下了花生过敏和避开河坊街。饮食方面我会特别注意推荐无花生的餐厅。',
  },
  // Round 3
  {
    role: 'user' as const,
    content: '西湖肯定要去，还有灵隐寺和龙井茶园。我们都喜欢摄影，也想去品茶。',
  },
  {
    role: 'assistant' as const,
    content: '这些都是杭州的经典景点，龙井茶园可以安排品茶和摄影，时间上建议放在下午。',
  },
  // Round 4
  { role: 'user' as const, content: '住宿想住民宿，最好在西湖附近，要安静有停车位的。' },
  {
    role: 'assistant' as const,
    content: '西湖附近有不少精品民宿，我推荐几个安静的区域，比如杨公堤一带。',
  },
  // Round 5
  {
    role: 'user' as const,
    content: '美食方面，一定要尝西湖醋鱼和龙井虾仁，东坡肉也要试试。注意不要有花生的菜。',
  },
  {
    role: 'assistant' as const,
    content: '好的，这几道都是杭帮菜经典，我帮你标注好避开花生类菜品。',
  },
];

// Extra turns for incremental test
const INCREMENTAL_TURNS = [
  { role: 'user' as const, content: '预算提高到每人 5000 吧，我们打算自驾去杭州。' },
  {
    role: 'assistant' as const,
    content: '自驾去杭州不错，高速大约 3-4 小时。预算提高后可以考虑更好的住宿和餐厅。',
  },
];

// ============================================================
// Mock LLM Responses
// ============================================================

const FIRST_EXTRACTION_DRAFT = JSON.stringify({
  schema: 't3x/extraction-draft',
  version: 1,
  mode: 'bootstrap',
  items: [
    {
      id: 'trip-plan',
      intent: 'add',
      confidence: 0.96,
      reasoning_type: 'direct',
      candidate: {
        key: 'trip_plan',
        values: {
          destination: '杭州',
          duration: '3天2晚',
          group_size: 3,
          budget_per_person: 3000,
          dietary_constraint: '小王花生过敏',
          avoid_places: '河坊街',
        },
      },
      evidence: [{ turn_tag: 'T1', quote: '我和两个朋友想去杭州玩，计划三天两夜，每人预算 3000 左右。', role: 'primary' }],
    },
  ],
});

const INCREMENTAL_DRAFT = JSON.stringify({
  schema: 't3x/extraction-draft',
  version: 1,
  mode: 'incremental',
  items: [
    {
      id: 'budget-update',
      intent: 'update',
      confidence: 0.92,
      reasoning_type: 'direct',
      target_ref: { path: 'trip_plan' },
      candidate: {
        values: {
          budget_per_person: 5000,
          transportation: '自驾',
        },
      },
      evidence: [{ turn_tag: 'T1', quote: '预算提高到每人 5000 吧，我们打算自驾去杭州。', role: 'primary' }],
    },
  ],
});

/**
 * Create a mock LLM provider that returns appropriate responses
 * based on prompt content.
 */
function createMockProvider(mode: 'full' | 'incremental' = 'full') {
  return {
    id: 'anthropic',
    generate: vi.fn().mockImplementation(async (prompt: string) => {
      const usage = { inputTokens: 100, outputTokens: 50 };

      // ── v2 ExtractionDraft prompt ──
      if (prompt.includes('Return a valid ExtractionDraft')) {
        if (mode === 'incremental' || prompt.includes('Current knowledge snapshot')) {
          return { text: INCREMENTAL_DRAFT, usage: { inputTokens: 800, outputTokens: 300 } };
        }
        return { text: FIRST_EXTRACTION_DRAFT, usage: { inputTokens: 600, outputTokens: 400 } };
      }

      // Fallback (unknown agent prompt)
      return { text: '{}', usage };
    }),
    resolveConflict: vi.fn().mockImplementation(async () => ({
      text: '',
      usage: { inputTokens: 0, outputTokens: 0 },
    })),
  };
}

/**
 * Setup mock provider registry for a given extraction mode.
 * The registry's tryWithFallback passes a mock provider to the callback.
 */
function setupMockRegistry(mode: 'full' | 'incremental' = 'full') {
  const provider = createMockProvider(mode);
  mockGetProviderRegistry.mockResolvedValue({
    listProviders: vi.fn(() => [
      {
        id: 'anthropic',
        defaultModel: 'claude-sonnet-4-6',
        availableModels: ['claude-sonnet-4-6'],
      },
    ]),
    getProviderIdsForRole: vi.fn(() => ['anthropic']),
    isConfigured: vi.fn(() => true),
    getById: vi.fn(() => provider),
    getEntry: vi.fn(() => ({ defaultModel: 'claude-sonnet-4-6' })),
  });
}

// ============================================================
// Tests
// ============================================================

describe('Tree Extraction E2E — Hangzhou Trip', () => {
  let cleanup: () => Promise<void>;
  let testProjectId: string;
  let testConversationId: string;
  const app = new Hono();
  app.route('/', treeExtractRoutes);

  beforeAll(async () => {
    const setup = await setupTestDB();
    mockDB = setup.db;
    cleanup = setup.cleanup;

    // Create project + conversation
    const project = await insertProject(
      mockDB,
      testData.project({ name: 'Hangzhou Trip E2E Test' })
    );
    testProjectId = project.projectId;

    const conv = await insertConversation(
      mockDB,
      testData.conversation(testProjectId, { title: '杭州旅行规划' })
    );
    testConversationId = conv.conversationId;

    // Insert 5 rounds of conversation (10 turns)
    for (const turn of CONVERSATION_TURNS) {
      await insertTurn(mockDB, {
        projectId: testProjectId,
        conversationId: testConversationId,
        role: turn.role,
        content: turn.content,
      });
    }
  });

  afterAll(async () => {
    await cleanup?.();
  });

  // ── Test 1: First Extraction (Full Mode) ──

  it('extracts frames from 5-round conversation (full mode)', async () => {
    setupMockRegistry('full');

    const res = await app.request('/v1/extract/trees', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ conversation_id: testConversationId }),
    });

    const body: ApiResponse = await res.json();
    if (res.status !== 200) {
      console.error('E2E Test 1 — Response body:', JSON.stringify(body, null, 2));
    }
    expect(res.status).toBe(200);
    expect(body.success).toBe(true);

    const { delta, snapshot, yops_log_id } = body.data;

    // Delta should have at least 1 add op (YAML tree → single tree with children)
    expect(delta.length).toBeGreaterThanOrEqual(1);

    // Snapshot should have trees from pipeline processing
    expect(snapshot.trees.length).toBeGreaterThanOrEqual(1);

    // After pipeline processing (nesting + deterministic transforms):
    // Root key comes from YAML tree extraction (trip_plan)
    const frameKeys = snapshot.trees.map((f: { key: string }) => f.key);
    expect(frameKeys).toContain('trip_plan');

    // Delta log entry should be created
    expect(yops_log_id).toBeTruthy();
    expect(typeof yops_log_id).toBe('string');
  });

  // ── Test 2: Incremental Extraction (Delta Mode) ──

  it('updates frames incrementally after new turns (delta mode)', async () => {
    // Add 2 more turns (round 6)
    for (const turn of INCREMENTAL_TURNS) {
      await insertTurn(mockDB, {
        projectId: testProjectId,
        conversationId: testConversationId,
        role: turn.role,
        content: turn.content,
      });
    }

    // The mock needs to handle incremental mode:
    // - FrameExtractor sees existing snapshot → returns delta format
    // - Pipeline runs in incremental mode (fewer agents)
    setupMockRegistry('incremental');

    const res = await app.request('/v1/extract/trees', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ conversation_id: testConversationId }),
    });

    const body: ApiResponse = await res.json();
    if (res.status !== 200) {
      console.error('E2E Test 2 — Response body:', JSON.stringify(body, null, 2));
    }
    expect(res.status).toBe(200);
    expect(body.success).toBe(true);

    const { delta, snapshot, yops_log_id } = body.data;

    // Delta should have set ops (YOps format: set path/value)
    expect(delta.length).toBeGreaterThanOrEqual(1);

    // Delta log entry should be created
    expect(yops_log_id).toBeTruthy();

    // Snapshot should still have trees
    expect(snapshot.trees.length).toBeGreaterThanOrEqual(1);
  });

  // ── Test 3: Specific Turn Hashes ──

  it('extracts from specific turn_hashes when provided', async () => {
    setupMockRegistry('full');

    // Use non-existent turn hashes → should return error
    const res = await app.request('/v1/extract/trees', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        conversation_id: testConversationId,
        turn_hashes: ['nonexistent_hash_1', 'nonexistent_hash_2'],
      }),
    });

    expect(res.status).toBe(400);
    const body: ApiResponse = await res.json();
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('INVALID_REQUEST');
  });

  // ── Test 4: Conversation Not Found ──

  it('returns 404 for non-existent conversation', async () => {
    setupMockRegistry('full');

    const res = await app.request('/v1/extract/trees', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ conversation_id: 'conv_nonexistent' }),
    });

    expect(res.status).toBe(404);
    const body: ApiResponse = await res.json();
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('CONVERSATION_NOT_FOUND');
  });

  // ── Test 5: LLM Not Configured ──

  it('returns 503 when no LLM provider is available', async () => {
    mockGetProviderRegistry.mockResolvedValue({
      listProviders: vi.fn(() => []),
      getProviderIdsForRole: vi.fn(() => []),
      isConfigured: vi.fn(() => false),
      getById: vi.fn(() => undefined),
      getEntry: vi.fn(() => undefined),
    });

    const res = await app.request('/v1/extract/trees', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ conversation_id: testConversationId }),
    });

    expect(res.status).toBe(503);
    const body: ApiResponse = await res.json();
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('LLM_NOT_CONFIGURED');
  });

  // ── Test 6: Missing Required Fields ──

  it('returns 400 for missing conversation_id', async () => {
    const res = await app.request('/v1/extract/trees', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });

    expect(res.status).toBe(400);
  });
});

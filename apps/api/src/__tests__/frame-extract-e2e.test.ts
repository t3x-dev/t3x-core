/**
 * Frame Extraction E2E Test
 *
 * Simulates a multi-round conversation about a Hangzhou trip,
 * mocking LLM responses for both FrameExtractor and MeaningPipeline agents.
 * Tests both first extraction (full mode) and incremental extraction (delta mode).
 *
 * Replaces the need to manually chat 5 rounds in the WebUI.
 */

import {
  insertConversation,
  insertProject,
  insertTurn,
} from '@t3x-dev/storage';
import type { AnyDB } from '@t3x-dev/storage';
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

import { frameExtractRoutes } from '../routes/frame-extract.openapi';

// ============================================================
// Conversation Data — 杭州旅行 5 轮对话
// ============================================================

const CONVERSATION_TURNS = [
  // Round 1
  { role: 'user' as const, content: '我和两个朋友想去杭州玩，计划三天两夜，每人预算 3000 左右。' },
  { role: 'assistant' as const, content: '杭州三天两夜的行程可以安排得很丰富！西湖、灵隐寺、龙井茶园都是热门景点。你们有什么偏好吗？' },
  // Round 2
  { role: 'user' as const, content: '对了，小王花生过敏，这个一定要注意。还有我听说河坊街太商业化了，不想去。' },
  { role: 'assistant' as const, content: '好的，记下了花生过敏和避开河坊街。饮食方面我会特别注意推荐无花生的餐厅。' },
  // Round 3
  { role: 'user' as const, content: '西湖肯定要去，还有灵隐寺和龙井茶园。我们都喜欢摄影，也想去品茶。' },
  { role: 'assistant' as const, content: '这些都是杭州的经典景点，龙井茶园可以安排品茶和摄影，时间上建议放在下午。' },
  // Round 4
  { role: 'user' as const, content: '住宿想住民宿，最好在西湖附近，要安静有停车位的。' },
  { role: 'assistant' as const, content: '西湖附近有不少精品民宿，我推荐几个安静的区域，比如杨公堤一带。' },
  // Round 5
  { role: 'user' as const, content: '美食方面，一定要尝西湖醋鱼和龙井虾仁，东坡肉也要试试。注意不要有花生的菜。' },
  { role: 'assistant' as const, content: '好的，这几道都是杭帮菜经典，我帮你标注好避开花生类菜品。' },
];

// Extra turns for incremental test
const INCREMENTAL_TURNS = [
  { role: 'user' as const, content: '预算提高到每人 5000 吧，我们打算自驾去杭州。' },
  { role: 'assistant' as const, content: '自驾去杭州不错，高速大约 3-4 小时。预算提高后可以考虑更好的住宿和餐厅。' },
];

// ============================================================
// Mock LLM Responses
// ============================================================

/** First extraction: FrameExtractor returns full frames */
const FIRST_EXTRACTION_FRAMES = JSON.stringify({
  frames: [
    {
      id: 'f_001',
      type: 'trip_plan',
      source: 'T1',
      confidence: 0.95,
      slots: {
        destination: '杭州',
        duration: '3天2晚',
        group_size: 3,
        season: '春天',
        budget_per_person: 3000,
      },
      slot_quotes: {
        destination: '想去杭州玩',
        duration: '计划三天两夜',
        budget_per_person: '每人预算 3000 左右',
      },
    },
    {
      id: 'f_002',
      type: 'constraints',
      source: 'T3',
      confidence: 0.9,
      slots: {
        dietary: [{ type: 'peanut_allergy', applies_to: '小王', severity: 'must_avoid' }],
        avoid_places: ['河坊街'],
      },
      slot_quotes: {
        dietary: '小王花生过敏',
        avoid_places: '河坊街太商业化了，不想去',
      },
    },
    {
      id: 'f_003',
      type: 'activities',
      source: 'T5',
      confidence: 0.85,
      slots: {
        must_visit: ['西湖', '灵隐寺', '龙井茶园'],
        interests: ['摄影', '品茶'],
      },
      slot_quotes: {
        must_visit: '西湖肯定要去，还有灵隐寺和龙井茶园',
        interests: '喜欢摄影，也想去品茶',
      },
    },
    {
      id: 'f_004',
      type: 'accommodation',
      source: 'T7',
      confidence: 0.85,
      slots: {
        preference: '民宿',
        area: '西湖附近',
        requirements: ['安静', '有停车位'],
      },
      slot_quotes: {
        preference: '想住民宿',
        area: '最好在西湖附近',
      },
    },
    {
      id: 'f_005',
      type: 'food_plan',
      source: 'T9',
      confidence: 0.85,
      slots: {
        must_try: ['西湖醋鱼', '龙井虾仁', '东坡肉'],
        avoid: ['含花生的菜'],
      },
      slot_quotes: {
        must_try: '一定要尝西湖醋鱼和龙井虾仁',
      },
    },
  ],
  relations: [
    { from: 'f_002', to: 'f_001', type: 'conditions', confidence: 0.9 },
    { from: 'f_003', to: 'f_001', type: 'elaborates', confidence: 0.85 },
    { from: 'f_004', to: 'f_001', type: 'elaborates', confidence: 0.85 },
    { from: 'f_005', to: 'f_001', type: 'elaborates', confidence: 0.8 },
  ],
});

/** Incremental extraction: FrameExtractor returns delta changes */
const INCREMENTAL_DELTA = JSON.stringify({
  changes: [
    {
      action: 'update',
      target: 'f_001',
      slots: {
        budget_per_person: 5000,
        transportation: '自驾',
      },
      slot_quotes: {
        budget_per_person: '预算提高到每人 5000',
        transportation: '打算自驾去杭州',
      },
    },
  ],
});

// ── Pipeline agent mock responses ──

const PIPELINE_RESPONSES = {
  // dedup_checker: no duplicates
  dedup: '{"decision": "keep_separate"}',
  // topic_namer: set topic
  topicName: 'hangzhou_spring_trip',
  // topic_evolver: keep same name
  topicEvolve: '{"verdict": "keep", "name": "hangzhou_spring_trip"}',
  // slot_polisher: return empty slots → agent keeps originals
  slotPolish: '{"slots": {}}',
  // reviewer: approved
  reviewer: '{"status": "approved", "issues": []}',
  // coverage_checker step 1: all user points
  coverageStep1: JSON.stringify({
    points: [
      { type: 'fact', text: '杭州三天两夜', quote: '计划三天两夜' },
      { type: 'fact', text: '三人出行', quote: '我和两个朋友' },
      { type: 'constraint', text: '花生过敏', quote: '小王花生过敏' },
      { type: 'constraint', text: '避开河坊街', quote: '河坊街太商业化了' },
      { type: 'preference', text: '摄影和品茶', quote: '喜欢摄影，也想去品茶' },
      { type: 'preference', text: '民宿住宿', quote: '想住民宿' },
      { type: 'fact', text: '预算3000每人', quote: '每人预算 3000 左右' },
    ],
  }),
  // coverage_checker step 2: all covered
  coverageStep2: '{"coverage_score": 1.0, "missing_points": []}',
  // contradiction_checker: no contradictions
  contradiction: '{"user_constraints": ["花生过敏", "避开河坊街"], "contradictions": []}',
};

/**
 * Create a mock LLM provider that returns appropriate responses
 * based on prompt content. Handles both FrameExtractor and pipeline agent calls.
 */
function createMockProvider(mode: 'full' | 'incremental' = 'full') {
  return {
    id: 'test-provider',
    generate: vi.fn().mockImplementation(async (prompt: string) => {
      const usage = { inputTokens: 100, outputTokens: 50 };

      // ── FrameExtractor ──
      // Prompt contains extraction priority markers from frameExtractionPrompt.ts
      if (prompt.includes('semantic extraction engine') || prompt.includes('EXTRACTION PRIORITY')) {
        if (mode === 'incremental' || prompt.includes('CURRENT SNAPSHOT')) {
          return { text: INCREMENTAL_DELTA, usage: { inputTokens: 800, outputTokens: 300 } };
        }
        return { text: FIRST_EXTRACTION_FRAMES, usage: { inputTokens: 600, outputTokens: 400 } };
      }

      // ── Pipeline Agents ──

      // dedup_checker
      if (prompt.includes('two semantic frames describe the same concept')) {
        return { text: PIPELINE_RESPONSES.dedup, usage };
      }

      // topic_namer
      if (prompt.includes('name the main topic')) {
        return { text: PIPELINE_RESPONSES.topicName, usage };
      }

      // topic_evolver
      if (prompt.includes('topic name still fits')) {
        return { text: PIPELINE_RESPONSES.topicEvolve, usage };
      }

      // slot_polisher
      if (prompt.includes('clean up YAML key names')) {
        return { text: PIPELINE_RESPONSES.slotPolish, usage };
      }

      // reviewer
      if (prompt.includes('review a structured meaning document')) {
        return { text: PIPELINE_RESPONSES.reviewer, usage };
      }

      // coverage_checker step 1 (extract points, no frames shown)
      if (prompt.includes('extract ALL important points') || prompt.includes('You extract ALL')) {
        return { text: PIPELINE_RESPONSES.coverageStep1, usage };
      }

      // coverage_checker step 2 (compare against frames)
      if (prompt.includes('compare a list of user-stated points') || prompt.includes('You compare')) {
        return { text: PIPELINE_RESPONSES.coverageStep2, usage };
      }

      // contradiction_checker
      if (prompt.includes('detect contradictions')) {
        return { text: PIPELINE_RESPONSES.contradiction, usage };
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
  mockGetProviderRegistry.mockResolvedValue({
    tryWithFallback: vi
      .fn()
      .mockImplementation(async (_role: string, fn: (provider: unknown) => Promise<unknown>) => {
        const provider = createMockProvider(mode);
        return fn(provider);
      }),
  });
}

// ============================================================
// Tests
// ============================================================

describe('Frame Extraction E2E — Hangzhou Trip', () => {
  let cleanup: () => Promise<void>;
  let testProjectId: string;
  let testConversationId: string;
  const app = new Hono();
  app.route('/', frameExtractRoutes);

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

    const res = await app.request('/v1/extract/frames', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ conversation_id: testConversationId }),
    });

    expect(res.status).toBe(200);
    const body: ApiResponse = await res.json();
    expect(body.success).toBe(true);

    const { delta, snapshot, delta_log_id } = body.data;

    // Delta should have 5 add changes (one per frame)
    expect(delta.changes).toHaveLength(5);
    expect(delta.changes.every((c: { action: string }) => c.action === 'add')).toBe(true);

    // Snapshot should have frames from pipeline processing
    expect(snapshot.frames.length).toBeGreaterThanOrEqual(1);

    // After pipeline processing (nesting + topic naming):
    // - nester merges child frames into root → fewer top-level frames
    // - topic_namer renames root to 'hangzhou_spring_trip'
    // So check for the topic-named root, not original 'trip_plan'
    const frameTypes = snapshot.frames.map((f: { type: string }) => f.type);
    expect(frameTypes).toContain('hangzhou_spring_trip');

    // Delta log entry should be created
    expect(delta_log_id).toBeTruthy();
    expect(typeof delta_log_id).toBe('string');

    // Relations should exist
    expect(delta.new_relations).toBeDefined();
    expect(delta.new_relations.length).toBeGreaterThanOrEqual(1);
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

    const res = await app.request('/v1/extract/frames', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ conversation_id: testConversationId }),
    });

    expect(res.status).toBe(200);
    const body: ApiResponse = await res.json();
    expect(body.success).toBe(true);

    const { delta, snapshot, delta_log_id } = body.data;

    // Delta should have update changes
    expect(delta.changes.length).toBeGreaterThanOrEqual(1);
    const updateChange = delta.changes.find(
      (c: { action: string }) => c.action === 'update'
    );
    expect(updateChange).toBeDefined();
    expect(updateChange.target).toBe('f_001');
    expect(updateChange.slots.budget_per_person).toBe(5000);
    expect(updateChange.slots.transportation).toBe('自驾');

    // Delta log entry should be created
    expect(delta_log_id).toBeTruthy();

    // Snapshot should still have frames
    expect(snapshot.frames.length).toBeGreaterThanOrEqual(1);
  });

  // ── Test 3: Specific Turn Hashes ──

  it('extracts from specific turn_hashes when provided', async () => {
    setupMockRegistry('full');

    // Use non-existent turn hashes → should return error
    const res = await app.request('/v1/extract/frames', {
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

    const res = await app.request('/v1/extract/frames', {
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
    const allProvidersError = new Error('No providers available');
    allProvidersError.name = 'AllProvidersFailedError';

    mockGetProviderRegistry.mockResolvedValue({
      tryWithFallback: vi.fn().mockRejectedValue(allProvidersError),
    });

    const res = await app.request('/v1/extract/frames', {
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
    const res = await app.request('/v1/extract/frames', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });

    expect(res.status).toBe(400);
  });
});

import type { AnyDB } from '@t3x-dev/storage';
import {
  createCommit,
  deleteProviderCredential,
  insertConversation,
  insertProject,
  insertYOpsLogEntry,
  upsertProviderCredential,
} from '@t3x-dev/storage';
import { Hono } from 'hono';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { setupTestDB, testData } from './setup';

let mockDB: AnyDB;
const { extractAndApply } = vi.hoisted(() => ({
  extractAndApply: vi.fn(),
}));

vi.mock('../lib/db', () => ({
  getDB: vi.fn(() => Promise.resolve(mockDB)),
  closeDB: vi.fn(() => Promise.resolve()),
}));

vi.mock('@t3x-dev/core', async () => {
  const actual = await vi.importActual<typeof import('@t3x-dev/core')>('@t3x-dev/core');
  return {
    ...actual,
    extractAndApply,
  };
});

import { resetProviderRegistry } from '../lib/provider-registry';
import { extractYopsRoutes } from '../routes/extract-yops.openapi';

const app = new Hono();
app.route('/', extractYopsRoutes);

describe('POST /v1/extract-yops (v2)', () => {
  let cleanup: () => Promise<void>;
  let testProjectId: string;
  let testConversationId: string;

  beforeAll(async () => {
    const setup = await setupTestDB();
    mockDB = setup.db;
    cleanup = setup.cleanup;

    const project = await insertProject(mockDB, testData.project({ name: 'ExtractYopsV2 Test' }));
    testProjectId = project.projectId;

    const conversation = await insertConversation(mockDB, testData.conversation(testProjectId));
    testConversationId = conversation.conversationId;
  });

  beforeEach(async () => {
    resetProviderRegistry();
    extractAndApply.mockReset();
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.OPENAI_API_KEY;
    delete process.env.GOOGLE_AI_STUDIO_KEY;

    await deleteProviderCredential(mockDB, 'anthropic');
    await deleteProviderCredential(mockDB, 'openai');
    await deleteProviderCredential(mockDB, 'google');
  });

  afterAll(async () => {
    await cleanup();
  });

  it('passes caller turn roles and bootstrap mode through to the canonical v2 pipeline', async () => {
    await upsertProviderCredential(mockDB, {
      providerId: 'openai',
      apiKey: 'sk-local-openai',
    });

    extractAndApply.mockResolvedValue({
      ok: true,
      draft: {
        schema: 't3x/extraction-draft',
        version: 1,
        mode: 'bootstrap',
        items: [],
      },
      compiled: { ops: [], warnings: [] },
      snapshot: { trees: [], relations: [] },
      turnHashByTag: { T1: 'sha256:aabbcc' },
    });

    const res = await app.request('/v1/extract-yops', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        conversation_id: testConversationId,
        turns: [{ turn_hash: 'sha256:aabbcc', role: 'assistant', content: 'hello world' }],
        provider: 'openai',
        model: 'gpt-5.4',
      }),
    });

    expect(res.status).toBe(200);
    expect(extractAndApply).toHaveBeenCalledTimes(1);
    expect(extractAndApply.mock.calls[0][0]).toMatchObject({
      mode: 'bootstrap',
      providerId: 'openai',
      model: 'gpt-5.4',
      turns: [{ turn_hash: 'sha256:aabbcc', role: 'assistant', content: 'hello world' }],
    });
  });

  it('surfaces typed v2 failures without collapsing them into opaque 500s', async () => {
    await upsertProviderCredential(mockDB, {
      providerId: 'openai',
      apiKey: 'sk-local-openai',
    });

    extractAndApply.mockResolvedValue({
      ok: false,
      failure: {
        code: 'draft_schema',
        message: 'Draft schema validation failed',
        retry: { retryable: true, strategy: 'targeted_reask', maxAttempts: 2 },
      },
    });

    const res = await app.request('/v1/extract-yops', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        conversation_id: testConversationId,
        turns: [{ turn_hash: 'sha256:aabbcc', content: 'hello world' }],
        provider: 'openai',
        model: 'gpt-5.4',
      }),
    });

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('EXTRACTION_FAILED');
    expect(body.error.details.failure_code).toBe('draft_schema');
  });

  describe('committed-baseline snapshot derivation', () => {
    /**
     * RFC 2026-04-26: the snapshot fed to extractAndApply is the
     * **committed baseline** only — uncommitted yops_log entries (the
     * active draft) deliberately never enter the LLM prompt. These
     * tests assert the boundary at the route layer.
     */
    async function freshConv(): Promise<string> {
      const conv = await insertConversation(
        mockDB,
        testData.conversation(testProjectId, { title: `Baseline ${Date.now()}` })
      );
      return conv.conversationId;
    }

    const llmOp = (path: string) => ({
      define: { path },
      source: {
        type: 'llm' as const,
        model: 'claude-sonnet-4-6',
        at: '2026-04-26T00:00:00.000Z',
        turn_ref: { turn_hash: 'sha256:aabbcc', quote: 'q' },
      },
    });

    it("calls extractAndApply with mode='bootstrap' when only an uncommitted draft exists", async () => {
      const convId = await freshConv();
      // Plant an uncommitted LLM suggestion entry — this is the
      // "active draft" that the route must NOT include in the snapshot.
      await insertYOpsLogEntry(mockDB, {
        conversationId: convId,
        projectId: testProjectId,
        source: 'pipeline',
        yops: [llmOp('foo')],
      });

      await upsertProviderCredential(mockDB, {
        providerId: 'openai',
        apiKey: 'sk-local-openai',
      });
      extractAndApply.mockResolvedValue({
        ok: true,
        draft: { schema: 't3x/extraction-draft', version: 1, mode: 'bootstrap', items: [] },
        compiled: { ops: [], warnings: [] },
        snapshot: { trees: [], relations: [] },
        turnHashByTag: { T1: 'sha256:aabbcc' },
      });

      const res = await app.request('/v1/extract-yops', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          conversation_id: convId,
          turns: [{ turn_hash: 'sha256:aabbcc', role: 'user', content: 'hello' }],
          provider: 'openai',
          model: 'gpt-5.4',
        }),
      });

      expect(res.status).toBe(200);
      const callArgs = extractAndApply.mock.calls.at(-1)?.[0];
      // Bootstrap, not incremental — the draft entry must not have
      // promoted the conversation to incremental mode.
      expect(callArgs?.mode).toBe('bootstrap');
      expect(callArgs?.snapshot).toBeUndefined();
    });

    it("calls extractAndApply with mode='incremental' + committed snapshot when a commit references the entry", async () => {
      const convId = await freshConv();
      const committed = await insertYOpsLogEntry(mockDB, {
        conversationId: convId,
        projectId: testProjectId,
        source: 'pipeline',
        yops: [llmOp('committed_root')],
      });
      // Promote the entry into a real commit — this is the boundary
      // that flips it from "active draft" into "committed baseline".
      await createCommit(mockDB, {
        author: { type: 'human', name: 'test' },
        content: {
          trees: [{ key: 'committed_root', slots: {}, children: [] }],
          relations: [],
        },
        project_id: testProjectId,
        message: 'baseline commit',
        yops_log_ids: [committed.id],
      });

      await upsertProviderCredential(mockDB, {
        providerId: 'openai',
        apiKey: 'sk-local-openai',
      });
      extractAndApply.mockResolvedValue({
        ok: true,
        draft: { schema: 't3x/extraction-draft', version: 1, mode: 'incremental', items: [] },
        compiled: { ops: [], warnings: [] },
        snapshot: { trees: [], relations: [] },
        turnHashByTag: { T1: 'sha256:aabbcc' },
      });

      const res = await app.request('/v1/extract-yops', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          conversation_id: convId,
          turns: [{ turn_hash: 'sha256:aabbcc', role: 'user', content: 'hello' }],
          provider: 'openai',
          model: 'gpt-5.4',
        }),
      });

      expect(res.status).toBe(200);
      const callArgs = extractAndApply.mock.calls.at(-1)?.[0];
      expect(callArgs?.mode).toBe('incremental');
      expect(callArgs?.snapshot).toBeDefined();
      // The committed root must be in the snapshot fed to the LLM.
      expect(callArgs?.snapshot?.trees?.[0]?.key).toBe('committed_root');
    });
  });

  describe('preset → ExtractionStyleConfig mapping', () => {
    // The route is the contract boundary between the wire-level preset
    // name (string) and the core pipeline's ExtractionStyleConfig
    // (object). Web tests pin the wire field; core tests pin the
    // prompt's behaviour given a style; this suite pins the mapping
    // in between — without it, a typo in PRESETS[preset] or a rename
    // of `style` on extractAndApply could silently drop the user's
    // selection without any layer's tests catching it.

    beforeEach(async () => {
      await upsertProviderCredential(mockDB, {
        providerId: 'openai',
        apiKey: 'sk-local-openai',
      });
      extractAndApply.mockResolvedValue({
        ok: true,
        draft: {
          schema: 't3x/extraction-draft',
          version: 1,
          mode: 'bootstrap',
          items: [],
        },
        compiled: { ops: [], warnings: [] },
        snapshot: { trees: [], relations: [] },
        turnHashByTag: { T1: 'sha256:aabbcc' },
      });
    });

    it('preset:"concise" lands on extractAndApply as the concise style config', async () => {
      const res = await app.request('/v1/extract-yops', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          conversation_id: testConversationId,
          turns: [{ turn_hash: 'sha256:aabbcc', content: 'hello' }],
          provider: 'openai',
          model: 'gpt-5.4',
          preset: 'concise',
        }),
      });
      expect(res.status).toBe(200);
      const callArgs = extractAndApply.mock.calls.at(-1)?.[0];
      // Full ExtractionStyleConfig from PRESETS.concise — pin every
      // field so a renamed property in the preset definition is loud.
      // Includes max_items: 6 (added in the deterministic-cap PR);
      // a future preset edit that drops or changes the cap value
      // surfaces here, not in production.
      expect(callArgs?.style).toEqual({
        granularity: 'concise',
        quote_length: 'representative',
        update_stance: 'conservative',
        tier3: 'extract',
        max_items: 6,
      });
    });

    it('preset:"balanced" lands on extractAndApply as the balanced style config', async () => {
      const res = await app.request('/v1/extract-yops', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          conversation_id: testConversationId,
          turns: [{ turn_hash: 'sha256:aabbcc', content: 'hello' }],
          provider: 'openai',
          model: 'gpt-5.4',
          preset: 'balanced',
        }),
      });
      expect(res.status).toBe(200);
      const callArgs = extractAndApply.mock.calls.at(-1)?.[0];
      expect(callArgs?.style).toEqual({
        granularity: 'balanced',
        quote_length: 'representative',
        update_stance: 'balanced',
        tier3: 'extract',
        max_items: 20,
      });
    });

    it('preset:"detailed" lands on extractAndApply as the detailed style config (no cap)', async () => {
      const res = await app.request('/v1/extract-yops', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          conversation_id: testConversationId,
          turns: [{ turn_hash: 'sha256:aabbcc', content: 'hello' }],
          provider: 'openai',
          model: 'gpt-5.4',
          preset: 'detailed',
        }),
      });
      expect(res.status).toBe(200);
      const callArgs = extractAndApply.mock.calls.at(-1)?.[0];
      // Detailed has NO max_items — capture nuance is the whole point.
      // Pin both the field absence and the rest of the config.
      expect(callArgs?.style).toEqual({
        granularity: 'detailed',
        quote_length: 'representative',
        update_stance: 'aggressive',
        tier3: 'extract',
      });
      expect(callArgs?.style).not.toHaveProperty('max_items');
    });

    it('omitted preset leaves style undefined (preserves historical no-style call)', async () => {
      // Backward-compat: programmatic callers (MCP, scripts, anything
      // pre-#901) don't send preset. The handler must pass `undefined`
      // straight through, NOT default to PRESETS.balanced — that
      // would silently change the prompt for every legacy caller.
      const res = await app.request('/v1/extract-yops', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          conversation_id: testConversationId,
          turns: [{ turn_hash: 'sha256:aabbcc', content: 'hello' }],
          provider: 'openai',
          model: 'gpt-5.4',
        }),
      });
      expect(res.status).toBe(200);
      const callArgs = extractAndApply.mock.calls.at(-1)?.[0];
      expect(callArgs?.style).toBeUndefined();
    });

    it('rejects an invalid preset value with a 400, not a silent fallback', async () => {
      // The schema is z.enum(['concise','balanced','detailed']) — a
      // typo or a future preset name should fail validation, not
      // silently fall through to undefined and run with no style.
      const res = await app.request('/v1/extract-yops', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          conversation_id: testConversationId,
          turns: [{ turn_hash: 'sha256:aabbcc', content: 'hello' }],
          provider: 'openai',
          model: 'gpt-5.4',
          preset: 'condensed', // not a valid preset
        }),
      });
      expect(res.status).toBe(400);
      expect(extractAndApply).not.toHaveBeenCalled();
    });
  });
});

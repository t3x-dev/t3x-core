import type { AnyDB } from '@t3x-dev/storage';
import {
  deleteProviderCredential,
  insertConversation,
  insertProject,
  upsertProviderCredential,
} from '@t3x-dev/storage';
import { Hono } from 'hono';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { setupTestDB, testData } from './setup';

let mockDB: AnyDB;
const { runExtractionV2Pipeline } = vi.hoisted(() => ({
  runExtractionV2Pipeline: vi.fn(),
}));

vi.mock('../lib/db', () => ({
  getDB: vi.fn(() => Promise.resolve(mockDB)),
  closeDB: vi.fn(() => Promise.resolve()),
}));

vi.mock('@t3x-dev/core', async () => {
  const actual = await vi.importActual<typeof import('@t3x-dev/core')>('@t3x-dev/core');
  return {
    ...actual,
    runExtractionV2Pipeline,
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
    runExtractionV2Pipeline.mockReset();
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

    runExtractionV2Pipeline.mockResolvedValue({
      ok: true,
      draft: {
        schema: 't3x/extraction-draft',
        version: 1,
        mode: 'bootstrap',
        items: [],
      },
      compiled: { ops: [], warnings: [] },
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
    expect(runExtractionV2Pipeline).toHaveBeenCalledTimes(1);
    expect(runExtractionV2Pipeline.mock.calls[0][0]).toMatchObject({
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

    runExtractionV2Pipeline.mockResolvedValue({
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
});

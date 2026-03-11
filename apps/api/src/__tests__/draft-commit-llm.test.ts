/**
 * Draft Commit (LLM Mode) Tests
 *
 * Integration tests for POST /v1/drafts/:id/commit when extraction_mode='llm'.
 */

import type { SemanticPoint } from '@t3x-dev/core';
import { insertProject } from '@t3x-dev/storage';
import type { PGLiteDB } from '@t3x-dev/storage/pglite';
import { insertDraftV3, updateDraftV3 } from '@t3x-dev/storage/pglite';
import { Hono } from 'hono';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { setupTestDB, testData } from './setup';

// biome-ignore lint/suspicious/noExplicitAny: test helper
type ApiResponse = any;

let mockDB: PGLiteDB;

vi.mock('../lib/db', () => ({
  getDB: vi.fn(() => Promise.resolve(mockDB)),
  closeDB: vi.fn(() => Promise.resolve()),
}));

// Mock generation functions (needed by drafts.openapi.ts imports)
const { mockGenerateLeafOutput, mockIsGenerationConfigured } = vi.hoisted(() => ({
  mockGenerateLeafOutput: vi.fn(),
  mockIsGenerationConfigured: vi.fn(),
}));

vi.mock('@t3x-dev/core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@t3x-dev/core')>();
  return {
    ...actual,
    generateLeafOutput: mockGenerateLeafOutput,
    isGenerationConfigured: mockIsGenerationConfigured,
  };
});

// Mock embedder to avoid requiring Google AI key
vi.mock('../lib/embedder', () => ({
  getEmbedder: vi.fn(() => null),
}));

import { draftsRoutes } from '../routes/drafts.openapi';

describe('POST /v1/drafts/{id}/commit (LLM mode)', () => {
  let cleanup: () => Promise<void>;
  let testProjectId: string;
  const app = new Hono();
  app.route('/', draftsRoutes);

  const makeSP = (overrides: Partial<SemanticPoint> = {}): SemanticPoint => ({
    id: `sp_${Math.random().toString(36).slice(2, 8)}`,
    text: 'Test semantic point',
    extraction_mode: 'llm_extracted',
    inference_type: 'direct',
    status: 'auto_landed',
    zone: 'ready',
    evidence: [
      {
        conversation_id: 'conv_test',
        turn_hash: 'sha256:test',
        quoted_text: 'test quote',
        start_char: 0,
        end_char: 10,
        match_score: 1.0,
        role: 'primary',
        relevance: 'stated',
        enabled: true,
      },
    ],
    confidence: 0.95,
    position: 0,
    staged: true,
    ...overrides,
  });

  beforeAll(async () => {
    const setup = await setupTestDB();
    mockDB = setup.db;
    cleanup = setup.cleanup;

    const project = await insertProject(mockDB, testData.project({ name: 'Commit LLM Test' }));
    testProjectId = project.projectId;
  });

  afterAll(async () => {
    await cleanup?.();
  });

  async function createLLMDraft(sps: SemanticPoint[]) {
    const draft = await insertDraftV3(mockDB, {
      project_id: testProjectId,
      title: 'LLM commit draft',
    });
    await updateDraftV3(
      mockDB,
      draft.id,
      {
        semantic_points: sps,
        extraction_mode: 'llm',
      },
      draft.revision
    );
    return draft.id;
  }

  it('converts staged SPs to sentences on commit', async () => {
    const sp1 = makeSP({
      id: 'sp_commit_1',
      text: 'User prefers dark mode.',
      position: 0,
    });
    const sp2 = makeSP({
      id: 'sp_commit_2',
      text: 'Dark mode reduces eye strain.',
      position: 1,
    });
    const draftId = await createLLMDraft([sp1, sp2]);

    const res = await app.request(`/v1/drafts/${draftId}/commit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: 'Test LLM commit' }),
    });

    expect(res.status).toBe(201);
    const data: ApiResponse = await res.json();
    expect(data.success).toBe(true);
    expect(data.data.commit).toBeDefined();
    expect(data.data.commit.hash).toMatch(/^sha256:/);

    // Verify sentences were created from SPs
    const sentences = data.data.commit.content.sentences;
    expect(sentences).toHaveLength(2);
    expect(sentences[0].text).toBe('User prefers dark mode.');
    expect(sentences[1].text).toBe('Dark mode reduces eye strain.');

    // Draft should be marked as committed
    expect(data.data.draft_status).toBe('committed');
  });

  it('skips undone SPs', async () => {
    const sp1 = makeSP({
      id: 'sp_active',
      text: 'Active point.',
      zone: 'ready',
      status: 'auto_landed',
      staged: true,
      position: 0,
    });
    const sp2 = makeSP({
      id: 'sp_undone',
      text: 'Undone point.',
      zone: 'ready',
      status: 'undone',
      staged: false,
      position: 1,
    });
    const draftId = await createLLMDraft([sp1, sp2]);

    const res = await app.request(`/v1/drafts/${draftId}/commit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: 'Skip undone' }),
    });

    expect(res.status).toBe(201);
    const data: ApiResponse = await res.json();
    expect(data.success).toBe(true);

    // Only active SP should become a sentence
    const sentences = data.data.commit.content.sentences;
    expect(sentences).toHaveLength(1);
    expect(sentences[0].text).toBe('Active point.');
  });

  it('rejects commit with no staged SPs', async () => {
    const sp = makeSP({
      id: 'sp_all_undone',
      zone: 'ready',
      status: 'undone',
      staged: false,
    });
    const draftId = await createLLMDraft([sp]);

    const res = await app.request(`/v1/drafts/${draftId}/commit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: 'Should fail' }),
    });

    const data: ApiResponse = await res.json();
    expect(data.success).toBe(false);
    expect(data.error.code).toBe('INVALID_REQUEST');
  });
});

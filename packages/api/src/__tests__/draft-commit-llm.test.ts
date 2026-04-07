/**
 * Draft Commit (LLM Mode) Tests
 *
 * Integration tests for POST /v1/drafts/:id/commit when extraction_mode='llm'.
 */

// SemanticPoint removed from core in tree-primary refactor; define locally
interface SemanticPoint {
  id: string;
  text: string;
  zone: string;
  status: string;
  staged: boolean;
  evidence?: Array<{ conversation_id?: string; turn_hash?: string; start_char?: number; end_char?: number; role?: string; quoted_text?: string; match_score?: number; relevance?: string; enabled?: boolean }>;
  position?: number;
  extraction_mode?: string;
  inference_type?: string;
  routing_reason?: string;
  inherited_from?: string;
  low_coverage?: boolean;
}
import type { AnyDB } from '@t3x-dev/storage';
import { insertDraft, insertProject, updateDraft } from '@t3x-dev/storage';
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
    const draft = await insertDraft(mockDB, {
      project_id: testProjectId,
      title: 'LLM commit draft',
    });
    await updateDraft(
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

  it('converts staged SPs to nodes on commit', async () => {
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

    // Verify frames were created from SPs
    const frames = data.data.commit.content.trees;
    expect(frames).toHaveLength(2);
    expect(frames[0].slots.text).toBe('User prefers dark mode.');
    expect(frames[1].slots.text).toBe('Dark mode reduces eye strain.');

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

    // Only active SP should become a frame
    const frames = data.data.commit.content.trees;
    expect(frames).toHaveLength(1);
    expect(frames[0].slots.text).toBe('Active point.');
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

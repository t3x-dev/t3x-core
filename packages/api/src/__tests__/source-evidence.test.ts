import type { ApiKey } from '@t3x-dev/core';
import type { AnyDB } from '@t3x-dev/storage';
import {
  conversations,
  ensureMainBranch,
  insertConversation,
  insertProject,
  insertSourceTextRevision,
  insertTurn,
} from '@t3x-dev/storage';
import { eq } from 'drizzle-orm';
import { Hono } from 'hono';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  commitRepositoryYOpsState,
  createRepositoryYOpsStateFromSemanticContent,
  getRepositoryConversationEvidence,
} from '../lib/repository-state-transition';
import { setupTestDB } from './setup';

let mockDB: AnyDB;
vi.mock('../lib/db', () => ({
  getDB: vi.fn(() => Promise.resolve(mockDB)),
  closeDB: vi.fn(() => Promise.resolve()),
}));

import { sourceEvidenceRoutes } from '../routes/source-evidence.openapi';

interface SourceEvidenceTestBody {
  data: {
    availability: { mode: string; reasons: string[] };
    source: unknown | null;
    turns: { total: number; completeness: string };
    revisions: unknown[];
    evidence_selection: { mode: string; turn_hashes: string[] };
    referring_commits: Array<{ commit_digest: string; evidence_refs: unknown[] }>;
  };
}

function humanKey(userId: string): ApiKey {
  return {
    id: `ak_${userId}`,
    key_prefix: 't3xk_test',
    key_hash: 'test-hash',
    name: 'Source reader',
    project_id: null,
    user_id: userId,
    principal_kind: 'human',
    transition_scopes: [],
    created_at: '2026-08-01T00:00:00.000Z',
    last_used_at: null,
    revoked_at: null,
  };
}

function app(apiKey?: ApiKey) {
  const instance = new Hono();
  if (apiKey !== undefined) {
    instance.use('*', async (context, next) => {
      context.set('apiKey', apiKey);
      await next();
    });
  }
  instance.route('/', sourceEvidenceRoutes);
  return instance;
}

async function commitConversation(projectId: string, conversationId: string, intent: string) {
  await ensureMainBranch(mockDB, projectId);
  const evidence = await getRepositoryConversationEvidence(mockDB, projectId, conversationId);
  return commitRepositoryYOpsState({
    db: mockDB,
    projectId,
    refName: 'main',
    expectedHead: null,
    target: createRepositoryYOpsStateFromSemanticContent({ trees: [], relations: [] }),
    actor: { kind: 'human', id: 'human:test-maintainer' },
    intent,
    evidence,
  });
}

describe('source evidence routes', () => {
  let cleanup: () => Promise<void>;

  beforeAll(async () => {
    const setup = await setupTestDB();
    mockDB = setup.db;
    cleanup = setup.cleanup;
  });

  afterAll(async () => cleanup());

  it('returns CommitV2 evidence and marks a paginated turn view partial', async () => {
    const project = await insertProject(mockDB, { name: 'Source API' });
    const conversation = await insertConversation(mockDB, {
      projectId: project.projectId,
      title: 'Agent release policy',
    });
    const turn = await insertTurn(mockDB, {
      projectId: project.projectId,
      conversationId: conversation.conversationId,
      role: 'user',
      content: 'Move rollout to twenty percent.',
    });
    await insertTurn(mockDB, {
      projectId: project.projectId,
      conversationId: conversation.conversationId,
      role: 'assistant',
      content: 'Prepared for review.',
    });
    await insertSourceTextRevision(mockDB, {
      projectId: project.projectId,
      conversationId: conversation.conversationId,
      turnHash: turn.turnHash,
      turnRole: 'user',
      action: 'edit',
      startChar: 16,
      endChar: 22,
      selectedText: 'twenty',
      replacementText: '20',
      baseContent: turn.content,
      content: 'Move rollout to 20 percent.',
      spans: [],
    });
    const commit = await commitConversation(
      project.projectId,
      conversation.conversationId,
      'Raise rollout'
    );

    const response = await app().request(
      `/v1/projects/${project.projectId}/sources/conversations/${conversation.conversationId}?limit=1`
    );
    const body = (await response.json()) as SourceEvidenceTestBody;

    expect(response.status).toBe(200);
    expect(body.data.availability).toEqual({
      mode: 'partial',
      reasons: ['TURN_PAGE_INCOMPLETE'],
    });
    expect(body.data.turns).toMatchObject({ total: 2, completeness: 'partial' });
    expect(body.data.revisions).toHaveLength(1);
    expect(body.data.evidence_selection).toEqual({
      mode: 'immutable_refs',
      turn_hashes: expect.arrayContaining([turn.turnHash]),
    });
    expect(body.data.referring_commits).toEqual([
      expect.objectContaining({
        commit_digest: commit.commitDigest,
        evidence_refs: expect.arrayContaining([expect.any(Object)]),
      }),
    ]);
  });

  it('does not claim a missing source referenced by immutable evidence is available', async () => {
    const project = await insertProject(mockDB, { name: 'Missing Source API' });
    const conversation = await insertConversation(mockDB, {
      projectId: project.projectId,
      title: 'Ephemeral source',
    });
    await insertTurn(mockDB, {
      projectId: project.projectId,
      conversationId: conversation.conversationId,
      role: 'user',
      content: 'This source will be removed after its evidence is committed.',
    });
    await commitConversation(project.projectId, conversation.conversationId, 'Record source');
    // Bypass the public deletion guard to simulate externally missing source
    // rows while retaining immutable CommitV2 evidence references.
    await mockDB
      .delete(conversations)
      .where(eq(conversations.conversationId, conversation.conversationId));

    const response = await app().request(
      `/v1/projects/${project.projectId}/sources/conversations/${conversation.conversationId}`
    );
    const body = (await response.json()) as SourceEvidenceTestBody;

    expect(response.status).toBe(200);
    expect(body.data.source).toBeNull();
    expect(body.data.availability).toEqual({
      mode: 'unavailable',
      reasons: ['SOURCE_RECORD_MISSING'],
    });
  });

  it('reports a complete current source without fabricating a commit reference', async () => {
    const project = await insertProject(mockDB, { name: 'Current Source API' });
    const conversation = await insertConversation(mockDB, {
      projectId: project.projectId,
      title: 'Current source',
    });
    await insertTurn(mockDB, {
      projectId: project.projectId,
      conversationId: conversation.conversationId,
      role: 'user',
      content: 'A current source that has not been committed.',
    });

    const response = await app().request(
      `/v1/projects/${project.projectId}/sources/conversations/${conversation.conversationId}`
    );
    const body = (await response.json()) as SourceEvidenceTestBody;

    expect(response.status).toBe(200);
    expect(body.data.availability).toEqual({ mode: 'available', reasons: [] });
    expect(body.data.turns).toMatchObject({ total: 1, completeness: 'complete' });
    expect(body.data.referring_commits).toEqual([]);
  });

  it('returns 404 for an unknown source and 403 across an ownership boundary', async () => {
    const project = await insertProject(mockDB, {
      name: 'Owned Source API',
      ownerId: 'user_owner',
    });
    const conversation = await insertConversation(mockDB, {
      projectId: project.projectId,
      title: 'Owned source',
    });

    const missing = await app(humanKey('user_owner')).request(
      `/v1/projects/${project.projectId}/sources/conversations/conv_unknown`
    );
    expect(missing.status).toBe(404);

    const forbidden = await app(humanKey('user_other')).request(
      `/v1/projects/${project.projectId}/sources/conversations/${conversation.conversationId}`
    );
    expect(forbidden.status).toBe(403);
  });
});

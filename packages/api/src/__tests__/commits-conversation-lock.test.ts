/**
 * Commit source conversation lock tests.
 */

import type { AnyDB } from '@t3x-dev/storage';
import { insertConversation, insertProject } from '@t3x-dev/storage';
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

import { commitRoutes } from '../routes/commits.openapi';
import { conversationRoutes } from '../routes/conversations.openapi';
import { turnRoutes } from '../routes/turns.openapi';

describe('Commit source conversation lock', () => {
  let cleanup: () => Promise<void>;
  let projectId: string;
  const app = new Hono();
  app.route('/', commitRoutes);
  app.route('/', conversationRoutes);
  app.route('/', turnRoutes);

  beforeAll(async () => {
    const setup = await setupTestDB();
    mockDB = setup.db;
    cleanup = setup.cleanup;

    const project = await insertProject(
      mockDB,
      testData.project({ name: 'Commit Conversation Lock Test' })
    );
    projectId = project.projectId;
  });

  afterAll(async () => {
    await cleanup();
  });

  async function postCommit(sourceConversationId: string): Promise<Response> {
    return app.request('/v1/commits', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        project_id: projectId,
        content: {
          trees: [{ key: 'trip', slots: { destination: 'Dali' }, children: [] }],
          relations: [],
        },
        branch: 'main',
        message: 'Commit conversation',
        source_conversation_id: sourceConversationId,
        sources: [{ type: 'conversation', id: sourceConversationId, title: 'Trip chat' }],
        provenance: { method: 'llm_extraction' },
      }),
    });
  }

  it('marks the source conversation committed and rejects a second commit from it', async () => {
    const conversation = await insertConversation(mockDB, {
      projectId,
      title: 'Trip chat',
    });

    const first = await postCommit(conversation.conversationId);
    const firstBody: ApiResponse = await first.json();
    expect(first.status, JSON.stringify(firstBody)).toBe(200);
    const commitHash = firstBody.data.commit.hash;
    expect(commitHash).toMatch(/^sha256:/);

    const getConversation = await app.request(`/v1/conversations/${conversation.conversationId}`);
    expect(getConversation.status).toBe(200);
    const conversationBody: ApiResponse = await getConversation.json();
    expect(conversationBody.data.committed_as).toBe(commitHash);
    expect(conversationBody.data.committed_at).toEqual(expect.any(String));

    const second = await postCommit(conversation.conversationId);
    expect(second.status).toBe(409);
    const secondBody: ApiResponse = await second.json();
    expect(secondBody.error.code).toBe('ALREADY_COMMITTED');
  });

  it('rejects new turns after the conversation has been committed', async () => {
    const conversation = await insertConversation(mockDB, {
      projectId,
      title: 'Locked chat',
    });

    const commit = await postCommit(conversation.conversationId);
    const commitBody: ApiResponse = await commit.json();
    expect(commit.status, JSON.stringify(commitBody)).toBe(200);

    const turn = await app.request('/v1/turns', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        project_id: projectId,
        conversation_id: conversation.conversationId,
        role: 'user',
        content: 'This should not be accepted after commit.',
      }),
    });

    expect(turn.status).toBe(409);
    const turnBody: ApiResponse = await turn.json();
    expect(turnBody.error.code).toBe('ALREADY_COMMITTED');
  });
});

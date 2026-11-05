/** Commit source conversation continuation tests. */

import type { AnyDB } from '@t3x-dev/storage';
import {
  ensureMainBranch,
  getTransitionRefHead,
  insertConversation,
  insertProject,
} from '@t3x-dev/storage';
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

describe('Commit source conversation continuation', () => {
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
    await ensureMainBranch(mockDB, projectId);
  });

  afterAll(async () => {
    await cleanup();
  });

  async function postCommit(sourceConversationId: string, destination = 'Dali'): Promise<Response> {
    const observed = await getTransitionRefHead(mockDB, { projectId, refName: 'main' });
    return app.request('/v1/commits', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        project_id: projectId,
        content: {
          trees: [{ key: 'trip', slots: { destination }, children: [] }],
          relations: [],
        },
        branch: 'main',
        expected_head: observed.head,
        message: 'Commit conversation',
        source_conversation_id: sourceConversationId,
      }),
    });
  }

  it('records each commit while the same conversation remains reusable', async () => {
    const conversation = await insertConversation(mockDB, {
      projectId,
      title: 'Trip chat',
    });

    const first = await postCommit(conversation.conversationId);
    const firstBody: ApiResponse = await first.json();
    expect(first.status, JSON.stringify(firstBody)).toBe(200);
    const commitHash = firstBody.data.commit.digest;
    expect(commitHash).toMatch(/^sha256:/);

    const getConversation = await app.request(`/v1/conversations/${conversation.conversationId}`);
    expect(getConversation.status).toBe(200);
    const conversationBody: ApiResponse = await getConversation.json();
    expect(conversationBody.data.committed_as).toBe(commitHash);
    expect(conversationBody.data.committed_at).toEqual(expect.any(String));

    const turn = await app.request('/v1/turns', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        project_id: projectId,
        conversation_id: conversation.conversationId,
        role: 'user',
        content: 'Change the destination to Lijiang.',
      }),
    });
    expect(turn.status).toBe(201);

    const second = await postCommit(conversation.conversationId, 'Lijiang');
    const secondBody: ApiResponse = await second.json();
    expect(second.status, JSON.stringify(secondBody)).toBe(200);
    expect(secondBody.data.commit.digest).not.toBe(commitHash);

    const refreshed = await app.request(`/v1/conversations/${conversation.conversationId}`);
    const refreshedBody: ApiResponse = await refreshed.json();
    expect(refreshedBody.data.committed_as).toBe(secondBody.data.commit.digest);
    expect(refreshedBody.data.has_pending_changes).toBe(false);
  });

  it('starts a new pending turn window after the conversation has been committed', async () => {
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
        content: 'Continue working after commit.',
      }),
    });

    expect(turn.status).toBe(201);
    const getConversation = await app.request(`/v1/conversations/${conversation.conversationId}`);
    const conversationBody: ApiResponse = await getConversation.json();
    expect(conversationBody.data.committed_as).toBe(commitBody.data.commit.digest);
    expect(conversationBody.data.has_pending_changes).toBe(true);
  });

  it('requires source conversation parent_commit_hash to match the CommitV2 ref head', async () => {
    const parent = await getTransitionRefHead(mockDB, { projectId, refName: 'main' });
    if (parent.head === null) throw new Error('Expected prior CommitV2 head');
    const child = await insertConversation(mockDB, {
      projectId,
      title: 'Child chat',
      parentCommitHash: parent.head,
    });

    const res = await postCommit(child.conversationId);
    const body: ApiResponse = await res.json();

    expect(res.status, JSON.stringify(body)).toBe(200);
    expect(body.data.commit.object.parents.map((item: { digest: string }) => item.digest)).toEqual([
      parent.head,
    ]);
  });
});

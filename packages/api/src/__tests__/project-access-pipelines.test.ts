import type { AnyDB } from '@t3x-dev/storage';
import {
  insertAgentDraft,
  insertConversation,
  insertDraft,
  insertProject,
  insertTurn,
  insertYOpsLogEntry,
} from '@t3x-dev/storage';
import { Hono } from 'hono';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { setupTestDB } from './setup';

let mockDB: AnyDB;

vi.mock('../lib/db', () => ({
  getDB: vi.fn(() => Promise.resolve(mockDB)),
  closeDB: vi.fn(() => Promise.resolve()),
}));

import { agentDraftRoutes } from '../routes/agent-drafts.openapi';
import { autopilotRoutes } from '../routes/autopilot.openapi';
import { curateRoutes } from '../routes/curate.openapi';
import { draftsSpecialRoutes } from '../routes/drafts-special.openapi';
import { draftsYopsRoutes } from '../routes/drafts-yops.openapi';
import { extractIncrementalRoutes } from '../routes/extract-incremental.openapi';
import { extractYopsRoutes } from '../routes/extract-yops.openapi';
import { turnRoutes } from '../routes/turns.openapi';
import { yopsLogRoutes } from '../routes/yops-log.openapi';

function createAuthenticatedApp(userId: string) {
  const app = new Hono();
  app.use('*', async (c, next) => {
    // biome-ignore lint/suspicious/noExplicitAny: test context fixture
    (c as any).set('apiKey', {
      id: `ak_${userId}`,
      user_id: userId,
      project_id: null,
      principal_kind: 'human',
      key_prefix: 't3xk_test',
      name: 'test',
    });
    return next();
  });
  app.route('/', turnRoutes);
  app.route('/', yopsLogRoutes);
  app.route('/', draftsSpecialRoutes);
  app.route('/', draftsYopsRoutes);
  app.route('/', autopilotRoutes);
  app.route('/', agentDraftRoutes);
  app.route('/', extractIncrementalRoutes);
  app.route('/', extractYopsRoutes);
  app.route('/', curateRoutes);
  return app;
}

describe('project ownership on mutation and pipeline routes', () => {
  let cleanup: () => Promise<void>;
  let otherProjectId: string;
  let conversationId: string;

  beforeAll(async () => {
    const setup = await setupTestDB();
    mockDB = setup.db;
    cleanup = setup.cleanup;

    otherProjectId = (
      await insertProject(mockDB, { name: 'Other pipeline project', ownerId: 'user_other' })
    ).projectId;
    conversationId = (
      await insertConversation(mockDB, {
        projectId: otherProjectId,
        title: 'Private pipeline conversation',
      })
    ).conversationId;
  });

  afterAll(async () => {
    await cleanup();
  });

  it('blocks cross-project turn list, create, read, chain, and context', async () => {
    const turn = await insertTurn(mockDB, {
      projectId: otherProjectId,
      conversationId,
      role: 'user',
      content: 'private turn',
    });
    const app = createAuthenticatedApp('user_owner');
    const hash = encodeURIComponent(turn.turnHash);

    expect((await app.request(`/v1/turns?conversation_id=${conversationId}`)).status).toBe(403);
    expect(
      (
        await app.request('/v1/turns', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            project_id: otherProjectId,
            conversation_id: conversationId,
            role: 'user',
            content: 'unauthorized',
          }),
        })
      ).status
    ).toBe(403);
    expect((await app.request(`/v1/turns/${hash}`)).status).toBe(403);
    expect((await app.request(`/v1/turns/${hash}/chain`)).status).toBe(403);
    expect((await app.request(`/v1/turns/${hash}/context`)).status).toBe(403);
  });

  it('blocks cross-project YOps log reads and deletion', async () => {
    const entry = await insertYOpsLogEntry(mockDB, {
      conversationId,
      projectId: otherProjectId,
      source: 'manual',
      yops: [],
    });
    const app = createAuthenticatedApp('user_owner');

    expect((await app.request(`/v1/conversations/${conversationId}/yops`)).status).toBe(403);
    expect((await app.request(`/v1/conversations/${conversationId}/draft`)).status).toBe(403);
    expect(
      (
        await app.request(`/v1/conversations/${conversationId}/yops/${entry.id}`, {
          method: 'DELETE',
        })
      ).status
    ).toBe(403);
  });

  it('blocks cross-project draft helpers and autopilot actions', async () => {
    const draft = await insertDraft(mockDB, {
      project_id: otherProjectId,
      title: 'Private pipeline draft',
    });
    const app = createAuthenticatedApp('user_owner');

    expect((await app.request(`/v1/drafts/${draft.id}/promote`, { method: 'POST' })).status).toBe(
      403
    );
    expect(
      (
        await app.request(`/v1/drafts/${draft.id}/review-action`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sp_id: 'private', action: 'accept' }),
        })
      ).status
    ).toBe(403);
    expect(
      (
        await app.request(`/v1/drafts/${draft.id}/apply-yops`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            yops: [{ set: { path: 'private', value: true } }],
            if_revision: draft.revision,
          }),
        })
      ).status
    ).toBe(403);
    expect((await app.request(`/v1/projects/${otherProjectId}/autopilot/config`)).status).toBe(403);
    expect(
      (
        await app.request(`/v1/projects/${otherProjectId}/autopilot/config`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ enabled: true }),
        })
      ).status
    ).toBe(403);
    expect((await app.request(`/v1/projects/${otherProjectId}/autopilot/adaptive`)).status).toBe(
      403
    );
    expect(
      (await app.request(`/v1/drafts/${draft.id}/auto-commit`, { method: 'POST' })).status
    ).toBe(403);
  });

  it('blocks cross-project agent drafts and extraction before provider work', async () => {
    const draft = await insertDraft(mockDB, {
      project_id: otherProjectId,
      title: 'Private extraction draft',
    });
    const agentDraft = await insertAgentDraft(mockDB, {
      projectId: otherProjectId,
      conversationId,
      bridgeId: 'summary',
      bridgePayload: { intent: 'private' },
      llmConfig: {},
      text: 'private generated text',
    });
    const app = createAuthenticatedApp('user_owner');

    expect((await app.request(`/v1/agent/drafts/${agentDraft.draftId}`)).status).toBe(403);
    expect(
      (
        await app.request(`/v1/agent/drafts/${agentDraft.draftId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ feedback: 'unauthorized' }),
        })
      ).status
    ).toBe(403);
    expect(
      (
        await app.request('/v1/agent/drafts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            project_id: otherProjectId,
            conversation_id: conversationId,
            bridge_id: 'summary',
            intent: 'private',
          }),
        })
      ).status
    ).toBe(403);
    expect(
      (
        await app.request('/v1/extract/incremental', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            project_id: otherProjectId,
            conversation_id: conversationId,
            draft_id: draft.id,
          }),
        })
      ).status
    ).toBe(403);
    expect(
      (
        await app.request('/v1/extract-yops', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ conversation_id: conversationId, turns: [] }),
        })
      ).status
    ).toBe(403);
    expect(
      (
        await app.request('/v1/curate/preview', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            project_id: otherProjectId,
            source_text: 'private source',
            bridge_id: 'summary',
            intent: 'private',
            cosine: 0.5,
          }),
        })
      ).status
    ).toBe(403);
  });
});

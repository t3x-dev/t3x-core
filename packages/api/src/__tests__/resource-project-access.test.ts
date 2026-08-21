import type { AnyDB } from '@t3x-dev/storage';
import {
  createLeaf,
  createLeafHistory,
  createMergeDraft,
  createPin,
  createTopic,
  createWebhook,
  insertConversation,
  insertDraft,
  insertNotification,
  insertProject,
  insertRun,
} from '@t3x-dev/storage';
import { Hono } from 'hono';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { setupTestDB } from './setup';

let mockDB: AnyDB;

vi.mock('../lib/db', () => ({
  getDB: vi.fn(() => Promise.resolve(mockDB)),
  closeDB: vi.fn(() => Promise.resolve()),
}));

import { draftsCrudRoutes } from '../routes/drafts-crud.openapi';
import { draftsWorkflowRoutes } from '../routes/drafts-workflows.openapi';
import { gateRoutes } from '../routes/gate.openapi';
import { leavesHistoryRoutes } from '../routes/leaves-history.openapi';
import { leavesMLRoutes } from '../routes/leaves-ml.openapi';
import { mergeRoutes } from '../routes/merge.openapi';
import { notificationsRoutes } from '../routes/notifications.openapi';
import { pinsRoutes } from '../routes/pins.openapi';
import { runsRoutes } from '../routes/runs.openapi';
import { topicsRoutes } from '../routes/topics.openapi';
import { webhooksRoutes } from '../routes/webhooks.openapi';

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
  app.route('/', draftsCrudRoutes);
  app.route('/', draftsWorkflowRoutes);
  app.route('/', gateRoutes);
  app.route('/', pinsRoutes);
  app.route('/', webhooksRoutes);
  app.route('/', runsRoutes);
  app.route('/', notificationsRoutes);
  app.route('/', topicsRoutes);
  app.route('/', leavesHistoryRoutes);
  app.route('/', leavesMLRoutes);
  app.route('/', mergeRoutes);
  return app;
}

describe('project ownership on child-resource routes', () => {
  let cleanup: () => Promise<void>;
  let ownerProjectId: string;
  let otherProjectId: string;

  beforeAll(async () => {
    const setup = await setupTestDB();
    mockDB = setup.db;
    cleanup = setup.cleanup;

    ownerProjectId = (await insertProject(mockDB, { name: 'Owner project', ownerId: 'user_owner' }))
      .projectId;
    otherProjectId = (await insertProject(mockDB, { name: 'Other project', ownerId: 'user_other' }))
      .projectId;
  });

  afterAll(async () => {
    await cleanup();
  });

  it('blocks cross-project draft create, list, read, update, and delete', async () => {
    const draft = await insertDraft(mockDB, {
      project_id: otherProjectId,
      title: 'Private draft',
    });
    const app = createAuthenticatedApp('user_owner');

    expect(
      (
        await app.request('/v1/drafts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ project_id: otherProjectId, title: 'Unauthorized' }),
        })
      ).status
    ).toBe(403);
    expect((await app.request(`/v1/drafts?project_id=${otherProjectId}`)).status).toBe(403);
    expect((await app.request(`/v1/drafts/${draft.id}`)).status).toBe(403);
    expect(
      (
        await app.request(`/v1/drafts/${draft.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ title: 'Unauthorized', if_revision: 1 }),
        })
      ).status
    ).toBe(403);
    expect((await app.request(`/v1/drafts/${draft.id}`, { method: 'DELETE' })).status).toBe(403);
  });

  it('blocks every cross-project draft workflow before generation, search, fork, or commit', async () => {
    const draft = await insertDraft(mockDB, {
      project_id: otherProjectId,
      title: 'Private workflow draft',
      goal: 'private retrieval intent',
    });
    const app = createAuthenticatedApp('user_owner');

    for (const action of ['preview', 'commit', 'suggest']) {
      const response = await app.request(`/v1/drafts/${draft.id}/${action}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      expect(response.status, action).toBe(403);
    }
    expect((await app.request(`/v1/drafts/${draft.id}/fork`, { method: 'POST' })).status).toBe(403);
  });

  it('blocks every cross-project merge-draft read and mutation before downstream work', async () => {
    const draft = await createMergeDraft(mockDB, {
      projectId: otherProjectId,
      sourceHash: `sha256:${'1'.repeat(64)}`,
      targetHash: `sha256:${'2'.repeat(64)}`,
      targetBranch: 'main',
      prepared: { conflicts: [] },
    });
    const app = createAuthenticatedApp('user_owner');
    const base = `/v1/merge/drafts/${draft.draftId}`;

    expect((await app.request(base)).status).toBe(403);
    expect(
      (
        await app.request(base, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ message: 'unauthorized' }),
        })
      ).status
    ).toBe(403);
    expect(
      (
        await app.request(`${base}/commit`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ message: 'unauthorized' }),
        })
      ).status
    ).toBe(403);
    expect((await app.request(base, { method: 'DELETE' })).status).toBe(403);
    expect((await app.request(`${base}/checks`)).status).toBe(403);
    expect((await app.request(`${base}/suggest/0`, { method: 'POST' })).status).toBe(403);
    expect(
      (
        await app.request(`${base}/suggest-frame/frame`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            source_frame: { type: 'test', slots: {} },
            target_frame: { type: 'test', slots: {} },
          }),
        })
      ).status
    ).toBe(403);
  });

  it('blocks cross-project pin create, list, read, update, and delete', async () => {
    const pin = await createPin(mockDB, {
      project_id: otherProjectId,
      type: 'import',
      ref_id: 'private-import',
    });
    const app = createAuthenticatedApp('user_owner');

    expect(
      (
        await app.request(`/v1/projects/${otherProjectId}/pins`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ type: 'import', ref_id: 'unauthorized-import' }),
        })
      ).status
    ).toBe(403);
    expect((await app.request(`/v1/projects/${otherProjectId}/pins`)).status).toBe(403);
    expect((await app.request(`/v1/pins/${pin.id}`)).status).toBe(403);
    expect(
      (
        await app.request(`/v1/pins/${pin.id}/assertions`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ selected_assertion_ids: ['private'] }),
        })
      ).status
    ).toBe(403);
    expect((await app.request(`/v1/pins/${pin.id}`, { method: 'DELETE' })).status).toBe(403);
  });

  it('blocks cross-project and unscoped webhook administration', async () => {
    const webhook = await createWebhook(mockDB, {
      projectId: otherProjectId,
      url: 'https://example.com/private-hook',
      events: ['commit.created'],
    });
    const app = createAuthenticatedApp('user_owner');

    expect((await app.request(`/v1/webhooks?project_id=${otherProjectId}`)).status).toBe(403);
    expect((await app.request('/v1/webhooks')).status).toBe(403);
    expect((await app.request(`/v1/webhooks/${webhook.webhook_id}`)).status).toBe(403);
    expect(
      (
        await app.request(`/v1/webhooks/${webhook.webhook_id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ active: false }),
        })
      ).status
    ).toBe(403);
    expect(
      (await app.request(`/v1/webhooks/${webhook.webhook_id}`, { method: 'DELETE' })).status
    ).toBe(403);
    expect(
      (await app.request(`/v1/webhooks/${webhook.webhook_id}/test`, { method: 'POST' })).status
    ).toBe(403);
  });

  it('allows owners to access resources in their own project', async () => {
    const draft = await insertDraft(mockDB, {
      project_id: ownerProjectId,
      title: 'Owned draft',
    });
    const app = createAuthenticatedApp('user_owner');

    expect((await app.request(`/v1/drafts/${draft.id}`)).status).toBe(200);
    expect((await app.request(`/v1/drafts?project_id=${ownerProjectId}`)).status).toBe(200);
  });

  it('blocks cross-project run reads, mutations, lists, and aggregate metadata', async () => {
    const run = await insertRun(mockDB, {
      run_id: 'run_private_access_test',
      project_id: otherProjectId,
      status: 'completed',
      metadata_json: JSON.stringify({ model: 'private-model', prompt_version: 'private-v1' }),
    });
    const app = createAuthenticatedApp('user_owner');

    expect((await app.request(`/v1/runs/${run.runId}`)).status).toBe(403);
    expect(
      (
        await app.request(`/v1/runs/${run.runId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ title: 'Unauthorized' }),
        })
      ).status
    ).toBe(403);
    expect((await app.request(`/v1/runs/${run.runId}`, { method: 'DELETE' })).status).toBe(403);
    expect((await app.request(`/v1/runs?project_id=${otherProjectId}`)).status).toBe(403);
    expect((await app.request(`/v1/runs/filters?project_id=${otherProjectId}`)).status).toBe(403);
    expect((await app.request(`/v1/runs/configurations?project_id=${otherProjectId}`)).status).toBe(
      403
    );
  });

  it('blocks cross-project notification reads and mutations', async () => {
    const notification = await insertNotification(mockDB, {
      type: 'info',
      title: 'Private notification',
      message: 'private',
      project_id: otherProjectId,
    });
    const app = createAuthenticatedApp('user_owner');

    expect((await app.request(`/v1/notifications?project_id=${otherProjectId}`)).status).toBe(403);
    expect((await app.request('/v1/notifications')).status).toBe(403);
    expect(
      (await app.request(`/v1/notifications/${notification.id}/read`, { method: 'POST' })).status
    ).toBe(403);
    expect(
      (
        await app.request(`/v1/notifications/read-all?project_id=${otherProjectId}`, {
          method: 'POST',
        })
      ).status
    ).toBe(403);
  });

  it('blocks cross-project topic reads and mutations', async () => {
    const conversation = await insertConversation(mockDB, {
      projectId: otherProjectId,
      title: 'Private conversation',
    });
    const topic = await createTopic(mockDB, {
      conversationId: conversation.conversationId,
      projectId: otherProjectId,
      name: 'Private topic',
    });
    const app = createAuthenticatedApp('user_owner');

    expect(
      (await app.request(`/v1/conversations/${conversation.conversationId}/topics`)).status
    ).toBe(403);
    expect(
      (
        await app.request(`/v1/conversations/${conversation.conversationId}/topics`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: 'Unauthorized' }),
        })
      ).status
    ).toBe(403);
    expect(
      (
        await app.request(`/v1/topics/${topic.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: 'Unauthorized' }),
        })
      ).status
    ).toBe(403);
    expect((await app.request(`/v1/topics/${topic.id}`, { method: 'DELETE' })).status).toBe(403);
  });

  it('blocks gate checks from resolving a conversation in another project', async () => {
    const conversation = await insertConversation(mockDB, {
      projectId: otherProjectId,
      title: 'Private gate conversation',
    });
    const app = createAuthenticatedApp('user_owner');

    const response = await app.request('/v1/gate/check', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        content: { trees: [], relations: [] },
        gates: ['structure'],
        conversation_id: conversation.conversationId,
      }),
    });

    expect(response.status).toBe(403);
  });

  it('blocks cross-project leaf history and ML routes before provider work', async () => {
    const leaf = await createLeaf(mockDB, {
      commit_hash: 'sha256:private_leaf_access_test',
      project_id: otherProjectId,
      type: 'tweet',
      title: 'Private leaf',
    });
    const history = await createLeafHistory(mockDB, {
      leaf_id: leaf.id,
      output: 'private output',
      config: {},
      model: 'test',
      created_by: 'test',
    });
    const app = createAuthenticatedApp('user_owner');

    expect((await app.request(`/v1/leaves/${leaf.id}/history`)).status).toBe(403);
    expect((await app.request(`/v1/leaf-history/${history.id}`, { method: 'DELETE' })).status).toBe(
      403
    );
    expect(
      (
        await app.request(`/v1/leaves/${leaf.id}/suggest-constraints`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({}),
        })
      ).status
    ).toBe(403);
  });
});

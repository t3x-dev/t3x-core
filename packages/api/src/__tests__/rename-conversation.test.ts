import type { AnyDB } from '@t3x-dev/storage';
import { insertConversation, insertProject } from '@t3x-dev/storage';
import { and, eq } from 'drizzle-orm';
import { Hono } from 'hono';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { setupTestDB, testData } from './setup';

let mockDB: AnyDB;

vi.mock('../lib/db', () => ({
  getDB: vi.fn(() => Promise.resolve(mockDB)),
}));

import { events } from '@t3x-dev/storage';
import { conversationRoutes } from '../routes/conversations.openapi';

describe('PATCH /v1/conversations/:conversation_id/rename', () => {
  let cleanup: () => Promise<void>;
  let projectId: string;
  const app = new Hono();
  app.route('/', conversationRoutes);

  beforeAll(async () => {
    const setup = await setupTestDB();
    mockDB = setup.db;
    cleanup = setup.cleanup;
    const project = await insertProject(mockDB, testData.project({ name: 'Rename Test' }));
    projectId = project.projectId;
  });

  afterAll(async () => {
    await cleanup();
  });

  it('renames a conversation and returns the updated row', async () => {
    const conv = await insertConversation(mockDB, { projectId });

    const res = await app.request(`/v1/conversations/${conv.conversationId}/rename`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ alias: 'tokyo_trip' }),
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as { data?: { alias?: string } };
    expect(body.data?.alias).toBe('tokyo_trip');
  });

  it('returns 400 on invalid alias format', async () => {
    const conv = await insertConversation(mockDB, { projectId });

    const res = await app.request(`/v1/conversations/${conv.conversationId}/rename`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ alias: 'BadName!' }),
    });

    expect(res.status).toBe(400);
  });

  it('returns 409 ALIAS_TAKEN on collision in the same project', async () => {
    const a = await insertConversation(mockDB, { projectId });
    const b = await insertConversation(mockDB, { projectId });

    await app.request(`/v1/conversations/${a.conversationId}/rename`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ alias: 'taken_name' }),
    });

    const res = await app.request(`/v1/conversations/${b.conversationId}/rename`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ alias: 'taken_name' }),
    });

    expect(res.status).toBe(409);
    const body = (await res.json()) as { error?: { code?: string } };
    expect(body.error?.code).toBe('ALIAS_TAKEN');
  });

  it('returns 404 when conversation does not exist', async () => {
    const res = await app.request('/v1/conversations/conv_nonexistent/rename', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ alias: 'whatever' }),
    });

    expect(res.status).toBe(404);
  });

  it('emits conversation.renamed on success (via DB trigger)', async () => {
    const conv = await insertConversation(mockDB, { projectId });

    await app.request(`/v1/conversations/${conv.conversationId}/rename`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ alias: 'broadcast_test' }),
    });

    const rows = await mockDB
      .select()
      .from(events)
      .where(
        and(eq(events.conversationId, conv.conversationId), eq(events.type, 'conversation.renamed'))
      );

    expect(rows.length).toBeGreaterThan(0);
    const payload = rows[rows.length - 1].payload as { alias: string };
    expect(payload.alias).toBe('broadcast_test');
  });
});

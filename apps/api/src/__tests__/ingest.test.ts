/**
 * Ingest Webhook Route Tests
 *
 * Integration tests for POST /v1/projects/:projectId/ingest/webhook endpoint.
 */

import { insertConversation, insertProject } from '@t3x/storage';
import type { PGLiteDB } from '@t3x/storage/pglite';
import { Hono } from 'hono';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { setupTestDB, testData } from './setup';

type ApiResponse = any;

let mockDB: PGLiteDB;

vi.mock('../lib/db', () => ({
  getDB: vi.fn(() => Promise.resolve(mockDB)),
  closeDB: vi.fn(() => Promise.resolve()),
}));

import { ingestRoutes } from '../routes/ingest.openapi';

describe('POST /v1/projects/{projectId}/ingest/webhook', () => {
  let cleanup: () => Promise<void>;
  let testProjectId: string;
  const app = new Hono();
  app.route('/', ingestRoutes);

  beforeAll(async () => {
    const setup = await setupTestDB();
    mockDB = setup.db;
    cleanup = setup.cleanup;

    const project = await insertProject(mockDB, testData.project({ name: 'Ingest Test Project' }));
    testProjectId = project.projectId;
  });

  afterAll(async () => {
    await cleanup();
  });

  // =========================================================================
  // Happy path: new conversation
  // =========================================================================

  it('creates new conversation and inserts turns', async () => {
    const res = await app.request(`/v1/projects/${testProjectId}/ingest/webhook`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        turns: [
          { role: 'user', content: 'Hello from webhook' },
          { role: 'assistant', content: 'Hi there!' },
        ],
        title: 'Webhook conversation',
        source: 'slack',
      }),
    });

    expect(res.status).toBe(201);

    const data: ApiResponse = await res.json();
    expect(data.success).toBe(true);
    expect(data.data.conversation_id).toBeTruthy();
    expect(data.data.conversation_id).toMatch(/^conv_/);
    expect(data.data.turns_created).toBe(2);
    expect(data.data.source).toBe('slack');
  });

  // =========================================================================
  // Happy path: append to existing conversation
  // =========================================================================

  it('appends turns to an existing conversation', async () => {
    // Create a conversation first via storage layer
    const conv = await insertConversation(mockDB, {
      projectId: testProjectId,
      title: 'Existing conversation',
    });

    const res = await app.request(`/v1/projects/${testProjectId}/ingest/webhook`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        conversation_id: conv.conversationId,
        turns: [
          { role: 'user', content: 'Follow-up message' },
          { role: 'assistant', content: 'Follow-up reply' },
        ],
      }),
    });

    expect(res.status).toBe(201);

    const data: ApiResponse = await res.json();
    expect(data.success).toBe(true);
    expect(data.data.conversation_id).toBe(conv.conversationId);
    expect(data.data.turns_created).toBe(2);
    expect(data.data.source).toBeNull();
  });

  // =========================================================================
  // 404: non-existent project
  // =========================================================================

  it('returns 404 for non-existent project', async () => {
    const res = await app.request('/v1/projects/proj_nonexistent/ingest/webhook', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        turns: [{ role: 'user', content: 'Hello' }],
      }),
    });

    expect(res.status).toBe(404);

    const data: ApiResponse = await res.json();
    expect(data.success).toBe(false);
    expect(data.error.code).toBe('PROJECT_NOT_FOUND');
  });

  // =========================================================================
  // 404: non-existent conversation_id
  // =========================================================================

  it('returns 404 for non-existent conversation_id', async () => {
    const res = await app.request(`/v1/projects/${testProjectId}/ingest/webhook`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        conversation_id: 'conv_nonexistent',
        turns: [{ role: 'user', content: 'Hello' }],
      }),
    });

    expect(res.status).toBe(404);

    const data: ApiResponse = await res.json();
    expect(data.success).toBe(false);
    expect(data.error.code).toBe('CONVERSATION_NOT_FOUND');
  });

  // =========================================================================
  // Source field propagation
  // =========================================================================

  it('respects source field in response', async () => {
    const res = await app.request(`/v1/projects/${testProjectId}/ingest/webhook`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        turns: [{ role: 'user', content: 'From discord' }],
        source: 'discord',
      }),
    });

    expect(res.status).toBe(201);

    const data: ApiResponse = await res.json();
    expect(data.success).toBe(true);
    expect(data.data.source).toBe('discord');
  });

  it('returns null source when not provided', async () => {
    const res = await app.request(`/v1/projects/${testProjectId}/ingest/webhook`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        turns: [{ role: 'user', content: 'No source' }],
      }),
    });

    expect(res.status).toBe(201);

    const data: ApiResponse = await res.json();
    expect(data.success).toBe(true);
    expect(data.data.source).toBeNull();
  });

  // =========================================================================
  // Validation: empty turns array
  // =========================================================================

  it('returns 400 for empty turns array', async () => {
    const res = await app.request(`/v1/projects/${testProjectId}/ingest/webhook`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        turns: [],
      }),
    });

    expect(res.status).toBe(400);

    const data: ApiResponse = await res.json();
    expect(data.success).toBe(false);
  });

  // =========================================================================
  // Multiple turns ingested in order
  // =========================================================================

  it('ingests multiple turns and reports correct count', async () => {
    const res = await app.request(`/v1/projects/${testProjectId}/ingest/webhook`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        turns: [
          { role: 'user', content: 'First message' },
          { role: 'assistant', content: 'First reply' },
          { role: 'user', content: 'Second message' },
        ],
        title: 'Multi-turn conversation',
      }),
    });

    expect(res.status).toBe(201);

    const data: ApiResponse = await res.json();
    expect(data.success).toBe(true);
    expect(data.data.turns_created).toBe(3);
    expect(data.data.conversation_id).toMatch(/^conv_/);
  });

  // =========================================================================
  // Validation: missing content in a turn
  // =========================================================================

  it('returns 400 for turn with empty content', async () => {
    const res = await app.request(`/v1/projects/${testProjectId}/ingest/webhook`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        turns: [{ role: 'user', content: '' }],
      }),
    });

    expect(res.status).toBe(400);

    const data: ApiResponse = await res.json();
    expect(data.success).toBe(false);
  });

  // =========================================================================
  // Validation: invalid role
  // =========================================================================

  it('returns 400 for turn with invalid role', async () => {
    const res = await app.request(`/v1/projects/${testProjectId}/ingest/webhook`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        turns: [{ role: 'invalid_role', content: 'Hello' }],
      }),
    });

    expect(res.status).toBe(400);

    const data: ApiResponse = await res.json();
    expect(data.success).toBe(false);
  });

  // =========================================================================
  // All valid roles accepted
  // =========================================================================

  it('accepts all valid turn roles', async () => {
    const res = await app.request(`/v1/projects/${testProjectId}/ingest/webhook`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        turns: [
          { role: 'user', content: 'User message' },
          { role: 'assistant', content: 'Assistant message' },
          { role: 'system', content: 'System message' },
          { role: 'tool', content: 'Tool message' },
        ],
        title: 'All roles test',
      }),
    });

    expect(res.status).toBe(201);

    const data: ApiResponse = await res.json();
    expect(data.success).toBe(true);
    expect(data.data.turns_created).toBe(4);
  });

  // =========================================================================
  // Default title generation
  // =========================================================================

  it('generates default title with source when title not provided', async () => {
    const res = await app.request(`/v1/projects/${testProjectId}/ingest/webhook`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        turns: [{ role: 'user', content: 'Hello' }],
        source: 'slack',
      }),
    });

    expect(res.status).toBe(201);

    const data: ApiResponse = await res.json();
    expect(data.success).toBe(true);
    // The conversation was created - we just verify it succeeded
    expect(data.data.conversation_id).toMatch(/^conv_/);
  });

  // =========================================================================
  // Single turn ingestion
  // =========================================================================

  it('ingests a single turn successfully', async () => {
    const res = await app.request(`/v1/projects/${testProjectId}/ingest/webhook`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        turns: [{ role: 'user', content: 'Just one message' }],
      }),
    });

    expect(res.status).toBe(201);

    const data: ApiResponse = await res.json();
    expect(data.success).toBe(true);
    expect(data.data.turns_created).toBe(1);
  });

  // =========================================================================
  // Cross-project conversation validation
  // =========================================================================

  it('returns 400 when conversation belongs to a different project', async () => {
    // Create a second project
    const otherProject = await insertProject(mockDB, testData.project({ name: 'Other Project' }));

    // Create conversation in the OTHER project
    const conv = await insertConversation(mockDB, {
      projectId: otherProject.projectId,
      title: 'Other project conversation',
    });

    // Try to ingest into the FIRST project using the other project's conversation
    const res = await app.request(`/v1/projects/${testProjectId}/ingest/webhook`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        conversation_id: conv.conversationId,
        turns: [{ role: 'user', content: 'Cross-project attempt' }],
      }),
    });

    expect(res.status).toBe(400);

    const data: ApiResponse = await res.json();
    expect(data.success).toBe(false);
    expect(data.error.code).toBe('INVALID_REQUEST');
  });
});

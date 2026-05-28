/**
 * Materials Routes Tests
 *
 * Document uploads create raw source materials, not conversations.
 */

import type { AnyDB } from '@t3x-dev/storage';
import { findConversationsByProject, insertProject } from '@t3x-dev/storage';
import { Hono } from 'hono';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { setupTestDB, testData } from './setup';

// biome-ignore lint/suspicious/noExplicitAny: test response helper
type ApiResponse = any;

let mockDB: AnyDB;

vi.mock('../lib/db', () => ({
  getDB: vi.fn(() => Promise.resolve(mockDB)),
  closeDB: vi.fn(() => Promise.resolve()),
}));

import { materialsRoutes } from '../routes/materials.openapi';

describe('Materials Routes', () => {
  let cleanup: () => Promise<void>;
  let testProjectId: string;
  const app = new Hono();
  app.route('/', materialsRoutes);

  beforeAll(async () => {
    const setup = await setupTestDB();
    mockDB = setup.db;
    cleanup = setup.cleanup;

    const project = await insertProject(
      mockDB,
      testData.project({ name: 'Material Routes Project' })
    );
    testProjectId = project.projectId;
  });

  afterAll(async () => {
    await cleanup();
  });

  it('uploads a document as a project material without creating a conversation', async () => {
    const beforeConversations = await findConversationsByProject(mockDB, {
      projectId: testProjectId,
    });
    const form = new FormData();
    form.append(
      'file',
      new File(['Alpha source material for a launch plan.'], 'launch-notes.txt', {
        type: 'text/plain',
      })
    );

    const uploadRes = await app.request(`/v1/projects/${testProjectId}/materials/document`, {
      method: 'POST',
      body: form,
    });
    expect(uploadRes.status).toBe(200);

    const uploaded: ApiResponse = await uploadRes.json();
    expect(uploaded.success).toBe(true);
    expect(uploaded.data).toEqual(
      expect.objectContaining({
        id: expect.stringMatching(/^mat_/),
        project_id: testProjectId,
        source_type: 'document',
        title: 'launch-notes.txt',
        filename: 'launch-notes.txt',
        mime_type: 'text/plain',
        content_excerpt: 'Alpha source material for a launch plan.',
      })
    );
    expect(uploaded.data.content_hash).toMatch(/^[a-f0-9]{64}$/);
    expect(uploaded.data.token_estimate).toBeGreaterThan(0);

    const afterConversations = await findConversationsByProject(mockDB, {
      projectId: testProjectId,
    });
    expect(afterConversations).toHaveLength(beforeConversations.length);

    const listRes = await app.request(`/v1/projects/${testProjectId}/materials`);
    expect(listRes.status).toBe(200);

    const listed: ApiResponse = await listRes.json();
    expect(listed.success).toBe(true);
    expect(listed.data).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: uploaded.data.id,
          title: 'launch-notes.txt',
          filename: 'launch-notes.txt',
          content_excerpt: 'Alpha source material for a launch plan.',
        }),
      ])
    );

    const detailRes = await app.request(
      `/v1/projects/${testProjectId}/materials/${uploaded.data.id}`
    );
    expect(detailRes.status).toBe(200);

    const detail: ApiResponse = await detailRes.json();
    expect(detail.success).toBe(true);
    expect(detail.data).toEqual(
      expect.objectContaining({
        id: uploaded.data.id,
        content_text: 'Alpha source material for a launch plan.',
        segment_count: 1,
        page_count: null,
        parse_quality: expect.objectContaining({
          status: 'ready',
        }),
      })
    );
    expect(detail.data.segments[0]).toEqual(
      expect.objectContaining({
        id: `${uploaded.data.id}:seg_001`,
        label: 'Section 1',
        text: 'Alpha source material for a launch plan.',
      })
    );
  });

  it('rejects document material files larger than 5MB', async () => {
    const form = new FormData();
    form.append(
      'file',
      new File([new Uint8Array(5 * 1024 * 1024 + 1)], 'too-large.txt', {
        type: 'text/plain',
      })
    );

    const uploadRes = await app.request(`/v1/projects/${testProjectId}/materials/document`, {
      method: 'POST',
      body: form,
    });

    expect(uploadRes.status).toBe(400);
    const uploaded: ApiResponse = await uploadRes.json();
    expect(uploaded.success).toBe(false);
    expect(uploaded.error).toEqual(
      expect.objectContaining({
        code: 'FILE_TOO_LARGE',
        message: 'File too large (max: 5MB)',
      })
    );
  });

  it('rejects document materials when no readable text is parsed', async () => {
    const form = new FormData();
    form.append('file', new File(['   \n\t  '], 'blank.txt', { type: 'text/plain' }));

    const uploadRes = await app.request(`/v1/projects/${testProjectId}/materials/document`, {
      method: 'POST',
      body: form,
    });

    expect(uploadRes.status).toBe(400);
    const uploaded: ApiResponse = await uploadRes.json();
    expect(uploaded.success).toBe(false);
    expect(uploaded.error).toEqual(
      expect.objectContaining({
        code: 'MATERIAL_UPLOAD_FAILED',
        message: 'No readable text was extracted from this file.',
      })
    );
  });

  it('rejects document materials when parsed text exceeds 20,000 characters', async () => {
    const form = new FormData();
    form.append('file', new File(['A'.repeat(20_001)], 'long.txt', { type: 'text/plain' }));

    const uploadRes = await app.request(`/v1/projects/${testProjectId}/materials/document`, {
      method: 'POST',
      body: form,
    });

    expect(uploadRes.status).toBe(400);
    const uploaded: ApiResponse = await uploadRes.json();
    expect(uploaded.success).toBe(false);
    expect(uploaded.error).toEqual(
      expect.objectContaining({
        code: 'MATERIAL_UPLOAD_FAILED',
        message:
          'Parsed text is too long for chat context. This file produced more than 20,000 characters.',
      })
    );
  });

  it('does not return materials outside the requested project scope', async () => {
    const form = new FormData();
    form.append(
      'file',
      new File(['Scoped material.'], 'scoped.txt', {
        type: 'text/plain',
      })
    );

    const uploadRes = await app.request(`/v1/projects/${testProjectId}/materials/document`, {
      method: 'POST',
      body: form,
    });
    expect(uploadRes.status).toBe(200);

    const uploaded: ApiResponse = await uploadRes.json();
    const detailRes = await app.request(`/v1/projects/proj_other/materials/${uploaded.data.id}`);

    expect(detailRes.status).toBe(404);
    const detail: ApiResponse = await detailRes.json();
    expect(detail.success).toBe(false);
    expect(detail.error.code).toBe('MATERIAL_NOT_FOUND');
  });

  it('archives a project material so it no longer appears in available material lists', async () => {
    const form = new FormData();
    form.append(
      'file',
      new File(['Archive this material.'], 'archive-me.txt', {
        type: 'text/plain',
      })
    );

    const uploadRes = await app.request(`/v1/projects/${testProjectId}/materials/document`, {
      method: 'POST',
      body: form,
    });
    expect(uploadRes.status).toBe(200);

    const uploaded: ApiResponse = await uploadRes.json();
    const archiveRes = await app.request(
      `/v1/projects/${testProjectId}/materials/${uploaded.data.id}`,
      { method: 'DELETE' }
    );
    expect(archiveRes.status).toBe(200);

    const archived: ApiResponse = await archiveRes.json();
    expect(archived.success).toBe(true);
    expect(archived.data.archived_at).toEqual(expect.any(String));

    const listRes = await app.request(`/v1/projects/${testProjectId}/materials`);
    expect(listRes.status).toBe(200);

    const listed: ApiResponse = await listRes.json();
    expect(listed.data).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ id: uploaded.data.id })])
    );

    const detailRes = await app.request(
      `/v1/projects/${testProjectId}/materials/${uploaded.data.id}`
    );
    expect(detailRes.status).toBe(200);
    const detail: ApiResponse = await detailRes.json();
    expect(detail.data.id).toBe(uploaded.data.id);

    const restoreForm = new FormData();
    restoreForm.append(
      'file',
      new File(['Archive this material.'], 'archive-me.txt', {
        type: 'text/plain',
      })
    );
    const restoreRes = await app.request(`/v1/projects/${testProjectId}/materials/document`, {
      method: 'POST',
      body: restoreForm,
    });
    expect(restoreRes.status).toBe(200);

    const restored: ApiResponse = await restoreRes.json();
    expect(restored.data.id).toBe(uploaded.data.id);
    expect(restored.data.archived_at).toBeNull();

    const restoredListRes = await app.request(`/v1/projects/${testProjectId}/materials`);
    const restoredListed: ApiResponse = await restoredListRes.json();
    expect(restoredListed.data).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: uploaded.data.id })])
    );
  });
});

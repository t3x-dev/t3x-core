/**
 * Templates Route Tests
 */

import type { PGLiteDB } from '@t3x/storage/pglite';
import { Hono } from 'hono';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { setupTestDB } from './setup';

type ApiResponse = Record<string, unknown>;

let mockDB: PGLiteDB;

vi.mock('../lib/db', () => ({
  getDB: vi.fn(() => Promise.resolve(mockDB)),
  closeDB: vi.fn(() => Promise.resolve()),
}));

import { templatesRoutes } from '../routes/templates.openapi';

describe('Templates Routes', () => {
  let cleanup: () => Promise<void>;
  const app = new Hono();
  app.route('/', templatesRoutes);

  function makeCreateBody(overrides: Record<string, unknown> = {}) {
    return {
      title: 'My Custom Template',
      description: 'A test template for tweets',
      category: 'social',
      leaf_type: 'tweet',
      system_prompt: 'You are a {{leafType}} writer. Follow constraints: {{formattedConstraints}}',
      user_prompt: 'Write based on: {{formattedSentences}}',
      variables: [
        { name: 'leafType', description: 'Type of leaf', required: true },
        {
          name: 'formattedConstraints',
          description: 'Constraints',
          required: false,
          defaultValue: '',
        },
        { name: 'formattedSentences', description: 'Sentences', required: true },
      ],
      tags: ['custom', 'tweet'],
      ...overrides,
    };
  }

  beforeAll(async () => {
    const setup = await setupTestDB();
    mockDB = setup.db;
    cleanup = setup.cleanup;
  });

  afterAll(async () => {
    await cleanup();
  });

  // ============================================================
  // GET /v1/templates — builtin templates from seed
  // ============================================================

  describe('GET /v1/templates (builtin seed)', () => {
    it('returns seeded builtin templates', async () => {
      const res = await app.request('/v1/templates');
      expect(res.status).toBe(200);
      const json: ApiResponse = await res.json();
      expect(json.success).toBe(true);
      const data = json.data as Array<Record<string, unknown>>;
      // Should have at least 6 builtin templates from seed
      expect(data.length).toBeGreaterThanOrEqual(6);
      // All should be builtin
      const builtins = data.filter((t) => t.is_builtin === true);
      expect(builtins.length).toBeGreaterThanOrEqual(6);
    });

    it('filters by category', async () => {
      const res = await app.request('/v1/templates?category=social');
      expect(res.status).toBe(200);
      const json: ApiResponse = await res.json();
      const data = json.data as Array<Record<string, unknown>>;
      // social: tweet, weibo, wechat
      expect(data.length).toBeGreaterThanOrEqual(3);
      for (const t of data) {
        expect(t.category).toBe('social');
      }
    });

    it('filters by leaf_type', async () => {
      const res = await app.request('/v1/templates?leaf_type=tweet');
      expect(res.status).toBe(200);
      const json: ApiResponse = await res.json();
      const data = json.data as Array<Record<string, unknown>>;
      expect(data.length).toBeGreaterThanOrEqual(1);
      for (const t of data) {
        expect(t.leaf_type).toBe('tweet');
      }
    });

    it('filters by search (ILIKE on title+description)', async () => {
      const res = await app.request('/v1/templates?search=Twitter');
      expect(res.status).toBe(200);
      const json: ApiResponse = await res.json();
      const data = json.data as Array<Record<string, unknown>>;
      expect(data.length).toBeGreaterThanOrEqual(1);
    });

    it('supports limit and offset', async () => {
      const res = await app.request('/v1/templates?limit=2&offset=0');
      expect(res.status).toBe(200);
      const json: ApiResponse = await res.json();
      const data = json.data as Array<Record<string, unknown>>;
      expect(data.length).toBeLessThanOrEqual(2);
    });
  });

  // ============================================================
  // POST /v1/templates
  // ============================================================

  describe('POST /v1/templates', () => {
    it('creates a custom template and returns 201', async () => {
      const res = await app.request('/v1/templates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(makeCreateBody()),
      });
      expect(res.status).toBe(201);
      const json: ApiResponse = await res.json();
      expect(json.success).toBe(true);

      const data = json.data as Record<string, unknown>;
      expect(data.template_id).toMatch(/^tmpl_/);
      expect(data.title).toBe('My Custom Template');
      expect(data.category).toBe('social');
      expect(data.leaf_type).toBe('tweet');
      expect(data.is_builtin).toBe(false);
      expect(data.tags).toEqual(['custom', 'tweet']);
      expect(data.created_at).toBeTruthy();
      expect(data.updated_at).toBeTruthy();
    });

    it('returns 400 for missing title', async () => {
      const res = await app.request('/v1/templates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(makeCreateBody({ title: '' })),
      });
      expect(res.status).toBe(400);
    });

    it('returns 400 for invalid category', async () => {
      const res = await app.request('/v1/templates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(makeCreateBody({ category: 'invalid' })),
      });
      expect(res.status).toBe(400);
    });

    it('returns 400 for invalid leaf_type', async () => {
      const res = await app.request('/v1/templates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(makeCreateBody({ leaf_type: 'invalid' })),
      });
      expect(res.status).toBe(400);
    });

    it('returns 400 for syntax error in system_prompt (unclosed block)', async () => {
      const res = await app.request('/v1/templates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(
          makeCreateBody({
            system_prompt: '{{#leafTitle}}block with no close',
            variables: [{ name: 'leafTitle', description: 'title', required: false }],
          })
        ),
      });
      expect(res.status).toBe(400);
      const json: ApiResponse = await res.json();
      expect(json.success).toBe(false);
      const error = json.error as Record<string, unknown>;
      expect(error.message).toContain('system_prompt');
    });

    it('returns 400 for undeclared variables', async () => {
      const res = await app.request('/v1/templates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(
          makeCreateBody({
            system_prompt: 'Hello {{customVar}}',
            user_prompt: 'Write {{formattedSentences}}',
            variables: [{ name: 'formattedSentences', description: 'Sentences', required: true }],
          })
        ),
      });
      expect(res.status).toBe(400);
      const json: ApiResponse = await res.json();
      expect(json.success).toBe(false);
      const error = json.error as Record<string, unknown>;
      expect(error.message).toContain('customVar');
    });
  });

  // ============================================================
  // GET /v1/templates/:id
  // ============================================================

  describe('GET /v1/templates/:id', () => {
    it('returns a template by ID', async () => {
      // Create one
      const createRes = await app.request('/v1/templates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(makeCreateBody({ title: 'Get Test Template' })),
      });
      const created = (await createRes.json()) as ApiResponse;
      const tmplId = (created.data as Record<string, unknown>).template_id as string;

      const res = await app.request(`/v1/templates/${tmplId}`);
      expect(res.status).toBe(200);
      const json: ApiResponse = await res.json();
      expect(json.success).toBe(true);
      expect((json.data as Record<string, unknown>).template_id).toBe(tmplId);
      expect((json.data as Record<string, unknown>).title).toBe('Get Test Template');
    });

    it('returns a builtin template by ID', async () => {
      const res = await app.request('/v1/templates/tmpl_builtin_tweet');
      expect(res.status).toBe(200);
      const json: ApiResponse = await res.json();
      expect(json.success).toBe(true);
      const data = json.data as Record<string, unknown>;
      expect(data.is_builtin).toBe(true);
      expect(data.leaf_type).toBe('tweet');
    });

    it('returns 404 for non-existent ID', async () => {
      const res = await app.request('/v1/templates/tmpl_nonexistent');
      expect(res.status).toBe(404);
      const json: ApiResponse = await res.json();
      expect(json.success).toBe(false);
    });
  });

  // ============================================================
  // DELETE /v1/templates/:id
  // ============================================================

  describe('DELETE /v1/templates/:id', () => {
    it('deletes a custom template', async () => {
      // Create one
      const createRes = await app.request('/v1/templates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(makeCreateBody({ title: 'Delete Test' })),
      });
      const created = (await createRes.json()) as ApiResponse;
      const tmplId = (created.data as Record<string, unknown>).template_id as string;

      const res = await app.request(`/v1/templates/${tmplId}`, { method: 'DELETE' });
      expect(res.status).toBe(200);
      const json: ApiResponse = await res.json();
      expect(json.success).toBe(true);
      expect((json.data as Record<string, unknown>).deleted).toBe(true);

      // Verify it's gone
      const getRes = await app.request(`/v1/templates/${tmplId}`);
      expect(getRes.status).toBe(404);
    });

    it('returns 403 for builtin template', async () => {
      const res = await app.request('/v1/templates/tmpl_builtin_tweet', { method: 'DELETE' });
      expect(res.status).toBe(403);
      const json: ApiResponse = await res.json();
      expect(json.success).toBe(false);
      const error = json.error as Record<string, unknown>;
      expect(error.message).toContain('builtin');
    });

    it('returns 404 for non-existent ID', async () => {
      const res = await app.request('/v1/templates/tmpl_nonexistent', { method: 'DELETE' });
      expect(res.status).toBe(404);
      const json: ApiResponse = await res.json();
      expect(json.success).toBe(false);
    });
  });

  // ============================================================
  // Seed idempotency
  // ============================================================

  describe('Seed idempotency', () => {
    it('re-seeding does not duplicate builtin templates', async () => {
      // List templates before
      const res1 = await app.request('/v1/templates?leaf_type=tweet');
      const json1: ApiResponse = await res1.json();
      const count1 = (json1.data as unknown[]).length;

      // Seed again (the PGLite adapter already seeded once during setup)
      const { seedBuiltinTemplates } = await import('@t3x/storage/seed/templates');
      await seedBuiltinTemplates(mockDB as any);

      // List templates after
      const res2 = await app.request('/v1/templates?leaf_type=tweet');
      const json2: ApiResponse = await res2.json();
      const count2 = (json2.data as unknown[]).length;

      expect(count2).toBe(count1);
    });
  });
});

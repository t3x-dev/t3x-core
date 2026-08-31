/**
 * Templates Route Tests
 */

import { type AnyDB, createTemplate } from '@t3x-dev/storage';
import { Hono } from 'hono';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { setupTestDB } from './setup';

type ApiResponse = Record<string, unknown>;

let mockDB: AnyDB;
const originalOperatorUserIds = process.env.T3X_OPERATOR_USER_IDS;
const originalOperatorKeyIds = process.env.T3X_OPERATOR_KEY_IDS;
const originalAuthDisabled = process.env.AUTH_DISABLED;

vi.mock('../lib/db', () => ({
  getDB: vi.fn(() => Promise.resolve(mockDB)),
  closeDB: vi.fn(() => Promise.resolve()),
}));

import { templatesRoutes } from '../routes/templates.openapi';

describe('Templates Routes', () => {
  let cleanup: () => Promise<void>;
  const app = new Hono();
  app.use('*', async (c, next) => {
    // biome-ignore lint/suspicious/noExplicitAny: test-only authenticated context fixture
    (c as any).set('apiKey', {
      id: 'ak_template_human',
      user_id: 'user_template_operator',
      project_id: null,
      principal_kind: 'human',
    });
    return next();
  });
  app.route('/', templatesRoutes);

  function memberApp() {
    const member = new Hono();
    member.use('*', async (c, next) => {
      // biome-ignore lint/suspicious/noExplicitAny: test-only authenticated context fixture
      (c as any).set('apiKey', {
        id: 'ak_template_member',
        user_id: 'user_template_member',
        project_id: null,
        principal_kind: 'human',
      });
      return next();
    });
    member.route('/', templatesRoutes);
    return member;
  }

  function machineApp() {
    const machine = new Hono();
    machine.use('*', async (c, next) => {
      // biome-ignore lint/suspicious/noExplicitAny: test-only authenticated context fixture
      (c as any).set('apiKey', {
        id: 'ak_template_agent',
        user_id: null,
        project_id: 'proj_bound',
        principal_kind: 'agent',
      });
      return next();
    });
    machine.route('/', templatesRoutes);
    return machine;
  }

  function makeCreateBody(overrides: Record<string, unknown> = {}) {
    return {
      title: 'My Custom Template',
      description: 'A test template for tweets',
      category: 'social',
      leaf_type: 'tweet',
      system_prompt: 'You are a {{leafType}} writer. Follow constraints: {{formattedConstraints}}',
      user_prompt: 'Write based on: {{formattedNodes}}',
      variables: [
        { name: 'leafType', description: 'Type of leaf', required: true },
        {
          name: 'formattedConstraints',
          description: 'Constraints',
          required: false,
          defaultValue: '',
        },
        { name: 'formattedNodes', description: 'Sentences', required: true },
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

  beforeEach(() => {
    process.env.AUTH_DISABLED = 'false';
    process.env.T3X_OPERATOR_USER_IDS = 'user_template_operator';
    delete process.env.T3X_OPERATOR_KEY_IDS;
  });

  afterAll(async () => {
    if (originalOperatorUserIds === undefined) delete process.env.T3X_OPERATOR_USER_IDS;
    else process.env.T3X_OPERATOR_USER_IDS = originalOperatorUserIds;
    if (originalOperatorKeyIds === undefined) delete process.env.T3X_OPERATOR_KEY_IDS;
    else process.env.T3X_OPERATOR_KEY_IDS = originalOperatorKeyIds;
    if (originalAuthDisabled === undefined) delete process.env.AUTH_DISABLED;
    else process.env.AUTH_DISABLED = originalAuthDisabled;
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
      // social: tweet, linkedin, reddit, threads
      expect(data.length).toBeGreaterThanOrEqual(4);
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

    it('hides legacy unsupported output templates', async () => {
      await createTemplate(mockDB, {
        template_id: 'tmpl_legacy_weibo',
        title: 'Legacy Weibo',
        description: 'Old unsupported output destination',
        category: 'social',
        leaf_type: 'weibo',
        system_prompt: 'Legacy system prompt',
        user_prompt: 'Legacy user prompt',
        variables: [],
        tags: ['weibo', 'legacy'],
        is_builtin: true,
      });

      const res = await app.request('/v1/templates');
      expect(res.status).toBe(200);
      const json: ApiResponse = await res.json();
      const data = json.data as Array<Record<string, unknown>>;

      expect(data.some((t) => t.leaf_type === 'weibo')).toBe(false);
      expect(data.some((t) => t.title === 'Legacy Weibo')).toBe(false);

      const directRes = await app.request('/v1/templates/tmpl_legacy_weibo');
      expect(directRes.status).toBe(404);
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
      expect(data.owner_id).toBe('user_template_operator');
      expect(data.provenance).toEqual({
        source: 'human',
        actor_kind: 'human',
        actor_id: 'user_template_operator',
      });
      expect(data.tags).toEqual(['custom', 'tweet']);
      expect(data.created_at).toBeTruthy();
      expect(data.updated_at).toBeTruthy();
    });

    it('allows machine reads but rejects machine creation of global templates', async () => {
      const machine = machineApp();
      expect((await machine.request('/v1/templates')).status).toBe(200);

      const create = await machine.request('/v1/templates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(makeCreateBody({ title: 'Machine Global Template' })),
      });
      expect(create.status).toBe(403);
    });

    it('allows member reads but rejects member creation of global templates', async () => {
      const member = memberApp();
      expect((await member.request('/v1/templates')).status).toBe(200);

      const create = await member.request('/v1/templates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(makeCreateBody({ title: 'Member Global Template' })),
      });
      expect(create.status).toBe(403);
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
            user_prompt: 'Write {{formattedNodes}}',
            variables: [{ name: 'formattedNodes', description: 'Sentences', required: true }],
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

    it('rejects machine deletion of a global custom template', async () => {
      const createRes = await app.request('/v1/templates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(makeCreateBody({ title: 'Human Managed Template' })),
      });
      const created = (await createRes.json()) as ApiResponse;
      const templateId = (created.data as Record<string, unknown>).template_id as string;

      const machine = machineApp();
      expect(
        (await machine.request(`/v1/templates/${templateId}`, { method: 'DELETE' })).status
      ).toBe(403);
      expect((await app.request(`/v1/templates/${templateId}`)).status).toBe(200);
    });

    it('rejects member deletion of a global custom template', async () => {
      const createRes = await app.request('/v1/templates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(makeCreateBody({ title: 'Operator Managed Template' })),
      });
      const created = (await createRes.json()) as ApiResponse;
      const templateId = (created.data as Record<string, unknown>).template_id as string;

      const member = memberApp();
      expect(
        (await member.request(`/v1/templates/${templateId}`, { method: 'DELETE' })).status
      ).toBe(403);
      expect((await app.request(`/v1/templates/${templateId}`)).status).toBe(200);
    });

    it('retains operator-visible create and delete audit records after deletion', async () => {
      const createRes = await app.request('/v1/templates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(makeCreateBody({ title: 'Audited Template' })),
      });
      const created = (await createRes.json()) as ApiResponse;
      const templateId = (created.data as Record<string, unknown>).template_id as string;

      expect((await app.request(`/v1/templates/${templateId}`, { method: 'DELETE' })).status).toBe(
        200
      );

      const auditRes = await app.request(`/v1/templates/${templateId}/audit`);
      expect(auditRes.status).toBe(200);
      const auditJson = (await auditRes.json()) as ApiResponse;
      const records = auditJson.data as Array<Record<string, unknown>>;
      expect(records.map((record) => record.action)).toEqual(['create', 'delete']);
      expect(records.every((record) => record.owner_id === 'user_template_operator')).toBe(true);
      expect(records[1]?.snapshot).toMatchObject({ templateId });

      expect((await memberApp().request(`/v1/templates/${templateId}/audit`)).status).toBe(403);
      expect((await machineApp().request(`/v1/templates/${templateId}/audit`)).status).toBe(403);
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

      // Seed again (the adapter already seeded once during setup)
      const { seedBuiltinTemplates } = await import('@t3x-dev/storage/seed/templates');
      // biome-ignore lint/suspicious/noExplicitAny: test helper
      await seedBuiltinTemplates(mockDB as any);

      // List templates after
      const res2 = await app.request('/v1/templates?leaf_type=tweet');
      const json2: ApiResponse = await res2.json();
      const count2 = (json2.data as unknown[]).length;

      expect(count2).toBe(count1);
    });
  });
});

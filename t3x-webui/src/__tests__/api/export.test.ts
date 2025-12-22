/**
 * Export API Route Tests
 *
 * Tests GET /api/v1/export/cfpack endpoint.
 */

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { setupTestDB, testData } from '../setup';
import type { AnyDB } from '@t3x/storage';
import { insertProject, insertConversation, insertTurn, insertBranch } from '@t3x/storage';

// Mock the database module before importing routes
let mockDB: AnyDB;

vi.mock('@/lib/db', () => ({
  getDB: vi.fn(() => Promise.resolve(mockDB)),
}));

// Import routes after mocking
import { GET } from '@/app/api/v1/export/cfpack/route';

describe('Export API Routes', () => {
  let cleanup: () => Promise<void>;
  let testProjectId: string;
  let testConversationId: string;

  beforeAll(async () => {
    const setup = await setupTestDB();
    mockDB = setup.db;
    cleanup = setup.cleanup;

    // Create test project
    const project = await insertProject(mockDB, testData.project({ name: 'Export Test Project' }));
    testProjectId = project.projectId;

    // Create conversation
    const conv = await insertConversation(mockDB, {
      projectId: testProjectId,
      title: 'Test Conversation',
    });
    testConversationId = conv.conversationId;

    // Add turns with rings
    await insertTurn(mockDB, {
      projectId: testProjectId,
      conversationId: testConversationId,
      role: 'user',
      content: 'Hello world',
      rings: {
        ring1: { keywords: ['hello', 'world'], entities: [], preference_keywords: [] },
        ring2: { facets: [] },
        ring3: { segments: [{ id: 'seg1', text: 'Hello world' }] },
      },
    });
    await insertTurn(mockDB, {
      projectId: testProjectId,
      conversationId: testConversationId,
      role: 'assistant',
      content: 'Hi there!',
      rings: {
        ring1: { keywords: ['hi', 'there'], entities: [], preference_keywords: [] },
        ring2: { facets: [] },
        ring3: { segments: [{ id: 'seg2', text: 'Hi there!' }] },
      },
    });

    // Create branch and commit
    await insertBranch(mockDB, {
      projectId: testProjectId,
      name: 'main',
    });
  });

  afterAll(async () => {
    await cleanup();
  });

  describe('GET /api/v1/export/cfpack', () => {
    it('returns 400 when project_id is missing', async () => {
      const request = new NextRequest('http://localhost/api/v1/export/cfpack');

      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error.code).toBe('INVALID_REQUEST');
    });

    it('returns 404 when project does not exist', async () => {
      const request = new NextRequest('http://localhost/api/v1/export/cfpack?project_id=proj_nonexistent');

      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(404);
      expect(data.error.code).toBe('NOT_FOUND');
    });

    it('exports project as cfpack', async () => {
      const request = new NextRequest(`http://localhost/api/v1/export/cfpack?project_id=${testProjectId}`);

      const response = await GET(request);
      await response.json(); // Consume body

      expect(response.status).toBe(200);
      expect(response.headers.get('Content-Type')).toBe('application/vnd.t3x.cfpack+json');
      expect(response.headers.get('Content-Disposition')).toContain('.cfpack');
    });

    it('includes all required cfpack fields', async () => {
      const request = new NextRequest(`http://localhost/api/v1/export/cfpack?project_id=${testProjectId}`);

      const response = await GET(request);
      const data = await response.json();

      expect(data.version).toBe('1.0.0');
      expect(data.cfpack_schema_version).toBe('1.0.0');
      expect(data.project).toBeDefined();
      expect(data.project.project_id).toBe(testProjectId);
      expect(data.project.name).toBe('Export Test Project');
      expect(data.turns).toBeDefined();
      expect(Array.isArray(data.turns)).toBe(true);
      expect(data.findings).toBeDefined();
      expect(data.commits).toBeDefined();
      expect(data.hash).toBeDefined();
      expect(data.meta).toBeDefined();
    });

    it('includes turns with rings', async () => {
      const request = new NextRequest(`http://localhost/api/v1/export/cfpack?project_id=${testProjectId}`);

      const response = await GET(request);
      const data = await response.json();

      expect(data.turns.length).toBe(2);

      const turn = data.turns[0];
      expect(turn.turn_hash).toBeDefined();
      expect(turn.role).toBeDefined();
      expect(turn.content).toBeDefined();
      expect(turn.created_at).toBeDefined();
      expect(turn.rings).toBeDefined();
    });

    it('aggregates keywords in findings', async () => {
      const request = new NextRequest(`http://localhost/api/v1/export/cfpack?project_id=${testProjectId}`);

      const response = await GET(request);
      const data = await response.json();

      expect(data.findings.aggregated_keywords).toBeDefined();
      expect(Array.isArray(data.findings.aggregated_keywords)).toBe(true);
    });

    it('includes hash with algorithm', async () => {
      const request = new NextRequest(`http://localhost/api/v1/export/cfpack?project_id=${testProjectId}`);

      const response = await GET(request);
      const data = await response.json();

      expect(data.hash.algorithm).toBe('sha256-jcs-v1');
      expect(data.hash.pack_hash).toMatch(/^sha256:[a-f0-9]+$/);
    });

    it('includes meta with export timestamp', async () => {
      const request = new NextRequest(`http://localhost/api/v1/export/cfpack?project_id=${testProjectId}`);

      const response = await GET(request);
      const data = await response.json();

      expect(data.meta.exported_at).toBeDefined();
      expect(data.meta.exported_by).toBe('t3x-webui@1.0.0');
    });
  });
});

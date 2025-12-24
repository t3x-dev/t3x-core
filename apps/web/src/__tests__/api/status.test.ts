/**
 * Status API Route Tests
 *
 * Tests GET /api/v1/status endpoint.
 */

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { setupTestDB, testData } from '../setup';
import type { AnyDB } from '@t3x/storage';
import { insertProject } from '@t3x/storage';

// Mock the database module before importing routes
let mockDB: AnyDB;

vi.mock('@/lib/db', () => ({
  getDB: vi.fn(() => Promise.resolve(mockDB)),
}));

// Import routes after mocking
import { GET } from '@/app/api/v1/status/route';

describe('Status API Route', () => {
  let cleanup: () => Promise<void>;

  beforeAll(async () => {
    const setup = await setupTestDB();
    mockDB = setup.db;
    cleanup = setup.cleanup;
  });

  afterAll(async () => {
    await cleanup();
  });

  describe('GET /api/v1/status', () => {
    it('returns API status when database is empty', async () => {
      const response = await GET();
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data.status).toBe('ok');
      expect(data.data.version).toBe('1.0.0');
      expect(data.data.database).toBe('connected');
      expect(typeof data.data.uptime).toBe('number');
      expect(data.data.uptime).toBeGreaterThanOrEqual(0);
    });

    it('returns projects_count as available when projects exist', async () => {
      // Create a project
      await insertProject(mockDB, testData.project({ name: 'Status Test Project' }));

      const response = await GET();
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.data.projects_count).toBe('available');
    });

    it('includes all expected status fields', async () => {
      const response = await GET();
      const data = await response.json();

      expect(data.data).toHaveProperty('status');
      expect(data.data).toHaveProperty('version');
      expect(data.data).toHaveProperty('uptime');
      expect(data.data).toHaveProperty('database');
      expect(data.data).toHaveProperty('projects_count');
    });
  });
});

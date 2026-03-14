/**
 * Token Usage Storage Tests
 *
 * Tests for token_usage CRUD and aggregation queries.
 *
 * @see packages/storage/src/queries/token-usage.ts
 */

import type postgres from 'postgres';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { AnyDB } from '../adapters';
import { insertProject } from '../queries/projects';
import { estimateCost, getUsageSummary, getUsageTotal, recordUsage } from '../queries/token-usage';
import { createTestDB, testData } from './setup';

describe('Token Usage Storage', () => {
  let db: AnyDB;
  let sql: postgres.Sql;
  let cleanup: () => Promise<void>;
  let testProjectId: string;

  beforeAll(async () => {
    const setup = await createTestDB();
    db = setup.db;
    sql = setup.sql;
    cleanup = setup.cleanup;

    const project = await insertProject(db, testData.project({ name: 'Token Usage Test' }));
    testProjectId = project.projectId;
  });

  afterAll(async () => {
    await cleanup();
  });

  // ============================================================
  // recordUsage
  // ============================================================

  describe('recordUsage', () => {
    it('writes a row with all fields', async () => {
      const result = await recordUsage(db, {
        user_id: 'user_test1',
        project_id: testProjectId,
        endpoint: 'chat',
        model: 'claude-sonnet-4-5',
        input_tokens: 1000,
        output_tokens: 500,
      });

      expect(result.id).toMatch(/^tu_/);
      expect(result.user_id).toBe('user_test1');
      expect(result.project_id).toBe(testProjectId);
      expect(result.endpoint).toBe('chat');
      expect(result.model).toBe('claude-sonnet-4-5');
      expect(result.input_tokens).toBe(1000);
      expect(result.output_tokens).toBe(500);
      expect(result.estimated_cost).toBeGreaterThan(0);
      expect(result.created_at).toBeDefined();
    });

    it('auto-calculates estimated_cost when not provided', async () => {
      const result = await recordUsage(db, {
        project_id: testProjectId,
        endpoint: 'leaf_generate',
        model: 'claude-sonnet-4-5',
        input_tokens: 1000,
        output_tokens: 500,
      });

      // 1000 * 3/1M + 500 * 15/1M = 0.003 + 0.0075 = 0.0105
      expect(result.estimated_cost).toBeCloseTo(0.0105, 4);
    });

    it('uses provided estimated_cost when given', async () => {
      const result = await recordUsage(db, {
        project_id: testProjectId,
        endpoint: 'gate',
        model: 'custom-model',
        input_tokens: 100,
        output_tokens: 50,
        estimated_cost: 0.123456,
      });

      expect(result.estimated_cost).toBeCloseTo(0.123456, 5);
    });

    it('allows null user_id', async () => {
      const result = await recordUsage(db, {
        project_id: testProjectId,
        endpoint: 'chat',
        model: 'claude-sonnet-4-5',
        input_tokens: 100,
        output_tokens: 50,
      });

      expect(result.user_id).toBeNull();
    });
  });

  // ============================================================
  // getUsageSummary
  // ============================================================

  describe('getUsageSummary', () => {
    it('groups records by day', async () => {
      const userId = 'user_summary_day';

      // Insert records across 3 different days
      const days = [
        new Date('2025-01-10T12:00:00Z'),
        new Date('2025-01-10T15:00:00Z'), // same day as above
        new Date('2025-01-11T10:00:00Z'),
        new Date('2025-01-12T08:00:00Z'),
      ];

      for (const day of days) {
        // Use raw SQL to set specific created_at
        await sql.unsafe(
          `INSERT INTO token_usage (id, user_id, project_id, endpoint, model, input_tokens, output_tokens, estimated_cost, created_at)
           VALUES ('tu_test_${day.getTime()}', '${userId}', '${testProjectId}', 'chat', 'claude-sonnet-4-5', 100, 50, 0.001050, '${day.toISOString()}')`
        );
      }

      const result = await getUsageSummary(db, {
        user_id: userId,
        from: new Date('2025-01-10T00:00:00Z'),
        to: new Date('2025-01-12T23:59:59Z'),
        group_by: 'day',
      });

      expect(result.length).toBe(3); // 3 distinct days
      // First day has 2 records
      expect(result[0].input_tokens).toBe(200);
      expect(result[0].output_tokens).toBe(100);
    });

    it('groups records by month', async () => {
      const userId = 'user_summary_month';

      const months = [new Date('2025-01-15T12:00:00Z'), new Date('2025-02-15T12:00:00Z')];

      for (const month of months) {
        await sql.unsafe(
          `INSERT INTO token_usage (id, user_id, project_id, endpoint, model, input_tokens, output_tokens, estimated_cost, created_at)
           VALUES ('tu_month_${month.getTime()}', '${userId}', '${testProjectId}', 'chat', 'gpt-4o', 500, 200, 0.003250, '${month.toISOString()}')`
        );
      }

      const result = await getUsageSummary(db, {
        user_id: userId,
        from: new Date('2025-01-01T00:00:00Z'),
        to: new Date('2025-02-28T23:59:59Z'),
        group_by: 'month',
      });

      expect(result.length).toBe(2);
      expect(result[0].input_tokens).toBe(500);
    });
  });

  // ============================================================
  // getUsageTotal
  // ============================================================

  describe('getUsageTotal', () => {
    it('returns SUM aggregation', async () => {
      const userId = 'user_total';

      // Insert 3 records
      for (let i = 0; i < 3; i++) {
        await sql.unsafe(
          `INSERT INTO token_usage (id, user_id, project_id, endpoint, model, input_tokens, output_tokens, estimated_cost, created_at)
           VALUES ('tu_total_${i}', '${userId}', '${testProjectId}', 'chat', 'claude-sonnet-4-5', 1000, 500, 0.010500, '${new Date('2025-03-15T12:00:00Z').toISOString()}')`
        );
      }

      const result = await getUsageTotal(db, {
        user_id: userId,
        from: new Date('2025-03-01T00:00:00Z'),
        to: new Date('2025-03-31T23:59:59Z'),
      });

      expect(result.input_tokens).toBe(3000);
      expect(result.output_tokens).toBe(1500);
      expect(result.estimated_cost).toBeCloseTo(0.0315, 4);
    });

    it('returns zeros when no records match', async () => {
      const result = await getUsageTotal(db, {
        user_id: 'user_nonexistent',
        from: new Date('2025-01-01T00:00:00Z'),
        to: new Date('2025-12-31T23:59:59Z'),
      });

      expect(result.input_tokens).toBe(0);
      expect(result.output_tokens).toBe(0);
      expect(result.estimated_cost).toBe(0);
    });
  });

  // ============================================================
  // estimateCost
  // ============================================================

  describe('estimateCost', () => {
    it('calculates for known model (claude-sonnet-4-5)', () => {
      // 1000 * 3/1M + 500 * 15/1M = 0.003 + 0.0075 = 0.0105
      const cost = estimateCost('claude-sonnet-4-5', 1000, 500);
      expect(cost).toBeCloseTo(0.0105, 6);
    });

    it('calculates for known model (gpt-4o-mini)', () => {
      // 1000 * 0.15/1M + 500 * 0.6/1M = 0.00015 + 0.0003 = 0.00045
      const cost = estimateCost('gpt-4o-mini', 1000, 500);
      expect(cost).toBeCloseTo(0.00045, 6);
    });

    it('uses fallback pricing for unknown model', () => {
      // Fallback = same as claude-sonnet-4-5: 3/1M input, 15/1M output
      const cost = estimateCost('unknown-model-xyz', 1000, 500);
      expect(cost).toBeCloseTo(0.0105, 6);
    });

    it('returns 0 for zero tokens', () => {
      const cost = estimateCost('claude-sonnet-4-5', 0, 0);
      expect(cost).toBe(0);
    });
  });
});

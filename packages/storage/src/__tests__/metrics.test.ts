import type { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { AnyDB } from '../adapters';
import {
  getMetricsByProject,
  getMetricsInTimeRange,
  getMetricsSummary,
  recordMetric,
} from '../queries/metrics';
import { insertProject } from '../queries/projects';
import { createTestDB, sleep, testData } from './setup';

describe('Metrics Events Storage', () => {
  let db: AnyDB;
  let _client: PGlite;
  let cleanup: () => Promise<void>;
  let testProjectId: string;

  beforeAll(async () => {
    const setup = await createTestDB();
    db = setup.db;
    _client = setup.client;
    cleanup = setup.cleanup;

    const project = await insertProject(db, testData.project({ name: 'Metrics Test' }));
    testProjectId = project.projectId;
  });

  afterAll(async () => {
    await cleanup();
  });

  // =========================================================================
  // recordMetric
  // =========================================================================
  describe('recordMetric', () => {
    it('creates and returns a metric event', async () => {
      const metric = await recordMetric(db, {
        project_id: testProjectId,
        event_type: 'suggestion_coverage',
        value: 0.85,
      });

      expect(metric).toBeDefined();
      expect(metric.id).toMatch(/^me_/);
      expect(metric.project_id).toBe(testProjectId);
      expect(metric.event_type).toBe('suggestion_coverage');
      expect(metric.value).toBeCloseTo(0.85, 2);
      expect(metric.metadata).toBeNull();
      expect(metric.created_at).toBeTruthy();
    });

    it('creates a metric event with metadata', async () => {
      const metric = await recordMetric(db, {
        project_id: testProjectId,
        event_type: 'confirmation',
        value: 1,
        metadata: { sentence_id: 's_abc', source: 'auto' },
      });

      expect(metric.event_type).toBe('confirmation');
      expect(metric.value).toBe(1);
      expect(metric.metadata).toEqual({ sentence_id: 's_abc', source: 'auto' });
    });
  });

  // =========================================================================
  // getMetricsByProject
  // =========================================================================
  describe('getMetricsByProject', () => {
    let metricsProjectId: string;

    beforeAll(async () => {
      const project = await insertProject(db, testData.project({ name: 'List Metrics Test' }));
      metricsProjectId = project.projectId;

      // Insert metrics with different types
      await sleep(10);
      await recordMetric(db, {
        project_id: metricsProjectId,
        event_type: 'suggestion_coverage',
        value: 0.5,
      });
      await sleep(10);
      await recordMetric(db, {
        project_id: metricsProjectId,
        event_type: 'diff_override',
        value: 1,
      });
      await sleep(10);
      await recordMetric(db, {
        project_id: metricsProjectId,
        event_type: 'suggestion_coverage',
        value: 0.9,
      });
    });

    it('returns metrics newest first', async () => {
      const metrics = await getMetricsByProject(db, metricsProjectId);
      expect(metrics).toHaveLength(3);
      // Newest first
      expect(metrics[0].value).toBeCloseTo(0.9, 1);
      expect(metrics[2].value).toBeCloseTo(0.5, 1);
    });

    it('filters by event_type', async () => {
      const metrics = await getMetricsByProject(db, metricsProjectId, {
        event_type: 'suggestion_coverage',
      });
      expect(metrics).toHaveLength(2);
      for (const m of metrics) {
        expect(m.event_type).toBe('suggestion_coverage');
      }
    });

    it('respects limit', async () => {
      const metrics = await getMetricsByProject(db, metricsProjectId, { limit: 1 });
      expect(metrics).toHaveLength(1);
    });
  });

  // =========================================================================
  // getMetricsSummary
  // =========================================================================
  describe('getMetricsSummary', () => {
    let summaryProjectId: string;

    beforeAll(async () => {
      const project = await insertProject(db, testData.project({ name: 'Summary Metrics Test' }));
      summaryProjectId = project.projectId;

      await recordMetric(db, {
        project_id: summaryProjectId,
        event_type: 'merge_time',
        value: 10,
      });
      await recordMetric(db, {
        project_id: summaryProjectId,
        event_type: 'merge_time',
        value: 20,
      });
      await recordMetric(db, {
        project_id: summaryProjectId,
        event_type: 'merge_time',
        value: 30,
      });
      await recordMetric(db, {
        project_id: summaryProjectId,
        event_type: 'confirmation',
        value: 1,
      });
    });

    it('returns per-event-type aggregates', async () => {
      const summary = await getMetricsSummary(db, summaryProjectId);
      expect(summary).toHaveLength(2);

      const mergeTime = summary.find((s) => s.event_type === 'merge_time');
      expect(mergeTime).toBeDefined();
      expect(mergeTime!.count).toBe(3);
      expect(mergeTime!.avg_value).toBeCloseTo(20, 0);
      expect(mergeTime!.min_value).toBe(10);
      expect(mergeTime!.max_value).toBe(30);

      const confirmation = summary.find((s) => s.event_type === 'confirmation');
      expect(confirmation).toBeDefined();
      expect(confirmation!.count).toBe(1);
      expect(confirmation!.avg_value).toBe(1);
    });
  });

  // =========================================================================
  // getMetricsInTimeRange
  // =========================================================================
  describe('getMetricsInTimeRange', () => {
    let rangeProjectId: string;

    beforeAll(async () => {
      const project = await insertProject(db, testData.project({ name: 'Range Metrics Test' }));
      rangeProjectId = project.projectId;

      // Insert metrics with slight time gaps
      await recordMetric(db, {
        project_id: rangeProjectId,
        event_type: 'diff_override',
        value: 1,
      });
      await sleep(50);
      await recordMetric(db, {
        project_id: rangeProjectId,
        event_type: 'diff_override',
        value: 2,
      });
      await sleep(50);
      await recordMetric(db, {
        project_id: rangeProjectId,
        event_type: 'diff_override',
        value: 3,
      });
    });

    it('returns metrics within time range', async () => {
      // Use a broad range that includes all metrics
      const start = new Date(Date.now() - 60_000); // 1 minute ago
      const end = new Date(Date.now() + 60_000); // 1 minute from now

      const metrics = await getMetricsInTimeRange(db, rangeProjectId, start, end);
      expect(metrics).toHaveLength(3);
      // Newest first
      expect(metrics[0].value).toBe(3);
      expect(metrics[2].value).toBe(1);
    });

    it('returns empty for future time range', async () => {
      const start = new Date(Date.now() + 60_000);
      const end = new Date(Date.now() + 120_000);

      const metrics = await getMetricsInTimeRange(db, rangeProjectId, start, end);
      expect(metrics).toHaveLength(0);
    });
  });

  // =========================================================================
  // Empty project
  // =========================================================================
  describe('empty project', () => {
    let emptyProjectId: string;

    beforeAll(async () => {
      const project = await insertProject(db, testData.project({ name: 'Empty Metrics Test' }));
      emptyProjectId = project.projectId;
    });

    it('getMetricsByProject returns empty array', async () => {
      const metrics = await getMetricsByProject(db, emptyProjectId);
      expect(metrics).toHaveLength(0);
    });

    it('getMetricsSummary returns empty array', async () => {
      const summary = await getMetricsSummary(db, emptyProjectId);
      expect(summary).toHaveLength(0);
    });

    it('getMetricsInTimeRange returns empty array', async () => {
      const start = new Date(Date.now() - 60_000);
      const end = new Date(Date.now() + 60_000);
      const metrics = await getMetricsInTimeRange(db, emptyProjectId, start, end);
      expect(metrics).toHaveLength(0);
    });
  });
});

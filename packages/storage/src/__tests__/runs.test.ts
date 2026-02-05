import type { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { AnyDB } from '../adapters';
import { insertProject } from '../queries/projects';
import {
  deleteRun,
  getConfigurationStats,
  getRun,
  getRunByRunnerRunId,
  getRunFilterOptions,
  getTimedOutRuns,
  insertRun,
  listRuns,
  markRunAsTimeout,
  updateRun,
} from '../queries/runs';
import { createTestDB, testData } from './setup';

describe('Runs Storage', () => {
  let db: AnyDB;
  let client: PGlite;
  let cleanup: () => Promise<void>;
  let testProjectId: string;

  beforeAll(async () => {
    const setup = await createTestDB();
    db = setup.db;
    client = setup.client;
    cleanup = setup.cleanup;

    const project = await insertProject(db, testData.project({ name: 'Runs Test' }));
    testProjectId = project.projectId;
  });

  afterAll(async () => {
    await cleanup();
  });

  // =========================================================================
  // insertRun
  // =========================================================================
  describe('insertRun', () => {
    it('creates a run with minimal fields', async () => {
      const run = await insertRun(db, { run_id: 'run_minimal_1' });

      expect(run).toBeDefined();
      expect(run.runId).toBe('run_minimal_1');
      expect(run.status).toBe('queued');
      expect(run.projectId).toBeNull();
      expect(run.createdAt).toBeInstanceOf(Date);
      expect(run.updatedAt).toBeInstanceOf(Date);
    });

    it('creates a run with all fields', async () => {
      const run = await insertRun(db, {
        run_id: 'run_full_1',
        project_id: testProjectId,
        runner_run_id: 'runner_001',
        commit_ref: 'sha256:abc',
        leaf_json: '{"id":"leaf_1","type":"tweet"}',
        inputs_json: '{"query":"hello"}',
        workflow_json: '{"type":"n8n","webhook_id":"wh1"}',
        status: 'running',
        result_json: '{"score":0.8}',
        trace_summary_json: '{"latency_ms":100}',
        trace_policy: 'always',
        full_trace_json: '{"steps":[]}',
        metadata_json: '{"model":"gpt-4","prompt_version":"v1"}',
      });

      expect(run.projectId).toBe(testProjectId);
      expect(run.runnerRunId).toBe('runner_001');
      expect(run.commitRef).toBe('sha256:abc');
      expect(run.status).toBe('running');
      expect(run.tracePolicy).toBe('always');
      expect(run.metadataJson).toBe('{"model":"gpt-4","prompt_version":"v1"}');
    });
  });

  // =========================================================================
  // getRun
  // =========================================================================
  describe('getRun', () => {
    it('returns run by ID', async () => {
      await insertRun(db, { run_id: 'run_get_1', project_id: testProjectId });
      const run = await getRun(db, 'run_get_1');
      expect(run).toBeDefined();
      expect(run!.runId).toBe('run_get_1');
    });

    it('returns undefined for non-existent ID', async () => {
      const run = await getRun(db, 'nonexistent');
      expect(run).toBeUndefined();
    });
  });

  // =========================================================================
  // getRunByRunnerRunId
  // =========================================================================
  describe('getRunByRunnerRunId', () => {
    it('finds run by runner_run_id', async () => {
      await insertRun(db, { run_id: 'run_rr_1', runner_run_id: 'runner_abc' });
      const run = await getRunByRunnerRunId(db, 'runner_abc');
      expect(run).toBeDefined();
      expect(run!.runId).toBe('run_rr_1');
    });

    it('returns undefined when not found', async () => {
      const run = await getRunByRunnerRunId(db, 'no_such_runner');
      expect(run).toBeUndefined();
    });
  });

  // =========================================================================
  // updateRun
  // =========================================================================
  describe('updateRun', () => {
    it('updates status', async () => {
      await insertRun(db, { run_id: 'run_upd_1' });
      const updated = await updateRun(db, 'run_upd_1', { status: 'completed' });
      expect(updated!.status).toBe('completed');
    });

    it('updates result and trace fields', async () => {
      await insertRun(db, { run_id: 'run_upd_2' });
      const updated = await updateRun(db, 'run_upd_2', {
        result_json: '{"score":0.95}',
        trace_summary_json: '{"latency_ms":200}',
        full_trace_json: '{"steps":[{"name":"step1"}]}',
      });
      expect(updated!.resultJson).toBe('{"score":0.95}');
      expect(updated!.traceSummaryJson).toBe('{"latency_ms":200}');
      expect(updated!.fullTraceJson).toContain('step1');
    });

    it('updates metadata', async () => {
      await insertRun(db, { run_id: 'run_upd_3' });
      const updated = await updateRun(db, 'run_upd_3', {
        metadata_json: '{"model":"claude-3"}',
      });
      expect(updated!.metadataJson).toBe('{"model":"claude-3"}');
    });

    it('updates runner_run_id', async () => {
      await insertRun(db, { run_id: 'run_upd_4' });
      const updated = await updateRun(db, 'run_upd_4', { runner_run_id: 'new_runner' });
      expect(updated!.runnerRunId).toBe('new_runner');
    });
  });

  // =========================================================================
  // listRuns
  // =========================================================================
  describe('listRuns', () => {
    let listProjectId: string;

    beforeAll(async () => {
      const project = await insertProject(db, testData.project({ name: 'List Runs Test' }));
      listProjectId = project.projectId;

      await insertRun(db, {
        run_id: 'run_list_1',
        project_id: listProjectId,
        status: 'completed',
        metadata_json: '{"model":"gpt-4","prompt_version":"v1"}',
      });
      await insertRun(db, {
        run_id: 'run_list_2',
        project_id: listProjectId,
        status: 'failed',
        metadata_json: '{"model":"claude-3","prompt_version":"v2"}',
      });
      await insertRun(db, {
        run_id: 'run_list_3',
        project_id: listProjectId,
        status: 'completed',
        metadata_json: '{"model":"gpt-4","prompt_version":"v2"}',
      });
    });

    it('lists all runs without filters', async () => {
      const allRuns = await listRuns(db, {});
      expect(allRuns.length).toBeGreaterThanOrEqual(3);
    });

    it('filters by projectId', async () => {
      const projectRuns = await listRuns(db, { projectId: listProjectId });
      expect(projectRuns.length).toBe(3);
    });

    it('filters by status', async () => {
      const completed = await listRuns(db, { projectId: listProjectId, status: 'completed' });
      expect(completed.length).toBe(2);
    });

    it('filters by model (jsonb)', async () => {
      const gpt4Runs = await listRuns(db, { projectId: listProjectId, model: 'gpt-4' });
      expect(gpt4Runs.length).toBe(2);
    });

    it('filters by prompt_version (jsonb)', async () => {
      const v2Runs = await listRuns(db, { projectId: listProjectId, prompt_version: 'v2' });
      expect(v2Runs.length).toBe(2);
    });

    it('respects limit and offset', async () => {
      const first = await listRuns(db, { projectId: listProjectId, limit: 1 });
      expect(first.length).toBe(1);

      const second = await listRuns(db, { projectId: listProjectId, limit: 1, offset: 1 });
      expect(second.length).toBe(1);
      expect(second[0].runId).not.toBe(first[0].runId);
    });
  });

  // =========================================================================
  // deleteRun
  // =========================================================================
  describe('deleteRun', () => {
    it('deletes existing run', async () => {
      await insertRun(db, { run_id: 'run_del_1' });
      const deleted = await deleteRun(db, 'run_del_1');
      expect(deleted).toBe(true);

      const found = await getRun(db, 'run_del_1');
      expect(found).toBeUndefined();
    });

    it('returns false for non-existent run', async () => {
      const deleted = await deleteRun(db, 'nonexistent');
      expect(deleted).toBe(false);
    });
  });

  // =========================================================================
  // getTimedOutRuns / markRunAsTimeout
  // =========================================================================
  describe('getTimedOutRuns', () => {
    it('finds runs stuck in running state', async () => {
      await insertRun(db, { run_id: 'run_timeout_1', status: 'running' });
      // Set updatedAt to 10 minutes ago via direct SQL
      const tenMinAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();
      await client.exec(
        `UPDATE runs SET updated_at = '${tenMinAgo}' WHERE run_id = 'run_timeout_1'`
      );

      const timedOut = await getTimedOutRuns(db, 5 * 60 * 1000);
      const found = timedOut.find((r) => r.runId === 'run_timeout_1');
      expect(found).toBeDefined();
    });

    it('does not return recently updated running runs', async () => {
      await insertRun(db, { run_id: 'run_timeout_2', status: 'running' });

      const timedOut = await getTimedOutRuns(db, 5 * 60 * 1000);
      const found = timedOut.find((r) => r.runId === 'run_timeout_2');
      expect(found).toBeUndefined();
    });

    it('does not return completed runs', async () => {
      await insertRun(db, { run_id: 'run_timeout_3', status: 'completed' });
      const oldTime = new Date(Date.now() - 10 * 60 * 1000).toISOString();
      await client.exec(`UPDATE runs SET updated_at = '${oldTime}' WHERE run_id = 'run_timeout_3'`);

      const timedOut = await getTimedOutRuns(db, 5 * 60 * 1000);
      const found = timedOut.find((r) => r.runId === 'run_timeout_3');
      expect(found).toBeUndefined();
    });
  });

  describe('markRunAsTimeout', () => {
    it('marks run as failed with timeout error', async () => {
      await insertRun(db, { run_id: 'run_mark_timeout', status: 'running' });
      const run = await markRunAsTimeout(db, 'run_mark_timeout');

      expect(run).toBeDefined();
      expect(run!.status).toBe('failed');
      const result = JSON.parse(run!.resultJson!);
      expect(result.error.code).toBe('TIMEOUT');
      expect(result.error.message).toContain('timed out');
    });
  });

  // =========================================================================
  // getRunFilterOptions
  // =========================================================================
  describe('getRunFilterOptions', () => {
    it('returns unique models and prompt_versions', async () => {
      // Uses runs created in listRuns beforeAll
      const options = await getRunFilterOptions(db);
      expect(options.models).toContain('gpt-4');
      expect(options.models).toContain('claude-3');
      expect(options.prompt_versions).toContain('v1');
      expect(options.prompt_versions).toContain('v2');
    });
  });

  // =========================================================================
  // getConfigurationStats
  // =========================================================================
  describe('getConfigurationStats', () => {
    let statsProjectId: string;

    beforeAll(async () => {
      const project = await insertProject(db, testData.project({ name: 'Stats Test' }));
      statsProjectId = project.projectId;

      // Create runs with full result and trace data
      await insertRun(db, {
        run_id: 'run_stats_1',
        project_id: statsProjectId,
        status: 'completed',
        metadata_json: '{"model":"gpt-4","prompt_version":"v1"}',
        result_json: '{"run_report":{"eval_result":{"score":0.8,"passed":true}}}',
        trace_summary_json: '{"latency_ms":100,"tokens":{"total_tokens":500}}',
      });
      await insertRun(db, {
        run_id: 'run_stats_2',
        project_id: statsProjectId,
        status: 'completed',
        metadata_json: '{"model":"gpt-4","prompt_version":"v1"}',
        result_json: '{"run_report":{"eval_result":{"score":0.6,"passed":true}}}',
        trace_summary_json: '{"latency_ms":200,"tokens":{"total_tokens":600}}',
      });
      await insertRun(db, {
        run_id: 'run_stats_3',
        project_id: statsProjectId,
        status: 'failed',
        metadata_json: '{"model":"gpt-4","prompt_version":"v1"}',
        result_json: '{"run_report":{"eval_result":{"score":0.3,"passed":false}}}',
        trace_summary_json: '{"latency_ms":300,"tokens":{"total_tokens":400}}',
      });
      await insertRun(db, {
        run_id: 'run_stats_4',
        project_id: statsProjectId,
        status: 'completed',
        metadata_json: '{"model":"claude-3","prompt_version":"v2"}',
        result_json: '{"run_report":{"eval_result":{"score":0.9,"passed":true}}}',
        trace_summary_json: '{"latency_ms":150,"tokens":{"total_tokens":300}}',
      });
    });

    it('groups stats by model + prompt_version', async () => {
      const stats = await getConfigurationStats(db, statsProjectId);
      expect(stats.length).toBe(2);

      const gpt4 = stats.find((s) => s.model === 'gpt-4');
      expect(gpt4).toBeDefined();
      expect(gpt4!.prompt_version).toBe('v1');
      expect(gpt4!.run_count).toBe(3);

      const claude = stats.find((s) => s.model === 'claude-3');
      expect(claude).toBeDefined();
      expect(claude!.run_count).toBe(1);
    });

    it('calculates pass rate correctly', async () => {
      const stats = await getConfigurationStats(db, statsProjectId);
      const gpt4 = stats.find((s) => s.model === 'gpt-4')!;
      expect(gpt4.pass_count).toBe(2);
      expect(gpt4.pass_rate).toBeCloseTo(2 / 3, 2);
    });

    it('calculates average score', async () => {
      const stats = await getConfigurationStats(db, statsProjectId);
      const gpt4 = stats.find((s) => s.model === 'gpt-4')!;
      expect(gpt4.avg_score).toBeCloseTo((0.8 + 0.6 + 0.3) / 3, 2);
    });

    it('calculates average latency and tokens', async () => {
      const stats = await getConfigurationStats(db, statsProjectId);
      const gpt4 = stats.find((s) => s.model === 'gpt-4')!;
      expect(gpt4.avg_latency_ms).toBeCloseTo((100 + 200 + 300) / 3, 0);
      expect(gpt4.avg_tokens).toBeCloseTo((500 + 600 + 400) / 3, 0);
    });

    it('includes raw scores and latencies arrays', async () => {
      const stats = await getConfigurationStats(db, statsProjectId);
      const gpt4 = stats.find((s) => s.model === 'gpt-4')!;
      expect(gpt4.scores).toHaveLength(3);
      expect(gpt4.latencies).toHaveLength(3);
    });

    it('returns empty for project with no runs', async () => {
      const emptyProject = await insertProject(db, testData.project({ name: 'Empty Stats' }));
      const stats = await getConfigurationStats(db, emptyProject.projectId);
      expect(stats).toHaveLength(0);
    });
  });
});

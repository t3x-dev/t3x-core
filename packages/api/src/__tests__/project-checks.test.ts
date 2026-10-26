import {
  type AnyDB,
  createPullRequest,
  createValidationFinding,
  createValidationRun,
  createValidationStepRun,
  createYSchemaValidationRun,
  insertProject,
  replacePullRequestChecks,
} from '@t3x-dev/storage';
import { Hono } from 'hono';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { setupTestDB, testData } from './setup';

let db: AnyDB;
vi.mock('../lib/db', () => ({ getDB: () => Promise.resolve(db) }));

import { projectChecksRoutes } from '../routes/project-checks.openapi';

interface RecordData {
  id: string;
  kind: string;
  created_at: string;
  payload: Record<string, unknown>;
}
interface ListResponse {
  data: { records: RecordData[]; next_cursor: string | null };
}

describe('Project checks read surface', () => {
  const app = new Hono().route('/', projectChecksRoutes);
  let cleanup: () => Promise<void>;
  let projectId: string;
  let otherProjectId: string;
  let runId: string;
  let prId: string;
  beforeAll(async () => {
    const setup = await setupTestDB();
    db = setup.db;
    cleanup = setup.cleanup;
    projectId = (await insertProject(db, testData.project({ name: 'Checks' }))).projectId;
    otherProjectId = (await insertProject(db, testData.project({ name: 'Other checks' })))
      .projectId;
    const input = {
      workspace_id: 'ws:main',
      subject_hash: 'subject',
      workflow_name: 'config',
      workflow_hash: 'workflow',
      input_hash: 'input',
      validator_hash: 'validator',
      provider: 'local',
      status: 'failed' as const,
      gate_status: 'blocked' as const,
    };
    runId = (await createValidationRun(db, { ...input, project_id: projectId })).id;
    await createValidationRun(db, { ...input, project_id: otherProjectId });
    const step = await createValidationStepRun(db, {
      run_id: runId,
      step_id: 'validate',
      name: 'Validate',
      status: 'failed',
      log_excerpt: 'bad field',
      log_truncated: true,
    });
    await createValidationFinding(db, {
      run_id: runId,
      step_run_id: step.id,
      severity: 'error',
      code: 'BAD_FIELD',
      message: 'Bad field',
      state_path: 'device/name',
    });
    await createYSchemaValidationRun(db, {
      project_id: projectId,
      commit_hash: 'commit',
      schema_name: 'device',
      schema_version: '1',
      schema_hash: 'schema',
      validator_version: '1',
      status: 'passed',
      valid: true,
      ready: true,
      error_count: 0,
      gap_count: 0,
      fix_count: 0,
      result_json: {},
    });
    const pr = await createPullRequest(db, {
      projectId,
      title: 'Device update',
      sourceBranch: 'feature',
      targetBranch: 'main',
      sourceCommitHash: 'source',
      targetBaseCommitHash: 'target',
      authorId: 'test',
    });
    prId = pr.pullRequestId;
    await replacePullRequestChecks(db, prId, [
      { kind: 'merge_simulation', status: 'passed', title: 'Merge preparation' },
    ]);
    // Equal timestamps exercise the ID tiebreaker across different evidence tables.
    await setup.sql`UPDATE validation_runs SET created_at = '2026-10-23T00:00:00.123456Z' WHERE project_id = ${projectId}`;
    await setup.sql`UPDATE yschema_validation_runs SET created_at = '2026-10-23T00:00:00.123456Z' WHERE project_id = ${projectId}`;
    await setup.sql`UPDATE pull_requests SET updated_at = '2026-10-23T00:00:00.123456Z' WHERE project_id = ${projectId}`;
  });
  afterAll(async () => {
    await cleanup();
  });

  it('paginates tied timestamps across record types without losing or duplicating records', async () => {
    const ids: string[] = [];
    let cursor: string | null = null;
    for (let page = 0; page < 4; page++) {
      const res = await app.request(
        `/v1/projects/${projectId}/checks?limit=1${cursor ? `&cursor=${cursor}` : ''}`
      );
      expect(res.status).toBe(200);
      const body = (await res.json()) as ListResponse;
      ids.push(...body.data.records.map((r) => r.id));
      cursor = body.data.next_cursor;
      if (!cursor) break;
    }
    expect(ids).toHaveLength(3);
    expect(new Set(ids).size).toBe(3);
    expect(ids).toContain(`validation:${runId}`);
    expect(cursor).toBeNull();
  });
  it('filters workspace and PR scopes and keeps their record identities distinct', async () => {
    const workspace = (await (
      await app.request(`/v1/projects/${projectId}/checks?workspace=ws%3Amain`)
    ).json()) as ListResponse;
    expect(workspace.data.records.map((r) => r.id)).toEqual([`validation:${runId}`]);
    const pr = (await (
      await app.request(`/v1/projects/${projectId}/checks?pr=1`)
    ).json()) as ListResponse;
    expect(pr.data.records.map((r) => r.id)).toEqual([`pull-request:${prId}`]);
  });
  it('returns stored steps and findings only within the owning project', async () => {
    const res = await app.request(`/v1/projects/${projectId}/checks/validation%3A${runId}`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: RecordData };
    expect(body.data.payload.details).toMatchObject({
      steps: [{ log_excerpt: 'bad field', log_truncated: true }],
      findings: [{ code: 'BAD_FIELD', state_path: 'device/name' }],
    });
    expect(
      (await app.request(`/v1/projects/${otherProjectId}/checks/validation%3A${runId}`)).status
    ).toBe(404);
  });
  it('searches record identifiers and names without treating wildcard characters as match-all', async () => {
    const matched = (await (
      await app.request(`/v1/projects/${projectId}/checks?q=Device%20update`)
    ).json()) as ListResponse;
    expect(matched.data.records.map((r) => r.id)).toEqual([`pull-request:${prId}`]);
    const unmatched = (await (
      await app.request(`/v1/projects/${projectId}/checks?q=%25`)
    ).json()) as ListResponse;
    expect(unmatched.data.records).toEqual([]);
  });
  it('rejects malformed cursors and denies unauthenticated project reads', async () => {
    expect((await app.request(`/v1/projects/${projectId}/checks?cursor=bad`)).status).toBe(400);
    const previous = process.env.AUTH_DISABLED;
    process.env.AUTH_DISABLED = 'false';
    try {
      expect((await app.request(`/v1/projects/${projectId}/checks`)).status).toBe(403);
    } finally {
      process.env.AUTH_DISABLED = previous;
    }
  });
});

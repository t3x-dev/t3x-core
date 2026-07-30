import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { AnyDB } from '../adapters';
import { insertProject } from '../queries/projects';
import {
  createValidationFinding,
  createValidationRun,
  createValidationStepRun,
  findLatestValidationRunByWorkspace,
  findValidationRunDetailsById,
} from '../queries/validation-runs';
import { validationFindings, validationRuns, validationStepRuns } from '../schema';
import { createTestDB, testData } from './setup';

const WORKFLOW_NAME = 'workspace-validation/esphome-config@v0';

describe('Workspace validation runs storage', () => {
  let db: AnyDB;
  let cleanup: () => Promise<void>;
  let projectId: string;

  beforeAll(async () => {
    const setup = await createTestDB();
    db = setup.db;
    cleanup = setup.cleanup;

    const project = await insertProject(db, testData.project({ name: 'Validation Runs Test' }));
    projectId = project.projectId;
  });

  afterAll(async () => {
    await cleanup();
  });

  it('persists ESPHome run details and cascades evidence rows', async () => {
    const run = await createValidationRun(db, {
      ...baseRunInput('workspace-details', 'subject_a'),
      status: 'failed',
      gate_status: 'blocked',
      summary: 'ESPHome config failed',
      finished_at: new Date(),
    });
    const step = await createValidationStepRun(db, {
      run_id: run.id,
      step_id: 'esphome-config',
      name: 'ESPHome config',
      status: 'failed',
      error_code: 'ESPHOME_CONFIG_FAILED',
      exit_code: 1,
      duration_ms: 1200,
      command_json: ['esphome', 'config', '/config/device.yaml'],
      log_excerpt: 'device.yaml:42 server_registers is not valid in this section',
      log_truncated: true,
      log_artifact_id: 'log_8831',
    });
    const finding = await createValidationFinding(db, {
      run_id: run.id,
      step_run_id: step.id,
      severity: 'error',
      file: 'device.yaml',
      line: 42,
      state_path: 'state://device.modbus[0].server_registers',
      code: 'ESPHOME_CONFIG_FAILED',
      message: 'server_registers is not valid in this section.',
      log_excerpt: 'device.yaml:42 server_registers is not valid in this section',
      evidence_json: { excerpt_bounded: true },
    });

    const details = await findValidationRunDetailsById(db, run.id);

    expect(details?.run).toMatchObject({
      id: run.id,
      project_id: projectId,
      workspace_id: 'workspace-details',
      subject_type: 'candidate',
      workflow_name: WORKFLOW_NAME,
      status: 'failed',
      gate_status: 'blocked',
    });
    expect(details?.steps[0]).toMatchObject({
      id: step.id,
      command_json: ['esphome', 'config', '/config/device.yaml'],
      log_truncated: true,
      log_artifact_id: 'log_8831',
    });
    expect(details?.findings[0]).toMatchObject({
      id: finding.id,
      code: 'ESPHOME_CONFIG_FAILED',
      line: 42,
    });

    await db.delete(validationRuns).where(eq(validationRuns.id, run.id));

    const [stepRows, findingRows] = await Promise.all([
      db.select().from(validationStepRuns).where(eq(validationStepRuns.runId, run.id)),
      db.select().from(validationFindings).where(eq(validationFindings.runId, run.id)),
    ]);
    expect(stepRows).toHaveLength(0);
    expect(findingRows).toHaveLength(0);
  });

  it('finds the latest workspace run for the ESPHome workflow', async () => {
    const workspaceId = 'workspace-latest';
    await createValidationRun(db, baseRunInput(workspaceId, 'subject_b1'));
    await waitForTimestampTick();
    const latestRun = await createValidationRun(db, {
      ...baseRunInput(workspaceId, 'subject_b2'),
      status: 'passed',
      gate_status: 'ready',
    });
    await waitForTimestampTick();
    await createValidationRun(db, {
      ...baseRunInput(workspaceId, 'subject_other_workflow'),
      workflow_name: 'workspace-validation/other@v0',
    });

    const latest = await findLatestValidationRunByWorkspace(db, {
      project_id: projectId,
      workspace_id: workspaceId,
      workflow_name: WORKFLOW_NAME,
    });

    expect(latest?.id).toBe(latestRun.id);
    expect(latest?.gate_status).toBe('ready');
  });

  function baseRunInput(workspaceId: string, subjectHash: string) {
    return {
      project_id: projectId,
      workspace_id: workspaceId,
      subject_hash: subjectHash,
      workflow_name: WORKFLOW_NAME,
      workflow_hash: 'workflow_hash_v0',
      input_hash: `input_${subjectHash}`,
      validator_hash: 'esphome_config_digest',
      provider: 'local-oci',
      status: 'running' as const,
      gate_status: 'pending' as const,
      result_json: { source: 'test' },
      started_at: new Date(),
    };
  }
});

async function waitForTimestampTick(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 5));
}

/** biome-ignore-all lint/suspicious/noExplicitAny: route integration tests use compact response casts */

import type { AnyDB } from '@t3x-dev/storage';
import {
  createValidationFinding,
  createValidationRun,
  createValidationStepRun,
  deleteProject,
  findProjects,
  insertProject,
} from '@t3x-dev/storage';
import { Hono } from 'hono';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { workspaceValidationRoutes } from '../routes/workspace-validation.openapi';
import { setupTestDB, testData } from './setup';

let mockDB: AnyDB;

vi.mock('../lib/db', () => ({
  getDB: vi.fn(() => Promise.resolve(mockDB)),
  closeDB: vi.fn(() => Promise.resolve()),
}));

type ApiResponse = any;

const WORKFLOW_NAME = 'workspace-validation/esphome-config@v0';

describe('Workspace validation routes', () => {
  let cleanup: () => Promise<void>;
  const app = new Hono();
  app.route('/', workspaceValidationRoutes);

  beforeAll(async () => {
    const setup = await setupTestDB();
    mockDB = setup.db;
    cleanup = setup.cleanup;
  });

  afterAll(async () => {
    await cleanup();
  });

  beforeEach(async () => {
    const existingProjects = await findProjects(mockDB, {});
    for (const project of existingProjects) {
      await deleteProject(mockDB, project.projectId);
    }
  });

  it('reads the latest workspace validation run', async () => {
    const project = await insertProject(mockDB, testData.project({ name: 'ESPHome Project' }));
    await createValidationRun(mockDB, {
      project_id: project.projectId,
      workspace_id: 'workspace_esphome',
      subject_hash: 'sha256:subject-old',
      workflow_name: WORKFLOW_NAME,
      workflow_hash: 'sha256:workflow',
      input_hash: 'sha256:input-old',
      validator_hash: 'sha256:validator',
      provider: 'local-oci',
      status: 'failed',
      gate_status: 'blocked',
    });
    const latestRun = await createValidationRun(mockDB, {
      project_id: project.projectId,
      workspace_id: 'workspace_esphome',
      subject_hash: 'sha256:subject-new',
      workflow_name: WORKFLOW_NAME,
      workflow_hash: 'sha256:workflow',
      input_hash: 'sha256:input-new',
      validator_hash: 'sha256:validator',
      provider: 'local-oci',
      status: 'passed',
      gate_status: 'ready',
    });
    await createValidationRun(mockDB, {
      project_id: project.projectId,
      workspace_id: 'workspace_esphome',
      subject_hash: 'sha256:other-workflow',
      workflow_name: 'workspace-validation/other@v0',
      workflow_hash: 'sha256:other',
      input_hash: 'sha256:other-input',
      validator_hash: 'sha256:other-validator',
      provider: 'local-oci',
      status: 'failed',
      gate_status: 'blocked',
    });

    const res = await app.request(
      `/v1/projects/${project.projectId}/workspaces/workspace_esphome/validation-runs/latest`
    );

    expect(res.status).toBe(200);
    const body: ApiResponse = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.run).toMatchObject({
      id: latestRun.id,
      project_id: project.projectId,
      workspace_id: 'workspace_esphome',
      subject_hash: 'sha256:subject-new',
      workflow_name: WORKFLOW_NAME,
      status: 'passed',
      gate_status: 'ready',
    });
  });

  it('reads validation run details with steps and findings', async () => {
    const project = await insertProject(mockDB, testData.project({ name: 'ESPHome Details' }));
    const run = await createValidationRun(mockDB, {
      project_id: project.projectId,
      workspace_id: 'workspace_esphome',
      subject_hash: 'sha256:subject',
      workflow_name: WORKFLOW_NAME,
      workflow_hash: 'sha256:workflow',
      input_hash: 'sha256:input',
      validator_hash: 'sha256:validator',
      provider: 'local-oci',
      status: 'failed',
      gate_status: 'blocked',
      summary: 'ESPHome config failed',
    });
    const step = await createValidationStepRun(mockDB, {
      run_id: run.id,
      step_id: 'esphome-config',
      name: 'ESPHome config',
      status: 'failed',
      exit_code: 1,
      command_json: ['esphome', 'config', '/config/device.yaml'],
      log_excerpt: 'server_registers is not a valid option for modbus.',
      log_truncated: false,
      log_artifact_id: 'log_8831',
    });
    await createValidationFinding(mockDB, {
      run_id: run.id,
      step_run_id: step.id,
      severity: 'error',
      file: 'device.yaml',
      line: 42,
      state_path: 'state://device.modbus[0].server_registers',
      code: 'ESPHOME_CONFIG_FAILED',
      message: 'ESPHome configuration validation failed.',
    });

    const res = await app.request(`/v1/workspace-validation-runs/${run.id}`);

    expect(res.status).toBe(200);
    const body: ApiResponse = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.run).toMatchObject({
      id: run.id,
      status: 'failed',
      gate_status: 'blocked',
    });
    expect(body.data.steps).toHaveLength(1);
    expect(body.data.steps[0]).toMatchObject({
      step_id: 'esphome-config',
      exit_code: 1,
      log_artifact_id: 'log_8831',
    });
    expect(body.data.findings).toHaveLength(1);
    expect(body.data.findings[0]).toMatchObject({
      file: 'device.yaml',
      line: 42,
      code: 'ESPHOME_CONFIG_FAILED',
    });
  });

  it('returns null when no latest run exists for the workspace', async () => {
    const project = await insertProject(mockDB, testData.project({ name: 'No Runs' }));

    const res = await app.request(
      `/v1/projects/${project.projectId}/workspaces/workspace_missing/validation-runs/latest`
    );

    expect(res.status).toBe(200);
    const body: ApiResponse = await res.json();
    expect(body).toEqual({ success: true, data: { run: null } });
  });
});

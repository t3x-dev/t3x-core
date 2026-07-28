/** biome-ignore-all lint/suspicious/noExplicitAny: route integration tests use compact response casts */

import type { AnyDB } from '@t3x-dev/storage';
import {
  createValidationFinding,
  createValidationRun,
  createValidationStepRun,
  deleteProject,
  findProjects,
  insertProject,
  upsertWorkspaceDraft,
} from '@t3x-dev/storage';
import { Hono } from 'hono';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { LocalEsphomeValidationResult } from '../lib/workspace-validation/local-oci-provider';
import { setupTestDB, testData } from './setup';

let mockDB: AnyDB;
const providerMock = vi.hoisted(() => ({
  runLocalEsphomeConfigValidation: vi.fn(),
}));

vi.mock('../lib/db', () => ({
  getDB: vi.fn(() => Promise.resolve(mockDB)),
  closeDB: vi.fn(() => Promise.resolve()),
}));

vi.mock('../lib/workspace-validation/local-oci-provider', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../lib/workspace-validation/local-oci-provider')>();
  return {
    ...actual,
    runLocalEsphomeConfigValidation: providerMock.runLocalEsphomeConfigValidation,
  };
});

import { workspaceValidationRoutes } from '../routes/workspace-validation.openapi';

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
    providerMock.runLocalEsphomeConfigValidation.mockReset();
  });

  it('runs ESPHome workspace validation and persists a passed result', async () => {
    const project = await insertProject(mockDB, testData.project({ name: 'ESPHome Runtime' }));
    await createEsphomeWorkspace(project.projectId);
    providerMock.runLocalEsphomeConfigValidation.mockResolvedValueOnce(
      localProviderResult({
        status: 'passed',
        gate_status: 'ready',
        summary: 'ESPHome config passed.',
        step: {
          status: 'passed',
          summary: 'ESPHome config passed.',
          exit_code: 0,
          log_excerpt: 'INFO Configuration is valid!',
        },
      })
    );

    const res = await app.request(
      `/v1/projects/${project.projectId}/workspaces/workspace_esphome/validation-runs`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      }
    );

    expect(res.status).toBe(201);
    const body: ApiResponse = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.run).toMatchObject({
      project_id: project.projectId,
      workspace_id: 'workspace_esphome',
      workflow_name: WORKFLOW_NAME,
      provider: 'local-oci',
      status: 'passed',
      gate_status: 'ready',
    });
    expect(body.data.steps[0]).toMatchObject({
      step_id: 'esphome-config',
      status: 'passed',
      exit_code: 0,
      command_json: ['esphome', 'config', '/config/device.yaml'],
    });
    expect(body.data.findings).toEqual([]);
    expect(providerMock.runLocalEsphomeConfigValidation).toHaveBeenCalledWith({
      deviceYaml: expect.stringContaining('name: energy-meter'),
    });

    const latestRes = await app.request(
      `/v1/projects/${project.projectId}/workspaces/workspace_esphome/validation-runs/latest`
    );
    const latest: ApiResponse = await latestRes.json();
    expect(latest.data.run.id).toBe(body.data.run.id);
  });

  it('persists ESPHome config failures with a finding', async () => {
    const project = await insertProject(mockDB, testData.project({ name: 'ESPHome Failed' }));
    await createEsphomeWorkspace(project.projectId);
    providerMock.runLocalEsphomeConfigValidation.mockResolvedValueOnce(
      localProviderResult({
        status: 'failed',
        gate_status: 'blocked',
        summary: 'ESPHome config failed.',
        step: {
          status: 'failed',
          summary: 'ESPHome config failed.',
          error_code: 'ESPHOME_CONFIG_FAILED',
          exit_code: 1,
          log_excerpt: 'server_registers is not a valid option for modbus.',
        },
        findings: [
          {
            severity: 'error',
            file: 'device.yaml',
            line: 42,
            state_path: null,
            code: 'ESPHOME_CONFIG_FAILED',
            message: 'ESPHome configuration validation failed.',
            log_excerpt: 'server_registers is not a valid option for modbus.',
            evidence_json: { runtime: 'docker' },
          },
        ],
      })
    );

    const res = await app.request(
      `/v1/projects/${project.projectId}/workspaces/workspace_esphome/validation-runs`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workflow_name: WORKFLOW_NAME }),
      }
    );

    expect(res.status).toBe(201);
    const body: ApiResponse = await res.json();
    expect(body.data.run).toMatchObject({ status: 'failed', gate_status: 'blocked' });
    expect(body.data.steps[0]).toMatchObject({
      step_id: 'esphome-config',
      status: 'failed',
      error_code: 'ESPHOME_CONFIG_FAILED',
      exit_code: 1,
    });
    expect(body.data.findings[0]).toMatchObject({
      step_run_id: body.data.steps[0].id,
      severity: 'error',
      file: 'device.yaml',
      line: 42,
      code: 'ESPHOME_CONFIG_FAILED',
    });
  });

  it('persists environment_required when local OCI runtime is unavailable', async () => {
    const project = await insertProject(mockDB, testData.project({ name: 'ESPHome Env' }));
    await createEsphomeWorkspace(project.projectId);
    providerMock.runLocalEsphomeConfigValidation.mockResolvedValueOnce(
      localProviderResult({
        status: 'environment_required',
        gate_status: 'blocked',
        summary: 'Local OCI runtime is not available.',
        environment_hash: null,
        step: {
          step_id: 'local-oci-preflight',
          name: 'Local OCI preflight',
          status: 'environment_required',
          summary: 'Local OCI runtime is not available.',
          error_code: 'OCI_RUNTIME_MISSING',
          exit_code: null,
          command_json: null,
          log_excerpt: null,
        },
        findings: [
          {
            severity: 'error',
            file: null,
            line: null,
            state_path: null,
            code: 'OCI_RUNTIME_MISSING',
            message: 'Docker or Podman is required to run ESPHome validation.',
            log_excerpt: null,
            evidence_json: {},
          },
        ],
      })
    );

    const res = await app.request(
      `/v1/projects/${project.projectId}/workspaces/workspace_esphome/validation-runs`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workflow_name: WORKFLOW_NAME }),
      }
    );

    expect(res.status).toBe(201);
    const body: ApiResponse = await res.json();
    expect(body.data.run).toMatchObject({
      status: 'environment_required',
      gate_status: 'blocked',
      environment_hash: null,
    });
    expect(body.data.steps[0]).toMatchObject({
      step_id: 'local-oci-preflight',
      status: 'environment_required',
      error_code: 'OCI_RUNTIME_MISSING',
    });
    expect(body.data.findings[0]).toMatchObject({ code: 'OCI_RUNTIME_MISSING' });
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

  it('rejects workspaces without ESPHome device state', async () => {
    const project = await insertProject(mockDB, testData.project({ name: 'Unsupported Input' }));
    await upsertWorkspaceDraft(mockDB, {
      project_id: project.projectId,
      workspace_id: 'workspace_prd',
      title: 'PRD Workspace',
      workspace_state: { summary: { audience: 'Product reviewers' } },
    });

    const res = await app.request(
      `/v1/projects/${project.projectId}/workspaces/workspace_prd/validation-runs`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workflow_name: WORKFLOW_NAME }),
      }
    );

    expect(res.status).toBe(400);
    const body: ApiResponse = await res.json();
    expect(body.error).toMatchObject({
      code: 'VALIDATION_INPUT_NOT_SUPPORTED',
      message: 'ESPHome validation requires workspace.device candidate state.',
    });
    expect(providerMock.runLocalEsphomeConfigValidation).not.toHaveBeenCalled();
  });
});

async function createEsphomeWorkspace(projectId: string) {
  return upsertWorkspaceDraft(mockDB, {
    project_id: projectId,
    workspace_id: 'workspace_esphome',
    title: 'ESPHome Workspace',
    workspace_state: {
      id: 'workspace_esphome',
      projectId,
      device: {
        esphome: { name: 'energy-meter' },
        esp32: { board: 'esp32dev' },
      },
    },
  });
}

function localProviderResult(
  overrides: Partial<LocalEsphomeValidationResult>
): LocalEsphomeValidationResult {
  return {
    status: overrides.status ?? 'passed',
    gate_status: overrides.gate_status ?? 'ready',
    summary: overrides.summary ?? 'ESPHome config passed.',
    environment_hash: Object.hasOwn(overrides, 'environment_hash')
      ? (overrides.environment_hash ?? null)
      : 'sha256:environment',
    step: {
      step_id: 'esphome-config',
      name: 'ESPHome config',
      status: 'passed',
      summary: 'ESPHome config passed.',
      error_code: null,
      exit_code: 0,
      duration_ms: 25,
      command_json: ['esphome', 'config', '/config/device.yaml'],
      log_excerpt: null,
      log_truncated: false,
      result_json: { runtime: 'docker' },
      ...overrides.step,
    },
    findings: overrides.findings ?? [],
  };
}

import { API_V1, fetchWithTimeout, handleResponse } from './core';

export type WorkspaceValidationRunStatus =
  | 'pending'
  | 'running'
  | 'passed'
  | 'failed'
  | 'stale'
  | 'environment_required'
  | 'timed_out';

export type WorkspaceValidationStepStatus =
  | 'pending'
  | 'running'
  | 'passed'
  | 'failed'
  | 'skipped'
  | 'environment_required'
  | 'timed_out';

export type WorkspaceValidationGateStatus = 'ready' | 'blocked' | 'pending' | 'stale';

export interface WorkspaceValidationRun {
  id: string;
  project_id: string;
  workspace_id: string;
  subject_type: 'candidate';
  subject_hash: string;
  workflow_name: string;
  workflow_hash: string;
  input_hash: string;
  validator_hash: string;
  environment_hash: string | null;
  provider: string;
  status: WorkspaceValidationRunStatus;
  gate_status: WorkspaceValidationGateStatus;
  summary: string | null;
  result_json: Record<string, unknown>;
  created_at: string;
  started_at: string | null;
  finished_at: string | null;
}

export interface WorkspaceValidationStep {
  id: string;
  run_id: string;
  step_id: string;
  name: string;
  status: WorkspaceValidationStepStatus;
  summary: string | null;
  error_code: string | null;
  exit_code: number | null;
  duration_ms: number | null;
  command_json: unknown[] | null;
  log_excerpt: string | null;
  log_truncated: boolean;
  log_artifact_id: string | null;
  result_json: Record<string, unknown>;
  created_at: string;
  started_at: string | null;
  finished_at: string | null;
}

export interface WorkspaceValidationFinding {
  id: string;
  run_id: string;
  step_run_id: string | null;
  severity: 'error' | 'warning' | 'info';
  file: string | null;
  line: number | null;
  state_path: string | null;
  code: string;
  message: string;
  log_excerpt: string | null;
  evidence_json: Record<string, unknown>;
  created_at: string;
}

export interface WorkspaceValidationDetails {
  run: WorkspaceValidationRun;
  steps: WorkspaceValidationStep[];
  findings: WorkspaceValidationFinding[];
}

export async function getLatestWorkspaceValidationRun(
  projectId: string,
  workspaceId: string
): Promise<WorkspaceValidationRun | null> {
  const res = await fetchWithTimeout(
    `${API_V1}/projects/${encodeURIComponent(projectId)}/workspaces/${encodeURIComponent(
      workspaceId
    )}/validation-runs/latest`
  );
  const data = await handleResponse<{ run: WorkspaceValidationRun | null }>(res);
  return data.run;
}

export async function runWorkspaceValidation(
  projectId: string,
  workspaceId: string
): Promise<WorkspaceValidationDetails> {
  const res = await fetchWithTimeout(
    `${API_V1}/projects/${encodeURIComponent(projectId)}/workspaces/${encodeURIComponent(
      workspaceId
    )}/validation-runs`,
    {
      body: JSON.stringify({}),
      headers: { 'Content-Type': 'application/json' },
      method: 'POST',
    },
    180_000
  );
  return handleResponse<WorkspaceValidationDetails>(res);
}

export async function getWorkspaceValidationRun(
  runId: string
): Promise<WorkspaceValidationDetails> {
  const res = await fetchWithTimeout(
    `${API_V1}/workspace-validation-runs/${encodeURIComponent(runId)}`
  );
  return handleResponse<WorkspaceValidationDetails>(res);
}

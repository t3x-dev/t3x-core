import type { WorkspaceCandidate, WorkspaceValidationOverride } from '@/types/workspaces';
import type { WorkspaceYOpsTreeNode } from '@/types/workspaceYops';
import { API_V1, buildQueryString, fetchWithTimeout, handleResponse } from './core';

interface ProjectWorkspacesResponse {
  workspaces: WorkspaceCandidate[];
}

export interface WorkspaceSaveResponse {
  candidate_id: string;
  yops_draft_id?: string;
  workspace: WorkspaceCandidate;
}

export interface WorkspaceCommitResponse extends WorkspaceSaveResponse {
  commit: { hash: string };
}

export const ESPHOME_WORKSPACE_VALIDATION_WORKFLOW = 'workspace-validation/esphome-config@v0';

export type WorkspaceValidationRunStatus =
  | 'pending'
  | 'running'
  | 'passed'
  | 'failed'
  | 'stale'
  | 'environment_required'
  | 'timed_out';

export type WorkspaceValidationStepRunStatus =
  | 'pending'
  | 'running'
  | 'passed'
  | 'failed'
  | 'skipped'
  | 'environment_required'
  | 'timed_out';

export type WorkspaceValidationGateStatus = 'ready' | 'blocked' | 'pending' | 'stale';
export type WorkspaceValidationFindingSeverity = 'error' | 'warning' | 'info';
export type WorkspaceValidationStaleReason =
  | 'subject_changed'
  | 'input_changed'
  | 'workflow_changed'
  | 'validator_changed';

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

export interface WorkspaceValidationStepRun {
  id: string;
  run_id: string;
  step_id: string;
  name: string;
  status: WorkspaceValidationStepRunStatus;
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
  severity: WorkspaceValidationFindingSeverity;
  file: string | null;
  line: number | null;
  state_path: string | null;
  code: string;
  message: string;
  log_excerpt: string | null;
  evidence_json: Record<string, unknown>;
  created_at: string;
}

export interface WorkspaceValidationRunDetails {
  run: WorkspaceValidationRun;
  steps: WorkspaceValidationStepRun[];
  findings: WorkspaceValidationFinding[];
}

export interface LatestWorkspaceValidationRunResponse {
  run: WorkspaceValidationRun | null;
  fresh: boolean;
  stale_reason: WorkspaceValidationStaleReason | null;
}

export interface LatestWorkspaceValidationRunOptions {
  workflowName?: string;
}

export interface CreateWorkspaceValidationRunPayload {
  workflowName?: string;
}

export function workspaceWritePayload(workspace: WorkspaceCandidate) {
  const { revision, ...workspaceState } = workspace;
  return {
    workspace: workspaceState,
    ...(revision === undefined ? {} : { if_revision: revision }),
  };
}

export async function listProjectWorkspaces(projectId: string): Promise<WorkspaceCandidate[]> {
  const res = await fetchWithTimeout(
    `${API_V1}/projects/${encodeURIComponent(projectId)}/workspaces`
  );
  const data = await handleResponse<ProjectWorkspacesResponse>(res);
  return data.workspaces;
}

export async function saveProjectWorkspace(
  projectId: string,
  workspaceId: string,
  workspace: WorkspaceCandidate
): Promise<WorkspaceSaveResponse> {
  const res = await fetchWithTimeout(
    `${API_V1}/projects/${encodeURIComponent(projectId)}/workspaces/${encodeURIComponent(
      workspaceId
    )}`,
    {
      body: JSON.stringify(workspaceWritePayload(workspace)),
      headers: { 'Content-Type': 'application/json' },
      method: 'PATCH',
    }
  );
  return handleResponse<WorkspaceSaveResponse>(res);
}

export async function commitProjectWorkspace(
  projectId: string,
  workspaceId: string,
  content: { trees: WorkspaceYOpsTreeNode[]; relations: unknown[] },
  message?: string,
  validationOverride?: WorkspaceValidationOverride,
  ifRevision?: number
): Promise<WorkspaceCommitResponse> {
  const res = await fetchWithTimeout(
    `${API_V1}/projects/${encodeURIComponent(projectId)}/workspaces/${encodeURIComponent(
      workspaceId
    )}/commit`,
    {
      body: JSON.stringify({
        content,
        ...(message ? { message } : {}),
        ...(validationOverride ? { validationOverride } : {}),
        ...(ifRevision === undefined ? {} : { if_revision: ifRevision }),
      }),
      headers: { 'Content-Type': 'application/json' },
      method: 'POST',
    }
  );
  return handleResponse<WorkspaceCommitResponse>(res);
}

export async function getLatestWorkspaceValidationRun(
  projectId: string,
  workspaceId: string,
  options: LatestWorkspaceValidationRunOptions = {}
): Promise<LatestWorkspaceValidationRunResponse> {
  const query = buildQueryString({
    workflow_name: options.workflowName ?? ESPHOME_WORKSPACE_VALIDATION_WORKFLOW,
  });
  const res = await fetchWithTimeout(
    `${API_V1}/projects/${encodeURIComponent(projectId)}/workspaces/${encodeURIComponent(
      workspaceId
    )}/validation-runs/latest?${query}`
  );
  return handleResponse<LatestWorkspaceValidationRunResponse>(res);
}

export async function createWorkspaceValidationRun(
  projectId: string,
  workspaceId: string,
  payload: CreateWorkspaceValidationRunPayload = {}
): Promise<WorkspaceValidationRunDetails> {
  const res = await fetchWithTimeout(
    `${API_V1}/projects/${encodeURIComponent(projectId)}/workspaces/${encodeURIComponent(
      workspaceId
    )}/validation-runs`,
    {
      body: JSON.stringify({
        workflow_name: payload.workflowName ?? ESPHOME_WORKSPACE_VALIDATION_WORKFLOW,
      }),
      headers: { 'Content-Type': 'application/json' },
      method: 'POST',
    },
    120_000
  );
  return handleResponse<WorkspaceValidationRunDetails>(res);
}

export async function getWorkspaceValidationRunDetails(
  runId: string
): Promise<WorkspaceValidationRunDetails> {
  const res = await fetchWithTimeout(
    `${API_V1}/workspace-validation-runs/${encodeURIComponent(runId)}`
  );
  return handleResponse<WorkspaceValidationRunDetails>(res);
}

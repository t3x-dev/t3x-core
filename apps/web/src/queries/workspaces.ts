import {
  type CreateWorkspaceValidationRunPayload,
  commitProjectWorkspace,
  createWorkspaceValidationRun,
  getLatestWorkspaceValidationRun,
  getWorkspaceValidationRunDetails,
  type LatestWorkspaceValidationRunOptions,
  type LatestWorkspaceValidationRunResponse,
  listProjectWorkspaces,
  saveProjectWorkspace,
  type WorkspaceCommitResponse,
  type WorkspaceSaveResponse,
  type WorkspaceValidationFinding,
  type WorkspaceValidationGateStatus,
  type WorkspaceValidationRun,
  type WorkspaceValidationRunDetails,
  type WorkspaceValidationRunStatus,
  type WorkspaceValidationStaleReason,
  type WorkspaceValidationStepRun,
  type WorkspaceValidationStepRunStatus,
} from '@/infrastructure/workspaces';
import type { WorkspaceCandidate, WorkspaceValidationOverride } from '@/types/workspaces';
import type { WorkspaceYOpsTreeNode } from '@/types/workspaceYops';

export type {
  CreateWorkspaceValidationRunPayload,
  LatestWorkspaceValidationRunOptions,
  LatestWorkspaceValidationRunResponse,
  WorkspaceValidationFinding,
  WorkspaceValidationGateStatus,
  WorkspaceValidationRun,
  WorkspaceValidationRunDetails,
  WorkspaceValidationRunStatus,
  WorkspaceValidationStaleReason,
  WorkspaceValidationStepRun,
  WorkspaceValidationStepRunStatus,
};

export function fetchProjectWorkspaces(projectId: string): Promise<WorkspaceCandidate[]> {
  return listProjectWorkspaces(projectId);
}

export function saveWorkspaceDraft(
  projectId: string,
  workspaceId: string,
  workspace: WorkspaceCandidate
): Promise<WorkspaceSaveResponse> {
  return saveProjectWorkspace(projectId, workspaceId, workspace);
}

export function commitWorkspaceDraft(
  projectId: string,
  workspaceId: string,
  content: { trees: WorkspaceYOpsTreeNode[]; relations: unknown[] },
  message?: string,
  validationOverride?: WorkspaceValidationOverride,
  ifRevision?: number
): Promise<WorkspaceCommitResponse> {
  return commitProjectWorkspace(
    projectId,
    workspaceId,
    content,
    message,
    validationOverride,
    ifRevision
  );
}

export function fetchLatestWorkspaceValidationRun(
  projectId: string,
  workspaceId: string,
  options?: LatestWorkspaceValidationRunOptions
): Promise<LatestWorkspaceValidationRunResponse> {
  return getLatestWorkspaceValidationRun(projectId, workspaceId, options);
}

export function runWorkspaceValidation(
  projectId: string,
  workspaceId: string,
  payload?: CreateWorkspaceValidationRunPayload
): Promise<WorkspaceValidationRunDetails> {
  return createWorkspaceValidationRun(projectId, workspaceId, payload);
}

export function fetchWorkspaceValidationRunDetails(
  runId: string
): Promise<WorkspaceValidationRunDetails> {
  return getWorkspaceValidationRunDetails(runId);
}

import type { TransitionViewV1 } from '@t3x-dev/core';
import type {
  WorkspaceCandidate,
  WorkspaceSourceArtifact,
  WorkspaceSourceMaterialSelector,
  WorkspaceValidationOverride,
} from '@/types/workspaces';
import type { WorkspaceYOpsTreeNode } from '@/types/workspaceYops';
import { API_V1, fetchWithTimeout, handleResponse } from './core';

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

export type WorkspaceTransitionOutcome = 'accepted' | 'overridden' | 'rejected';

export interface WorkspaceTransitionContent {
  trees: WorkspaceYOpsTreeNode[];
  relations: unknown[];
}

export interface WorkspaceTransitionPrecondition {
  workspace_revision: number;
  ref_head: string | null;
  effect_digest: string;
  proposal_digest: string;
  statement_digests: string[];
  policy_digest: string;
}

export interface WorkspaceTransitionReviewResponse {
  transition: TransitionViewV1;
  precondition: WorkspaceTransitionPrecondition;
}

export interface WorkspaceTransitionDecisionResponse extends WorkspaceTransitionReviewResponse {
  decision_digest: string;
  commit?: unknown;
  workspace?: Record<string, unknown>;
}

export interface WorkspaceSourceReplaceScalarOperation {
  op: 'replace_scalar';
  path: Array<string | number>;
  expect: string;
  value: string;
}

export type WorkspaceSourceChange =
  | { mode: 'import'; root: WorkspaceSourceMaterialSelector }
  | { mode: 'edit'; operations: WorkspaceSourceReplaceScalarOperation[] };

export interface WorkspaceSourceTransitionPrecondition {
  workspace_revision: number;
  ref_head: string | null;
  source_selector_digest: string;
  source_input_manifest_digest: string | null;
  effect_digest: string;
  proposal_digest: string;
  statement_digests: string[];
  policy_digest: string;
}

export type WorkspaceSourceRunnerStatus =
  | { mode: 'not_configured' }
  | {
      mode: 'inputs_unavailable';
      reason: 'secret_resolver_unavailable' | 'secret_resolution_failed';
      secretReferenceNames: string[];
    }
  | { mode: 'no_statement'; reason: 'environment_required' | 'timed_out' }
  | { mode: 'statement'; statementDigest: string; outcome: 'passed' | 'failed' };

export interface WorkspaceSourceTransitionReviewResponse {
  transition: TransitionViewV1;
  precondition: WorkspaceSourceTransitionPrecondition;
  runner: WorkspaceSourceRunnerStatus;
}

export interface WorkspaceSourceTransitionDecisionResponse
  extends WorkspaceSourceTransitionReviewResponse {
  decision_digest: string;
  commit?: unknown;
  workspace?: WorkspaceCandidate;
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

/** Request a server-derived review without accepting client authority facts. */
export async function reviewProjectWorkspaceTransition(
  projectId: string,
  workspaceId: string,
  content: WorkspaceTransitionContent,
  why: string | undefined,
  ifRevision: number
): Promise<WorkspaceTransitionReviewResponse> {
  const res = await fetchWithTimeout(
    `${API_V1}/projects/${encodeURIComponent(projectId)}/workspaces/${encodeURIComponent(
      workspaceId
    )}/transition/review`,
    {
      body: JSON.stringify({
        content,
        ...(why ? { why } : {}),
        if_revision: ifRevision,
      }),
      headers: { 'Content-Type': 'application/json' },
      method: 'POST',
    }
  );
  return handleResponse<WorkspaceTransitionReviewResponse>(res);
}

/** Re-derive and decide the exact graph bound by a prior review precondition. */
export async function decideProjectWorkspaceTransition(
  projectId: string,
  workspaceId: string,
  input: {
    content: WorkspaceTransitionContent;
    why?: string;
    outcome: WorkspaceTransitionOutcome;
    decisionReason?: string;
    precondition: WorkspaceTransitionPrecondition;
  }
): Promise<WorkspaceTransitionDecisionResponse> {
  const res = await fetchWithTimeout(
    `${API_V1}/projects/${encodeURIComponent(projectId)}/workspaces/${encodeURIComponent(
      workspaceId
    )}/transition/decide`,
    {
      body: JSON.stringify({
        content: input.content,
        ...(input.why ? { why: input.why } : {}),
        outcome: input.outcome,
        ...(input.decisionReason ? { decision_reason: input.decisionReason } : {}),
        precondition: input.precondition,
      }),
      headers: { 'Content-Type': 'application/json' },
      method: 'POST',
    }
  );
  return handleResponse<WorkspaceTransitionDecisionResponse>(res);
}

/** Review an exact-source task; trusted source bytes and authority remain server-owned. */
export async function reviewProjectWorkspaceSourceTransition(
  projectId: string,
  workspaceId: string,
  input: {
    artifact: WorkspaceSourceArtifact;
    change: WorkspaceSourceChange;
    why?: string;
    ifRevision: number;
  }
): Promise<WorkspaceSourceTransitionReviewResponse> {
  const res = await fetchWithTimeout(
    `${API_V1}/projects/${encodeURIComponent(projectId)}/workspaces/${encodeURIComponent(
      workspaceId
    )}/source-transition/review`,
    {
      body: JSON.stringify({
        artifact: sourceArtifactToWire(input.artifact),
        change: sourceChangeToWire(input.change),
        ...(input.why ? { why: input.why } : {}),
        if_revision: input.ifRevision,
      }),
      headers: { 'Content-Type': 'application/json' },
      method: 'POST',
    }
  );
  return handleResponse<WorkspaceSourceTransitionReviewResponse>(res);
}

/** Re-derive and decide the exact-source graph bound by the opaque Review precondition. */
export async function decideProjectWorkspaceSourceTransition(
  projectId: string,
  workspaceId: string,
  input: {
    artifact: WorkspaceSourceArtifact;
    change: WorkspaceSourceChange;
    why?: string;
    outcome: WorkspaceTransitionOutcome;
    decisionReason?: string;
    precondition: WorkspaceSourceTransitionPrecondition;
  }
): Promise<WorkspaceSourceTransitionDecisionResponse> {
  const res = await fetchWithTimeout(
    `${API_V1}/projects/${encodeURIComponent(projectId)}/workspaces/${encodeURIComponent(
      workspaceId
    )}/source-transition/decide`,
    {
      body: JSON.stringify({
        artifact: sourceArtifactToWire(input.artifact),
        change: sourceChangeToWire(input.change),
        ...(input.why ? { why: input.why } : {}),
        outcome: input.outcome,
        ...(input.decisionReason ? { decision_reason: input.decisionReason } : {}),
        precondition: input.precondition,
      }),
      headers: { 'Content-Type': 'application/json' },
      method: 'POST',
    }
  );
  return handleResponse<WorkspaceSourceTransitionDecisionResponse>(res);
}

/** Request a server-derived reverse Effect for the current committed exact-source edit. */
export async function reviewProjectWorkspaceSourceRevert(
  projectId: string,
  workspaceId: string,
  input: {
    commitId: string;
    why?: string;
    ifRevision: number;
  }
): Promise<WorkspaceSourceTransitionReviewResponse> {
  const res = await fetchWithTimeout(
    `${API_V1}/projects/${encodeURIComponent(projectId)}/workspaces/${encodeURIComponent(
      workspaceId
    )}/source-transition/revert/review`,
    {
      body: JSON.stringify({
        commit_id: input.commitId,
        ...(input.why ? { why: input.why } : {}),
        if_revision: input.ifRevision,
      }),
      headers: { 'Content-Type': 'application/json' },
      method: 'POST',
    }
  );
  return handleResponse<WorkspaceSourceTransitionReviewResponse>(res);
}

/** Re-derive and decide the reverse Effect bound by an opaque Review precondition. */
export async function decideProjectWorkspaceSourceRevert(
  projectId: string,
  workspaceId: string,
  input: {
    commitId: string;
    why?: string;
    outcome: WorkspaceTransitionOutcome;
    decisionReason?: string;
    precondition: WorkspaceSourceTransitionPrecondition;
  }
): Promise<WorkspaceSourceTransitionDecisionResponse> {
  const res = await fetchWithTimeout(
    `${API_V1}/projects/${encodeURIComponent(projectId)}/workspaces/${encodeURIComponent(
      workspaceId
    )}/source-transition/revert/decide`,
    {
      body: JSON.stringify({
        commit_id: input.commitId,
        ...(input.why ? { why: input.why } : {}),
        outcome: input.outcome,
        ...(input.decisionReason ? { decision_reason: input.decisionReason } : {}),
        precondition: input.precondition,
      }),
      headers: { 'Content-Type': 'application/json' },
      method: 'POST',
    }
  );
  return handleResponse<WorkspaceSourceTransitionDecisionResponse>(res);
}

function sourceArtifactToWire(artifact: WorkspaceSourceArtifact) {
  return {
    format: artifact.format,
    root_path: artifact.rootPath,
    resources: artifact.resources.map((resource) => ({
      path: resource.path,
      material_id: resource.materialId,
      ...(resource.contentHash ? { content_hash: resource.contentHash } : {}),
    })),
  };
}

function sourceChangeToWire(change: WorkspaceSourceChange) {
  if (change.mode === 'import') {
    return {
      mode: 'import' as const,
      root: {
        material_id: change.root.materialId,
        ...(change.root.contentHash ? { content_hash: change.root.contentHash } : {}),
      },
    };
  }
  return {
    mode: 'edit' as const,
    operations: change.operations.map((operation) => ({
      op: operation.op,
      path: [...operation.path],
      expect: operation.expect,
      value: operation.value,
    })),
  };
}

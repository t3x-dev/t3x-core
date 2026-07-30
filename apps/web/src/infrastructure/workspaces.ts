import type { TransitionViewV1 } from '@t3x-dev/core';
import type { WorkspaceCandidate, WorkspaceValidationOverride } from '@/types/workspaces';
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

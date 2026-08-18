import type { WorkspaceProposalGenerationView, WorkspaceProposalPosture } from '@/types/workspaces';
import { API_V1, fetchWithTimeout, handleResponse } from './core';

const PROPOSAL_GENERATION_TIMEOUT_MS = 180_000;

interface ProposalGenerationEnvelope {
  transition_id: string;
  reused: boolean;
  view: WorkspaceProposalGenerationView;
}

interface ProposalVerificationEnvelope extends ProposalGenerationEnvelope {
  statements: unknown[];
  operational_results: unknown[];
}

interface ProposalDecisionEnvelope extends ProposalGenerationEnvelope {
  decision_digest: string;
  decision: unknown;
}

interface ProposalCommitEnvelope {
  transition_id: string;
  reused: boolean;
  commit_digest: string;
  commit: unknown;
  transition: unknown;
  workspace?: Record<string, unknown>;
}

export async function generateWorkspaceProposal(input: {
  projectId: string;
  workspaceId: string;
  posture: WorkspaceProposalPosture;
  instruction: string;
  sourceMaterialIds: string[];
  ifRevision?: number;
}): Promise<ProposalGenerationEnvelope> {
  const res = await fetchWithTimeout(
    `${API_V1}/projects/${encodeURIComponent(input.projectId)}/proposal-generations`,
    {
      body: JSON.stringify({
        request_id: `proposal-generation:${crypto.randomUUID()}`,
        workspace_id: input.workspaceId,
        posture: input.posture,
        instruction: input.instruction,
        source_material_ids: input.sourceMaterialIds,
        ...(input.ifRevision === undefined ? {} : { if_revision: input.ifRevision }),
      }),
      headers: { 'Content-Type': 'application/json' },
      method: 'POST',
    },
    PROPOSAL_GENERATION_TIMEOUT_MS
  );
  return handleResponse<ProposalGenerationEnvelope>(res);
}

export async function verifyWorkspaceProposal(
  projectId: string,
  transitionId: string
): Promise<ProposalVerificationEnvelope> {
  return postTransitionAction<ProposalVerificationEnvelope>(projectId, transitionId, 'verify', {
    request_id: `proposal-verification:${crypto.randomUUID()}`,
  });
}

export async function decideWorkspaceProposal(
  projectId: string,
  view: WorkspaceProposalGenerationView,
  outcome: 'accepted' | 'rejected'
): Promise<ProposalDecisionEnvelope> {
  if (!view.precondition.policy_digest) {
    throw new Error('The proposal has no decision policy. Run verification again.');
  }
  return postTransitionAction<ProposalDecisionEnvelope>(
    projectId,
    view.transition_id,
    'decisions',
    {
      request_id: `proposal-decision:${crypto.randomUUID()}`,
      outcome,
      precondition: view.precondition,
    }
  );
}

export async function commitWorkspaceProposal(
  projectId: string,
  view: WorkspaceProposalGenerationView,
  decisionDigest: string
): Promise<ProposalCommitEnvelope> {
  return postTransitionAction<ProposalCommitEnvelope>(projectId, view.transition_id, 'commits', {
    request_id: `proposal-commit:${crypto.randomUUID()}`,
    decision_digest: decisionDigest,
    expected_head: view.precondition.ref_head,
  });
}

async function postTransitionAction<T>(
  projectId: string,
  transitionId: string,
  action: 'verify' | 'decisions' | 'commits',
  body: Record<string, unknown>
): Promise<T> {
  const res = await fetchWithTimeout(
    `${API_V1}/projects/${encodeURIComponent(projectId)}/transitions/${encodeURIComponent(
      transitionId
    )}/${action}`,
    {
      body: JSON.stringify(body),
      headers: { 'Content-Type': 'application/json' },
      method: 'POST',
    }
  );
  return handleResponse<T>(res);
}

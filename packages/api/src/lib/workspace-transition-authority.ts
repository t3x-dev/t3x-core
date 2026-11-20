import type { RequestPrincipal } from '@t3x-dev/application';
import type { TransitionScope } from '@t3x-dev/core';
import { type AnyDB, findWorkspaceDraft } from '@t3x-dev/storage';
import {
  requireTransitionAuthority,
  resolveTransitionControlPlane,
  TransitionProjectScopeDeniedError,
  TransitionScopeDeniedError,
} from './transition-authority';
import { WorkspaceTransitionNotFoundError } from './workspace-transition';

type CompatibilityOperation =
  | { kind: 'review' }
  | { kind: 'decide'; outcome: 'accepted' | 'overridden' | 'rejected' };

function decisionScope(
  outcome: Extract<CompatibilityOperation, { kind: 'decide' }>['outcome']
): TransitionScope {
  if (outcome === 'accepted') return 'transition:decide:accept';
  if (outcome === 'overridden') return 'transition:decide:override';
  return 'transition:decide:reject';
}

function workspaceDecisionScopes(
  outcome: Extract<CompatibilityOperation, { kind: 'decide' }>['outcome']
): TransitionScope[] {
  return outcome === 'rejected'
    ? [decisionScope(outcome), 'transition:propose']
    : [
        decisionScope(outcome),
        'transition:propose',
        'transition:commit:create',
        'transition:ref:advance',
      ];
}

export function canRequestWorkspaceOverride(
  apiKey: RequestPrincipal | undefined,
  projectId: string
) {
  try {
    for (const scope of workspaceDecisionScopes('overridden')) {
      requireTransitionAuthority({ apiKey, projectId, scope });
    }
    return true;
  } catch (error) {
    if (
      error instanceof TransitionScopeDeniedError ||
      error instanceof TransitionProjectScopeDeniedError
    )
      return false;
    throw error;
  }
}

/**
 * Bind compatibility workspace endpoints to the same authenticated actor,
 * explicit scopes, project boundary, and server-selected ref policy as the
 * canonical Transition control plane.
 */
export async function resolveWorkspaceTransitionAuthority(input: {
  db: AnyDB;
  apiKey: RequestPrincipal | undefined;
  projectId: string;
  workspaceId: string;
  operation: CompatibilityOperation;
}) {
  const draft = await findWorkspaceDraft(input.db, input.projectId, input.workspaceId);
  if (draft === null || draft.workspace_state === null) {
    throw new WorkspaceTransitionNotFoundError(input.workspaceId);
  }
  const refName = draft.target_branch?.trim() || 'main';
  const primaryScope =
    input.operation.kind === 'review'
      ? 'transition:propose'
      : decisionScope(input.operation.outcome);
  const resolved = await resolveTransitionControlPlane({
    db: input.db,
    apiKey: input.apiKey,
    projectId: input.projectId,
    refName,
    scope: primaryScope,
  });

  if (input.operation.kind === 'decide') {
    for (const scope of workspaceDecisionScopes(input.operation.outcome).slice(1)) {
      requireTransitionAuthority({
        apiKey: input.apiKey,
        projectId: input.projectId,
        scope,
      });
    }
  }

  return resolved;
}

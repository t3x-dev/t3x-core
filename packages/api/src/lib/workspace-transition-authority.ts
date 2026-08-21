import type { ApiKey, TransitionScope } from '@t3x-dev/core';
import { type AnyDB, findWorkspaceDraft } from '@t3x-dev/storage';
import { requireTransitionAuthority, resolveTransitionControlPlane } from './transition-authority';
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

/**
 * Bind compatibility workspace endpoints to the same authenticated actor,
 * explicit scopes, project boundary, and server-selected ref policy as the
 * canonical Transition control plane.
 */
export async function resolveWorkspaceTransitionAuthority(input: {
  db: AnyDB;
  apiKey: ApiKey | undefined;
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
    requireTransitionAuthority({
      apiKey: input.apiKey,
      projectId: input.projectId,
      scope: 'transition:propose',
    });
    if (input.operation.outcome !== 'rejected') {
      requireTransitionAuthority({
        apiKey: input.apiKey,
        projectId: input.projectId,
        scope: 'transition:commit:create',
      });
      requireTransitionAuthority({
        apiKey: input.apiKey,
        projectId: input.projectId,
        scope: 'transition:ref:advance',
      });
    }
  }

  return resolved;
}

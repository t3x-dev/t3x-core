import { createHash } from 'node:crypto';
import type { DraftActionActor, DraftActionGeneration } from '@t3x-dev/application';
import { createYSchemaResourceDescriptor } from '@t3x-dev/core';
import {
  type AnyDB,
  DraftAuthoringConflictError,
  lockMaterialsForAuthoring,
  lockTurnsForAuthoring,
  resolveTransitionProposalGraph,
} from '@t3x-dev/storage';
import { publishWorkspaceAuthoringAction, workspaceAuthoringState } from './workspace-authoring';
import { resolveWorkspaceGenerationBasis } from './workspace-authoring-generation';
import { resolveWorkspaceYSchema } from './workspace-yschema';

/** Append a candidate to the editable Draft after structural/replay and freshness checks.
 * Semantic posture verification belongs to Review, not the authoring boundary.
 * Retain generation provenance so Review can still assess the exact generated changes.
 */
export async function publishWorkspaceGeneration(input: {
  db: AnyDB;
  projectId: string;
  workspaceId: string;
  transitionId: string;
  requestId: string;
  actor: DraftActionActor;
}) {
  const graph = await resolveTransitionProposalGraph(input.db, input.projectId, input.transitionId);
  if (graph.membership.workspaceId !== input.workspaceId || !graph.preparation)
    throw new DraftAuthoringConflictError('Candidate does not belong to this Workspace');
  const { candidate, draft } = await resolveWorkspaceGenerationBasis(
    input.db,
    input.projectId,
    input.workspaceId,
    JSON.parse(graph.preparation.canonicalJson)
  );
  const generation: DraftActionGeneration = {
    transitionId: input.transitionId,
    preparationDigest: graph.preparation.digest,
    preparation: candidate.generation,
    proposal: graph.proposal,
  };
  const command = {
    projectId: input.projectId,
    workspaceId: input.workspaceId,
    actionId: input.requestId,
    actor: {
      ...candidate.generation.generator,
      delegator: { kind: input.actor.kind, id: input.actor.id },
    },
    channel: 'assistant' as const,
    operations: candidate.operations,
    expectedRevision: candidate.compositionRevision,
    expectedWorkspaceRevision: candidate.workspaceRevision,
    expectedRefHead: candidate.basis.refHead,
    generation,
    reason: 'Apply generated changes to Draft',
  };
  // A lost response recovers the original result even after newer actions arrive.
  if (
    workspaceAuthoringState(draft.workspace_state!).ledger.actions.some(
      (action) => action.actionId === input.requestId
    )
  )
    return publishWorkspaceAuthoringAction(input.db, command);
  return publishWorkspaceAuthoringAction(input.db, {
    ...command,
    validate: async (tx) => {
      const prefix = `t3x://projects/${encodeURIComponent(input.projectId)}/`;
      const refs = candidate.generation.context.sources.map((resource) => {
        if (!resource.uri.startsWith(prefix))
          throw new DraftAuthoringConflictError('Source is outside the authorized project');
        const path = resource.uri.slice(prefix.length);
        const material = path.match(/^materials\/([^/]+)$/);
        if (material)
          return { kind: 'material' as const, id: decodeURIComponent(material[1]), resource };
        const turn = path.match(/^conversations\/([^/]+)\/turns\/([^/]+)$/);
        if (turn)
          return {
            kind: 'turn' as const,
            id: decodeURIComponent(turn[2]),
            conversationId: decodeURIComponent(turn[1]),
            resource,
          };
        throw new DraftAuthoringConflictError('Unknown source resource');
      });
      const materials = await lockMaterialsForAuthoring(
        tx,
        refs.filter((ref) => ref.kind === 'material').map((ref) => ref.id)
      );
      const turns = await lockTurnsForAuthoring(
        tx,
        refs.filter((ref) => ref.kind === 'turn').map((ref) => ref.id)
      );
      for (const ref of refs) {
        let text: string | undefined;
        if (ref.kind === 'material') {
          const source = materials.find((source) => source.id === ref.id);
          if (source?.project_id === input.projectId && !source.archived_at)
            text = source.content_text;
        } else {
          const turn = turns.find((turn) => turn.turnHash === ref.id);
          if (
            turn?.projectId === input.projectId &&
            turn.role === 'user' &&
            turn.conversationId === ref.conversationId
          )
            text = turn.content;
        }
        if (
          text === undefined ||
          `sha256:${createHash('sha256').update(text).digest('hex')}` !== ref.resource.digest
        )
          throw new DraftAuthoringConflictError('Source version changed since generation');
      }
      const schema = await resolveWorkspaceYSchema(draft.workspace_state!, tx, input.projectId);
      if (
        !schema.schema ||
        createYSchemaResourceDescriptor(candidate.generation.context.yschema.uri, schema.schema)
          .digest !== candidate.generation.context.yschema.digest
      )
        throw new DraftAuthoringConflictError('Schema version changed since generation');
    },
  });
}

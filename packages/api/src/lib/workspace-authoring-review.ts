import type { DraftActionActor } from '@t3x-dev/application';
import {
  compileProposalDraft,
  createHumanProposalDraft,
  createYSchemaContextDescriptor,
  createYSchemaResourceDescriptor,
  runRepositorySemanticYSchemaStatementProvider,
  runYSchemaRootStatementProvider,
  YSCHEMA_VALIDATION_PREDICATE_TYPE,
} from '@t3x-dev/core';
import {
  type AnyDB,
  DraftAuthoringConflictError,
  getTransitionProposalPreparation,
} from '@t3x-dev/storage';
import { createProposalGenerationPostureProvider } from './proposal-generation-posture-provider';
import { verifyTransition } from './transition-control-plane';
import { materializeTransitionProposal } from './transition-control-plane/materialize';
import {
  buildAuthoringEffect,
  buildAuthoringPreparation,
  workspaceAuthoringState,
} from './workspace-authoring';
import { resolveWorkspaceTransitionContext } from './workspace-transition';
import { resolveWorkspaceYSchema } from './workspace-yschema';
import { schemaRootKeyFromBinding } from './yschema-registry';

/** Freeze the complete authoring manifest; inspected action/card is deliberately not an input. */
export async function prepareWorkspaceAuthoringReview(input: {
  db: AnyDB;
  projectId: string;
  workspaceId: string;
  requestId: string;
  actor: DraftActionActor;
  expectedWorkspaceRevision: number;
  expectedRevision: number;
  expectedRefHead: string | null;
  reason?: string;
}) {
  const context = await resolveWorkspaceTransitionContext(input.db, {
    projectId: input.projectId,
    workspaceId: input.workspaceId,
    expectedRevision: input.expectedWorkspaceRevision,
  });
  const { ledger, basis } = workspaceAuthoringState(context.workspace);
  if (
    ledger.compositionRevision !== input.expectedRevision ||
    basis.refHead !== input.expectedRefHead
  )
    throw new DraftAuthoringConflictError('Draft changed; refresh before Review');
  const built = buildAuthoringEffect(ledger);
  const compiled = compileProposalDraft({
    draft: createHumanProposalDraft({ why: input.reason }),
    effect: built.effect,
    actor: input.actor,
  });
  if (!compiled.ok) throw new TypeError('Cannot compile complete Draft Review');
  const schema = await resolveWorkspaceYSchema(context.workspace, input.db, input.projectId);
  if (!schema.schema || !schema.canonicalName)
    throw new TypeError('A resolved Workspace schema is required for Review');
  const frozen = buildAuthoringPreparation(context.workspace);
  const membership = await materializeTransitionProposal({
    db: input.db,
    projectId: input.projectId,
    workspaceId: input.workspaceId,
    workspaceRevision: context.workspaceRevision,
    refName: basis.refName,
    refHead: basis.refHead,
    requestKind: 'structured_yops',
    requestId: input.requestId,
    requestFacts: JSON.parse(
      JSON.stringify({
        adapter: 'workspace_authoring_review',
        requester: input.actor,
        workspaceId: input.workspaceId,
        expectedRevision: input.expectedRevision,
        expectedWorkspaceRevision: input.expectedWorkspaceRevision,
        expectedRefHead: input.expectedRefHead,
        reason: input.reason,
      })
    ),
    preparationFacts: JSON.parse(JSON.stringify(frozen)),
    actor: input.actor,
    base: context.base,
    result: built.result,
    effect: built.effect,
    proposal: compiled.proposal,
  });
  const rootKey = schemaRootKeyFromBinding(
    Array.isArray(context.workspace.schemaBindings)
      ? context.workspace.schemaBindings[0]
      : undefined
  );
  const schemaValue = schema.schema;
  const issuer = { kind: 'service' as const, id: 'service:t3x-workspace-yschema' };
  const result = await verifyTransition({
    db: input.db,
    projectId: input.projectId,
    transitionId: membership.membership.transitionId,
    requestId: `review:${input.requestId}`,
    actor: input.actor,
    options: {
      nativeProviders: [
        createProposalGenerationPostureProvider(),
        {
          source: 'native:workspace-authoring-yschema/v1',
          issuer,
          predicateTypes: [YSCHEMA_VALIDATION_PREDICATE_TYPE],
          async verify(verification) {
            const options = {
              state: verification.result,
              schema: schemaValue,
              schemaResource: createYSchemaResourceDescriptor(
                `t3x://schemas/${encodeURIComponent(schema.canonicalName!)}/${schema.version ?? 'unversioned'}`,
                schemaValue
              ),
              context: {
                mode: 'bound' as const,
                resource: createYSchemaContextDescriptor(
                  `t3x://workspaces/${encodeURIComponent(input.workspaceId)}/revisions/${context.workspaceRevision}/validation`,
                  { rootKey }
                ),
              },
              environment: { mode: 'unspecified' as const },
              rootKey,
              actor: issuer,
              tool: { name: '@t3x-dev/yschema', version: '1' },
              run: verification.run,
            };
            const value = verification.result.value;
            const semantic =
              value !== null &&
              typeof value === 'object' &&
              !Array.isArray(value) &&
              value.domain === 't3x.dev/semantic-content';
            return {
              outcome: 'statement',
              statement: semantic
                ? runRepositorySemanticYSchemaStatementProvider(options)
                : runYSchemaRootStatementProvider(options),
            };
          },
        },
      ],
    },
  });
  return {
    view: result.view,
    authoring: {
      workspaceId: input.workspaceId,
      compositionRevision: ledger.compositionRevision,
      actionCount: ledger.actions.length,
      preparationDigest: (await getTransitionProposalPreparation(
        input.db,
        membership.membership.transitionId
      ))!.digest,
    },
    reused: membership.reused,
  };
}

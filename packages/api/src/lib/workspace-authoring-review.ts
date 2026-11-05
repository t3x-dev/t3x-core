import type { DraftActionActor } from '@t3x-dev/application';
import {
  compileProposalDraft,
  createHumanProposalDraft,
  createYSchemaContextDescriptor,
  createYSchemaResourceDescriptor,
  repositorySemanticYSchemaTree,
  runRepositorySemanticYSchemaStatementProvider,
  runYSchemaRootStatementProvider,
  runYSchemaStatementProvider,
  YSCHEMA_VALIDATION_PREDICATE_TYPE,
  yopsStateCodec,
} from '@t3x-dev/core';
import {
  type AnyDB,
  DraftAuthoringConflictError,
  getTransitionProposalPreparation,
} from '@t3x-dev/storage';
import type { ProtocolValue, State } from '@t3x-dev/transition';
import { normalizeYSchemaObject } from '@t3x-dev/yschema';
import { createProposalGenerationPostureProvider } from './proposal-generation-posture-provider';
import {
  type TransitionNativeStatementProvider,
  verifyTransition,
} from './transition-control-plane';
import { materializeTransitionProposal } from './transition-control-plane/materialize';
import {
  buildAuthoringEffect,
  buildAuthoringPreparation,
  workspaceAuthoringState,
} from './workspace-authoring';
import {
  buildWorkspaceReviewArtifacts,
  persistWorkspaceReviewArtifacts,
  reviewSnapshotCreatedAt,
} from './workspace-review-artifacts';
import { isSchemaOnlyWorkspaceReview } from './workspace-schema-content';
import {
  assertWorkspaceReviewHasChanges,
  buildWorkspaceSchemaReview,
  workspaceSchemaReviewResource,
} from './workspace-schema-review';
import { resolveWorkspaceTransitionContext, workspaceProvenance } from './workspace-transition';
import { resolveWorkspaceYSchema } from './workspace-yschema';
import { schemaRootKeyFromBinding } from './yschema-registry';

function validationTree(state: State, rootKey: string, semantic: boolean): ProtocolValue {
  if (semantic) return repositorySemanticYSchemaTree(state, rootKey) as ProtocolValue;
  const decoded = yopsStateCodec.decode(state.value);
  if (decoded === null || typeof decoded !== 'object' || Array.isArray(decoded)) return {};
  const root = Object.getOwnPropertyDescriptor(decoded, rootKey)?.value;
  return root !== null && typeof root === 'object' && !Array.isArray(root)
    ? (root as ProtocolValue)
    : {};
}

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
  const schema = await resolveWorkspaceYSchema(context.workspace, input.db, input.projectId);
  if (!schema.schema || !schema.canonicalName)
    throw new TypeError('A resolved Workspace schema is required for Review');
  const schemaReview = await buildWorkspaceSchemaReview(
    input.db,
    input.projectId,
    context.workspace
  );
  assertWorkspaceReviewHasChanges(context.base, built.result, schemaReview);
  const draft = createHumanProposalDraft({ why: input.reason });
  if (isSchemaOnlyWorkspaceReview(schemaReview)) {
    // Bind the exact Schema Review into the immutable Proposal/Commit closure,
    // without inventing a passing content-validation Statement for an empty project.
    draft.rationale = {
      mode: 'authored',
      value: input.reason ?? 'Establish the Schema before adding business content.',
      evidence: [
        {
          resource: await workspaceSchemaReviewResource(schemaReview),
          locator: { scheme: 'json-pointer', value: '' },
        },
      ],
    };
  }
  const compiled = compileProposalDraft({ draft, effect: built.effect, actor: input.actor });
  if (!compiled.ok) throw new TypeError('Cannot compile complete Draft Review');
  const frozen = { ...buildAuthoringPreparation(context.workspace), schemaReview };
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
  const schemaValue = normalizeYSchemaObject(schemaReview.draft.definition);
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
        ...(isSchemaOnlyWorkspaceReview(schemaReview)
          ? []
          : [
              {
                source: 'native:workspace-authoring-yschema/v1',
                issuer,
                predicateTypes: [YSCHEMA_VALIDATION_PREDICATE_TYPE],
                async verify(verification) {
                  const value = verification.result.value;
                  const semantic =
                    value !== null &&
                    typeof value === 'object' &&
                    !Array.isArray(value) &&
                    value.domain === 't3x.dev/semantic-content';
                  const provenanceByPath = await workspaceProvenance(
                    input.db,
                    input.projectId,
                    context.workspace,
                    validationTree(verification.result, rootKey, semantic)
                  );
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
                        { provenanceByPath, rootKey }
                      ),
                    },
                    environment: { mode: 'unspecified' as const },
                    provenanceByPath,
                    rootKey,
                    actor: issuer,
                    tool: { name: '@t3x-dev/yschema', version: '1' },
                    run: verification.run,
                  };
                  // Preparation treats a truly empty native document as an empty tree.
                  // Validate those exact bytes against all Schema rules as well. A nonempty
                  // document with a missing/wrong root must still fail root resolution.
                  const nativeValue = semantic
                    ? null
                    : yopsStateCodec.decode(verification.result.value);
                  const emptyDocument =
                    nativeValue !== null &&
                    typeof nativeValue === 'object' &&
                    !Array.isArray(nativeValue) &&
                    Object.keys(nativeValue).length === 0;
                  return {
                    outcome: 'statement',
                    statement: semantic
                      ? runRepositorySemanticYSchemaStatementProvider(options)
                      : emptyDocument
                        ? runYSchemaStatementProvider(options)
                        : runYSchemaRootStatementProvider(options),
                  };
                },
              } satisfies TransitionNativeStatementProvider,
            ]),
      ],
    },
  });
  if (result.view.precondition.policyDigest !== null) {
    const artifacts = buildWorkspaceReviewArtifacts({
      inspection: result.view,
      createdAt: reviewSnapshotCreatedAt(result.view),
    });
    await persistWorkspaceReviewArtifacts(input.db, artifacts);
  }
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
    schemaReview,
  };
}

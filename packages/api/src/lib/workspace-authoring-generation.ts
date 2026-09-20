import { createHash } from 'node:crypto';
import {
  currentComposition,
  type DraftActionLedger,
  type DraftYOp,
  DraftYOpSchema,
  draftLedgerAtRevision,
  publishDraftAction,
} from '@t3x-dev/application';
import {
  compileProposalDraft,
  createYOpsState,
  describeTransitionObject,
  type ProposalDraft,
  type ProposalGenerationPreparationV1,
  parseProposalGenerationPreparation,
} from '@t3x-dev/core';
import { type AnyDB, DraftAuthoringConflictError, findWorkspaceDraft } from '@t3x-dev/storage';
import { canonicalizeProtocolValue, type ProtocolValue } from '@t3x-dev/transition';
import {
  buildAuthoringEffect,
  type WorkspaceAuthoringBasis,
  workspaceAuthoringState,
} from './workspace-authoring';

export const WORKSPACE_GENERATION_PREPARATION_SCHEMA =
  't3x.application/workspace-generation-preparation/v1' as const;
export interface WorkspaceGenerationPreparation {
  schema: typeof WORKSPACE_GENERATION_PREPARATION_SCHEMA;
  version: 1;
  basis: WorkspaceAuthoringBasis;
  actionId: string;
  workingState: ReturnType<typeof createYOpsState>;
  compositionRevision: number;
  workspaceRevision: number;
  manifestDigest: string;
  generation: ProposalGenerationPreparationV1;
  operations: DraftYOp[];
  proposalDraft: ProposalDraft;
  bindings: ReturnType<typeof buildAuthoringEffect>['bindings'];
}
export function authoringManifestDigest(ledger: DraftActionLedger, basis: WorkspaceAuthoringBasis) {
  return `sha256:${createHash('sha256')
    .update(
      canonicalizeProtocolValue(
        JSON.parse(
          JSON.stringify({
            base: ledger.base,
            actions: ledger.actions,
            compositionRevision: ledger.compositionRevision,
            basis,
          })
        )
      )
    )
    .digest('hex')}`;
}
export function authoringModelContext(workspace: Record<string, unknown>) {
  const { ledger, basis } = workspaceAuthoringState(workspace);
  const manifestDigest = authoringManifestDigest(ledger, basis);
  return {
    compositionRevision: ledger.compositionRevision,
    manifest: {
      uri: `t3x://workspace-authoring/manifests/${manifestDigest.slice(7)}`,
      mediaType: 'application/vnd.t3x.authoring-manifest+json',
      digest: manifestDigest as `sha256:${string}`,
    },
    current: currentComposition(ledger),
    appliedActionCount: ledger.actions.length,
    recentActivity: ledger.actions.slice(-8).map((action) => ({
      actionId: action.actionId,
      sequence: action.sequence,
      actor: action.actor,
      channel: action.channel,
      reason: action.reason,
      publishedAt: action.publishedAt,
      beforeRevision: action.beforeRevision,
      afterRevision: action.afterRevision,
    })),
    historyPartial: ledger.actions.length > 8,
    instruction:
      'Propose incremental operations against current. Base is the immutable protocol replay basis. Do not repeat prior operations. Prior actions are applied state, not new source evidence.',
  };
}
export function buildWorkspaceGeneration(input: {
  workspace: Record<string, unknown>;
  workspaceRevision: number;
  actionId: string;
  operations: ProtocolValue[];
  generation: ProposalGenerationPreparationV1;
  proposalDraft: ProposalDraft;
}) {
  const { ledger, basis } = workspaceAuthoringState(input.workspace);
  const operations = input.operations.map(
    (operation) => DraftYOpSchema.parse(operation) as DraftYOp
  );
  const appended = publishDraftAction(ledger, {
    actionId: input.actionId,
    channel: 'assistant',
    actor: input.generation.generator,
    operations,
    expectedRevision: ledger.compositionRevision,
    publishedAt: input.generation.run.recordedAt,
  });
  if (appended.kind !== 'published')
    throw new DraftAuthoringConflictError(
      appended.kind === 'no_change'
        ? 'The requested changes are already present'
        : 'Generated operations cannot be composed against current Draft'
    );
  const built = buildAuthoringEffect(appended.ledger);
  const sourceMap = built.bindings.filter((binding) => binding.actionId === input.actionId);
  const proposalDraft = structuredClone(input.proposalDraft);
  proposalDraft.review.sourceBindings = proposalDraft.review.sourceBindings.map((binding) => ({
    ...binding,
    operationIndexes: binding.operationIndexes.flatMap(
      (index) =>
        sourceMap.find((item) => item.sourceOperationIndex === index)?.effectOperationIndexes ?? []
    ),
  }));
  const proposal = compileProposalDraft({
    draft: proposalDraft,
    effect: built.effect,
    actor: input.generation.generator,
  });
  if (!proposal.ok) throw new TypeError('Composed generation Proposal could not compile');
  const preparation: WorkspaceGenerationPreparation = {
    schema: WORKSPACE_GENERATION_PREPARATION_SCHEMA,
    version: 1,
    basis,
    actionId: input.actionId,
    workingState: createYOpsState(currentComposition(ledger)),
    compositionRevision: ledger.compositionRevision,
    workspaceRevision: input.workspaceRevision,
    manifestDigest: authoringManifestDigest(ledger, basis),
    generation: input.generation,
    operations,
    proposalDraft: input.proposalDraft,
    bindings: built.bindings,
  };
  return { ...built, proposal: proposal.proposal, preparation };
}
export async function resolveWorkspaceGenerationBasis(
  db: AnyDB,
  projectId: string,
  workspaceId: string,
  value: unknown
) {
  if (
    !value ||
    typeof value !== 'object' ||
    (value as WorkspaceGenerationPreparation).schema !== WORKSPACE_GENERATION_PREPARATION_SCHEMA
  )
    throw new TypeError('Invalid Workspace generation preparation');
  const candidate = value as WorkspaceGenerationPreparation;
  parseProposalGenerationPreparation(candidate.generation);
  const draft = await findWorkspaceDraft(db, projectId, workspaceId);
  if (!draft?.workspace_state)
    throw new DraftAuthoringConflictError('Generation workspace no longer exists');
  const current = workspaceAuthoringState(draft.workspace_state);
  const ledger = draftLedgerAtRevision(current.ledger, candidate.compositionRevision);
  if (
    authoringManifestDigest(ledger, current.basis) !== candidate.manifestDigest ||
    canonicalizeProtocolValue(JSON.parse(JSON.stringify(current.basis))) !==
      canonicalizeProtocolValue(JSON.parse(JSON.stringify(candidate.basis)))
  )
    throw new DraftAuthoringConflictError('Generation does not match the retained authoring basis');
  return { candidate, ledger, draft, base: createYOpsState(currentComposition(ledger)) };
}

export function authoringPreparationResource(
  value: ProtocolValue,
  projectId: string,
  transitionId: string
) {
  return {
    uri: `t3x://projects/${encodeURIComponent(projectId)}/transitions/${encodeURIComponent(transitionId)}/authoring-preparation`,
    mediaType: 'application/vnd.t3x.authoring-preparation+json',
    digest:
      `sha256:${createHash('sha256').update(canonicalizeProtocolValue(value)).digest('hex')}` as `sha256:${string}`,
  };
}

type VerificationContext = Parameters<
  import('./transition-control-plane').TransitionNativeStatementProvider['verify']
>[0];
export async function authoringGenerationChecks(context: VerificationContext) {
  const value = context.preparationFacts;
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  if (value.schema === WORKSPACE_GENERATION_PREPARATION_SCHEMA) {
    const { candidate, ledger, base } = await resolveWorkspaceGenerationBasis(
      context.db,
      context.projectId,
      context.workspaceId,
      value
    );
    const rebuilt = buildWorkspaceGeneration({
      workspace: { authoringLedger: ledger, authoringBasis: candidate.basis },
      workspaceRevision: candidate.workspaceRevision,
      actionId: candidate.actionId,
      operations: JSON.parse(JSON.stringify(candidate.operations)),
      generation: candidate.generation,
      proposalDraft: candidate.proposalDraft,
    });
    if (
      canonicalizeProtocolValue(JSON.parse(JSON.stringify(rebuilt.preparation))) !==
        canonicalizeProtocolValue(value) ||
      describeTransitionObject(rebuilt.effect).digest !==
        describeTransitionObject(context.effect).digest ||
      describeTransitionObject(rebuilt.proposal).digest !==
        describeTransitionObject(context.proposal).digest
    )
      throw new TypeError('Generated candidate does not match its pinned composition');
    return [
      {
        preparationFacts: JSON.parse(JSON.stringify(candidate.generation)) as ProtocolValue,
        operations: JSON.parse(JSON.stringify(candidate.operations)) as ProtocolValue[],
        base,
        result: context.result,
        proposal: context.proposal,
      },
    ];
  }
  if (value.schema !== 't3x.application/workspace-authoring-preparation/v1') return null;
  const { ledger } = workspaceAuthoringState({
    authoringLedger: value.ledger,
    authoringBasis: value.basis,
  });
  if (
    describeTransitionObject(buildAuthoringEffect(ledger).effect).digest !==
    describeTransitionObject(context.effect).digest
  )
    throw new TypeError('Authoring manifest does not describe the full Effect');
  return ledger.actions.flatMap((action) => {
    if (!action.generation) return [];
    const preparation = parseProposalGenerationPreparation(action.generation.preparation);
    if (preparation.operationCount !== action.operations.length)
      throw new TypeError('Generation operation provenance is incomplete');
    return [
      {
        preparationFacts: JSON.parse(JSON.stringify(preparation)) as ProtocolValue,
        operations: JSON.parse(JSON.stringify(action.operations)) as ProtocolValue[],
        base: createYOpsState(
          currentComposition(draftLedgerAtRevision(ledger, action.beforeRevision))
        ),
        result: createYOpsState(
          currentComposition(draftLedgerAtRevision(ledger, action.afterRevision))
        ),
        proposal: action.generation.proposal,
      },
    ];
  });
}

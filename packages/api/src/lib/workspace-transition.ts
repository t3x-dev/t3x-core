import type {
  ChangeProjectionV1,
  ReviewSnapshotV1,
  TransitionInspectionView,
} from '@t3x-dev/application';
import {
  buildReplayVerificationStatement,
  type CommitV2,
  compileProposalDraft,
  createAcceptancePolicyResource,
  createHumanProposalDraft,
  createRepositorySemanticState,
  createYOpsEffect,
  createYOpsReplacementEffect,
  createYOpsState,
  createYSchemaContextDescriptor,
  createYSchemaResourceDescriptor,
  decodeRepositorySemanticState,
  describeTransitionObject,
  type ProposalDraft,
  type ProposalStatement,
  parseAcceptancePolicy,
  projectTransitionView,
  repositorySemanticYSchemaTree,
  runRepositorySemanticYSchemaStatementProvider,
  type SemanticContent,
  type State,
  type StatementObservation,
  type TransitionViewV1,
  type TrustedDecisionFacts,
} from '@t3x-dev/core';
import {
  type AnyDB,
  ConflictError,
  findMaterialsByIds,
  findWorkspaceDraft,
  getTransitionRefHead,
  resolveTransitionProposalGraph,
  TransitionCommandConflictError,
  TransitionMembershipNotFoundError,
  type TransitionPolicyBinding,
  type TransitionProposalMembership,
  type TransitionRefHead,
  type TransitionStatementMembership,
} from '@t3x-dev/storage';
import type { CanonicalTimestamp } from '@t3x-dev/transition';
import type { ProvenanceIndex, YSchema, YSchemaRelation } from '@t3x-dev/yschema';
import {
  commitTransition,
  decideTransition,
  TransitionDecisionDeniedError,
  TransitionReviewStaleError,
} from './transition-control-plane/lifecycle';
import {
  canonicalTransitionRequest,
  materializeTransitionProposal,
  materializeTransitionStatement,
} from './transition-control-plane/materialize';
import {
  buildWorkspaceReviewArtifacts,
  persistWorkspaceReviewArtifacts,
  reviewSnapshotCreatedAt,
} from './workspace-review-artifacts';
import { resolveWorkspaceYSchema } from './workspace-yschema';
import { schemaRootKeyFromBinding } from './yschema-registry';

type ActorRef = ProposalStatement['actor'];
type ProtocolValue = State['value'];

const REPLAY_ACTOR = Object.freeze({
  kind: 'service' as const,
  id: 'service:t3x-workspace-replay',
});
const VALIDATION_ACTOR = Object.freeze({
  kind: 'service' as const,
  id: 'service:t3x-workspace-yschema',
});
const REPLAY_TOOL = Object.freeze({ name: '@t3x-dev/core/yops-replay', version: '1' });
const VALIDATION_TOOL = Object.freeze({
  name: '@t3x-dev/core/yschema-statement-provider',
  version: '1',
});
const UNSPECIFIED_ENVIRONMENT = Object.freeze({ mode: 'unspecified' as const });
const OBSERVATION_SCOPE = Object.freeze({
  completeness: 'complete' as const,
  sources: ['server:workspace-transition-review'],
});

const WORKSPACE_POLICY = createAcceptancePolicyResource({
  uri: 't3x://policies/workspace-human-review/v1',
  policy: parseAcceptancePolicy({
    schema: 't3x.dev/acceptance-policy/v1',
    version: 1,
    authorization: {
      decide: { actors: { mode: 'any' } },
      override: { actors: { mode: 'any' } },
      allowSelfApproval: true,
    },
    claims: {
      intent: {
        allowedModes: ['authored', 'inferred', 'stated', 'unspecified'],
        minimumEvidence: 0,
        humanConfirmation: 'not_required',
      },
      rationale: {
        allowedModes: ['authored', 'inferred', 'stated', 'unspecified'],
        minimumEvidence: 0,
        humanConfirmation: 'not_required',
      },
    },
    checks: {
      replay: {
        issuers: { mode: 'one_of', values: [REPLAY_ACTOR] },
        tools: { mode: 'one_of', values: [REPLAY_TOOL] },
        environments: { mode: 'one_of', values: [UNSPECIFIED_ENVIRONMENT] },
      },
      validation: {
        requirement: 'required',
        issuers: { mode: 'one_of', values: [VALIDATION_ACTOR] },
        tools: { mode: 'one_of', values: [VALIDATION_TOOL] },
        environments: { mode: 'one_of', values: [UNSPECIFIED_ENVIRONMENT] },
        profiles: { mode: 'any' },
        schemas: { mode: 'any' },
        contexts: { mode: 'any' },
      },
      humanConfirmation: { issuers: { mode: 'any' } },
    },
    override: {
      allowClaimFailures: false,
      allowFailedValidation: true,
      allowMissingHumanConfirmation: false,
      allowMissingValidation: false,
    },
  }),
});

export interface WorkspaceTransitionPrecondition {
  workspaceRevision: number;
  refHead: string | null;
  effectDigest: string;
  proposalDigest: string;
  statementDigests: string[];
  policyDigest: string;
}

export interface ReviewWorkspaceTransitionInput {
  projectId: string;
  workspaceId: string;
  content: SemanticContent;
  why?: string;
  expectedRevision?: number;
  actor: ActorRef;
  policyBinding?: TransitionPolicyBinding | null;
}

export interface ReviewWorkspaceTransitionResult {
  transitionId: string;
  transition: TransitionViewV1;
  precondition: WorkspaceTransitionPrecondition;
  reviewSnapshot: ReviewSnapshotV1;
  changeProjection: ChangeProjectionV1;
}

export interface BuildWorkspaceYOpsProposalInput {
  projectId: string;
  workspaceId: string;
  operations: ProtocolValue[];
  why?: string;
  expectedRevision?: number;
  actor: ActorRef;
}

export interface BuiltWorkspaceYOpsProposal {
  actor: ActorRef;
  base: State;
  effect: ReturnType<typeof createYOpsEffect>['effect'];
  proposal: ProposalStatement;
  refHead: string | null;
  refName: string;
  result: State;
  workspace: Record<string, unknown>;
  workspaceId: string;
  workspaceRevision: number;
  workspaceUpdatedAt: string;
}

export interface DecideWorkspaceTransitionInput {
  projectId: string;
  workspaceId: string;
  content?: SemanticContent;
  why?: string;
  expectedRevision?: number;
  actor: ActorRef;
  policyBinding?: TransitionPolicyBinding | null;
  transitionId?: string;
  outcome: 'accepted' | 'overridden' | 'rejected';
  decisionReason?: string;
  precondition: WorkspaceTransitionPrecondition;
  yopsLogIds?: readonly string[];
  workspaceCommitOverride?: {
    kind: 'schema_review';
    reason: string;
    blockers: readonly string[];
  };
}

export interface DecideWorkspaceTransitionResult extends ReviewWorkspaceTransitionResult {
  decisionDigest: string;
  commit?: CommitV2;
  workspace?: Record<string, unknown>;
}

export class WorkspaceTransitionNotFoundError extends Error {
  readonly code = 'NOT_FOUND';

  constructor(readonly workspaceId: string) {
    super(`Workspace ${workspaceId} was not found`);
    this.name = 'WorkspaceTransitionNotFoundError';
  }
}

export class WorkspaceTransitionLegacyHeadError extends Error {
  readonly code = 'LEGACY_HEAD_READ_ONLY';

  constructor(readonly head: string) {
    super('Non-transition heads are read-only until an explicit migration bridge is defined');
    this.name = 'WorkspaceTransitionLegacyHeadError';
  }
}

export class WorkspaceTransitionSchemaUnavailableError extends Error {
  readonly code = 'SCHEMA_UNAVAILABLE';

  constructor(
    readonly schemaName: string | null,
    readonly version?: string
  ) {
    super(
      schemaName === null
        ? 'Workspace Transition review requires one explicit YSchema binding'
        : `Bound YSchema ${schemaName}${version ? ` ${version}` : ''} is unavailable`
    );
    this.name = 'WorkspaceTransitionSchemaUnavailableError';
  }
}

export class WorkspaceTransitionReviewStaleError extends Error {
  readonly code = 'STALE_REVIEW';

  constructor() {
    super('Workspace Transition review facts changed; review the proposal again');
    this.name = 'WorkspaceTransitionReviewStaleError';
  }
}

export class WorkspaceTransitionDecisionDeniedError extends Error {
  readonly code = 'DECISION_NOT_PERMITTED';

  constructor(readonly failures: readonly { code: string; message: string }[]) {
    super('The requested Decision is not permitted by the current server policy');
    this.name = 'WorkspaceTransitionDecisionDeniedError';
  }
}

interface PreparedWorkspaceTransition
  extends Pick<ReviewWorkspaceTransitionResult, 'precondition' | 'transition'> {
  actor: ActorRef;
  base: State;
  content: SemanticContent;
  effect: ReturnType<typeof createYOpsEffect>['effect'];
  head: TransitionRefHead;
  observations: StatementObservation[];
  proposal: Extract<ReturnType<typeof compileProposalDraft>, { ok: true }>['proposal'];
  projectId: string;
  result: State;
  targetBranch: string;
  workspace: Record<string, unknown>;
  workspaceId: string;
}

interface MaterializedPreparedWorkspaceTransition {
  membership: TransitionProposalMembership;
  statements: TransitionStatementMembership[];
}

export interface ResolvedWorkspaceTransitionContext {
  base: State;
  head: TransitionRefHead;
  targetBranch: string;
  workspace: Record<string, unknown>;
  workspaceId: string;
  workspaceRevision: number;
  workspaceUpdatedAt: string;
}

export interface WorkspaceExtractionContext {
  baseline: SemanticContent;
  refHead: string | null;
  refName: string;
  workspace: Record<string, unknown>;
  workspaceRevision: number;
  workspaceUpdatedAt: string;
}

function asCanonicalTimestamp(value: string): CanonicalTimestamp {
  return new Date(value).toISOString() as CanonicalTimestamp;
}

function isMapping(value: ProtocolValue): value is Record<string, ProtocolValue> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

async function resolveWorkspaceSchema(
  workspace: Record<string, unknown>,
  db: AnyDB,
  projectId: string
): Promise<{
  canonicalName: string;
  rootKey: string;
  schema: YSchema;
}> {
  const bindings = Array.isArray(workspace.schemaBindings) ? workspace.schemaBindings : [];
  if (bindings.length !== 1) throw new WorkspaceTransitionSchemaUnavailableError(null);
  const binding = bindings[0];
  const { canonicalName, schema, version } = await resolveWorkspaceYSchema(
    workspace,
    db,
    projectId
  );
  if (canonicalName === null || schema === null) {
    throw new WorkspaceTransitionSchemaUnavailableError(canonicalName, version);
  }
  return { canonicalName, rootKey: schemaRootKeyFromBinding(binding), schema };
}

function protocolLeafPaths(value: ProtocolValue, prefix = ''): string[] {
  if (!isMapping(value)) return prefix ? [prefix] : [];
  return Object.entries(value).flatMap(([key, child]) =>
    protocolLeafPaths(child, prefix ? `${prefix}/${key}` : key)
  );
}

/** Bind YSchema provenance only to source materials re-resolved inside the project boundary. */
async function workspaceProvenance(
  db: AnyDB,
  projectId: string,
  workspace: Record<string, unknown>,
  validationTree: ProtocolValue
): Promise<ProvenanceIndex> {
  const sources = Array.isArray(workspace.sourceBundle) ? workspace.sourceBundle : [];
  const requested = sources.flatMap((source) => {
    if (source === null || typeof source !== 'object' || Array.isArray(source)) return [];
    const record = source as Record<string, unknown>;
    return typeof record.materialId === 'string' && record.materialId.trim()
      ? [{ materialId: record.materialId.trim(), claimedHash: record.contentHash }]
      : [];
  });
  const materials = await findMaterialsByIds(db, [
    ...new Set(requested.map((source) => source.materialId)),
  ]);
  const materialById = new Map(materials.map((material) => [material.id, material]));
  const resolvedRefs = requested.flatMap((source) => {
    const material = materialById.get(source.materialId);
    if (
      material?.project_id !== projectId ||
      (typeof source.claimedHash === 'string' && source.claimedHash !== material.content_hash)
    ) {
      return [];
    }
    return [
      {
        origin: 'user_evidence' as const,
        sourceId: `material:${material.id}@${material.content_hash}`,
      },
    ];
  });
  const refs = [...new Map(resolvedRefs.map((ref) => [ref.sourceId, ref])).values()].sort(
    (left, right) => (left.sourceId < right.sourceId ? -1 : left.sourceId > right.sourceId ? 1 : 0)
  );
  if (refs.length === 0) return {};
  return Object.fromEntries(
    protocolLeafPaths(validationTree).map((path) => [path, refs.map((ref) => ({ ...ref }))])
  );
}

function samePrecondition(
  left: WorkspaceTransitionPrecondition,
  right: WorkspaceTransitionPrecondition
): boolean {
  return (
    left.workspaceRevision === right.workspaceRevision &&
    left.refHead === right.refHead &&
    left.effectDigest === right.effectDigest &&
    left.proposalDigest === right.proposalDigest &&
    left.policyDigest === right.policyDigest &&
    left.statementDigests.length === right.statementDigests.length &&
    left.statementDigests.every((digest, index) => digest === right.statementDigests[index])
  );
}

export async function resolveWorkspaceTransitionContext(
  db: AnyDB,
  input: { projectId: string; workspaceId: string; expectedRevision?: number }
): Promise<ResolvedWorkspaceTransitionContext> {
  const draft = await findWorkspaceDraft(db, input.projectId, input.workspaceId);
  if (!draft?.workspace_state) throw new WorkspaceTransitionNotFoundError(input.workspaceId);
  if (input.expectedRevision !== undefined && draft.revision !== input.expectedRevision) {
    throw new ConflictError(draft.id, input.expectedRevision);
  }
  const workspace = draft.workspace_state;
  const targetBranch =
    typeof workspace.targetBranch === 'string' && workspace.targetBranch.trim()
      ? workspace.targetBranch
      : 'main';
  const head = await getTransitionRefHead(db, {
    projectId: input.projectId,
    refName: targetBranch,
  });
  return {
    base: head.format === 'empty' ? createYOpsState({}) : head.state,
    head,
    targetBranch,
    workspace,
    workspaceId: input.workspaceId,
    workspaceRevision: draft.revision,
    workspaceUpdatedAt: draft.updated_at,
  };
}

/** Resolve the server-owned Repository baseline used by Workspace extraction proposals. */
export async function resolveWorkspaceExtractionContext(
  db: AnyDB,
  input: { projectId: string; workspaceId: string; expectedRevision?: number }
): Promise<WorkspaceExtractionContext> {
  const context = await resolveWorkspaceTransitionContext(db, input);
  return {
    baseline:
      context.head.format === 'empty'
        ? { trees: [], relations: [] }
        : decodeRepositorySemanticState(context.base),
    refHead: context.head.head,
    refName: context.targetBranch,
    workspace: context.workspace,
    workspaceRevision: context.workspaceRevision,
    workspaceUpdatedAt: context.workspaceUpdatedAt,
  };
}

export function buildWorkspaceYOpsProposalFromContext(
  context: ResolvedWorkspaceTransitionContext,
  input: {
    operations: ProtocolValue[];
    why?: string;
    actor: ActorRef;
    proposalDraft?: ProposalDraft;
  }
): BuiltWorkspaceYOpsProposal {
  const { effect, result } = createYOpsEffect({
    base: context.base,
    operations: input.operations,
    expectedBase: describeTransitionObject(context.base),
  });
  const compiled = compileProposalDraft({
    draft: input.proposalDraft ?? createHumanProposalDraft({ why: input.why?.trim() || undefined }),
    effect,
    actor: input.actor,
  });
  if (!compiled.ok) {
    throw new TypeError(
      `Workspace Proposal compilation failed: ${JSON.stringify(compiled.issues)}`
    );
  }
  return {
    actor: input.actor,
    base: context.base,
    effect,
    proposal: compiled.proposal,
    refHead: context.head.head,
    refName: context.targetBranch,
    result,
    workspace: context.workspace,
    workspaceId: context.workspaceId,
    workspaceRevision: context.workspaceRevision,
    workspaceUpdatedAt: context.workspaceUpdatedAt,
  };
}

/** Shared, server-side builder for human review and machine proposals. */
export async function buildWorkspaceYOpsProposal(
  db: AnyDB,
  input: BuildWorkspaceYOpsProposalInput
): Promise<BuiltWorkspaceYOpsProposal> {
  const context = await resolveWorkspaceTransitionContext(db, input);
  return buildWorkspaceYOpsProposalFromContext(context, input);
}

async function prepareWorkspaceTransition(
  db: AnyDB,
  input: ReviewWorkspaceTransitionInput
): Promise<PreparedWorkspaceTransition> {
  if (!Array.isArray(input.content.trees) || !Array.isArray(input.content.relations)) {
    throw new TypeError('Workspace Transition content requires trees and relations arrays');
  }
  const context = await resolveWorkspaceTransitionContext(db, input);
  const base = context.base;
  const target = createRepositorySemanticState(input.content);
  const { effect, result } = createYOpsReplacementEffect({
    base,
    target,
    expectedBase: describeTransitionObject(base),
  });
  const compiled = compileProposalDraft({
    draft: createHumanProposalDraft({ why: input.why?.trim() || undefined }),
    effect,
    actor: input.actor,
  });
  if (!compiled.ok) {
    throw new TypeError(
      `Workspace Proposal compilation failed: ${JSON.stringify(compiled.issues)}`
    );
  }
  const proposal = compiled.proposal;

  const { canonicalName, rootKey, schema } = await resolveWorkspaceSchema(
    context.workspace,
    db,
    input.projectId
  );
  const recordedAt = asCanonicalTimestamp(context.workspaceUpdatedAt);
  const schemaResource = createYSchemaResourceDescriptor(
    `t3x://schemas/${canonicalName}/${schema.version}`,
    schema
  );
  const relations = input.content.relations as YSchemaRelation[];
  const provenanceByPath = await workspaceProvenance(
    db,
    input.projectId,
    context.workspace,
    repositorySemanticYSchemaTree(result, rootKey) as ProtocolValue
  );
  const contextResource = createYSchemaContextDescriptor(
    `t3x://projects/${encodeURIComponent(input.projectId)}/workspaces/${encodeURIComponent(input.workspaceId)}/revisions/${context.workspaceRevision}/yschema-context`,
    { relations, provenanceByPath, rootKey }
  );
  const validation = runRepositorySemanticYSchemaStatementProvider({
    state: result,
    rootKey,
    schema,
    schemaResource,
    context: { mode: 'bound', resource: contextResource },
    environment: UNSPECIFIED_ENVIRONMENT,
    relations,
    provenanceByPath,
    actor: VALIDATION_ACTOR,
    tool: VALIDATION_TOOL,
    run: {
      id: `workspace:${input.workspaceId}:revision:${context.workspaceRevision}:yschema`,
      recordedAt,
    },
  });
  const replay = buildReplayVerificationStatement({
    effect,
    actor: REPLAY_ACTOR,
    predicate: {
      outcome: 'verified',
      result: effect.result,
      tool: REPLAY_TOOL,
      run: {
        id: `workspace:${input.workspaceId}:revision:${context.workspaceRevision}:replay`,
        recordedAt,
      },
      environment: UNSPECIFIED_ENVIRONMENT,
    },
  });
  const observations: StatementObservation[] = [
    { statement: replay, issuerContext: { actor: REPLAY_ACTOR } },
    { statement: validation, issuerContext: { actor: VALIDATION_ACTOR } },
  ];
  const statementDigests = observations
    .map((observation) => describeTransitionObject(observation.statement).digest)
    .sort();
  const policyBinding = input.policyBinding ?? WORKSPACE_POLICY;
  const precondition: WorkspaceTransitionPrecondition = {
    workspaceRevision: context.workspaceRevision,
    refHead: context.head.head,
    effectDigest: describeTransitionObject(effect).digest,
    proposalDigest: describeTransitionObject(proposal).digest,
    statementDigests,
    policyDigest: policyBinding.resource.digest,
  };
  const transition = projectTransitionView({
    mode: 'transition',
    effect,
    proposal,
    observations,
    observationScope: OBSERVATION_SCOPE,
    objectIntegrity: 'verified',
    capabilityContext: {
      actorContext: { actor: input.actor },
      policy: policyBinding.policy,
      policyResource: policyBinding.resource,
    },
  });
  return {
    actor: input.actor,
    base,
    content: input.content,
    effect,
    head: context.head,
    observations,
    precondition,
    proposal,
    projectId: input.projectId,
    result,
    targetBranch: context.targetBranch,
    transition,
    workspace: context.workspace,
    workspaceId: input.workspaceId,
  };
}

export async function reviewWorkspaceTransition(
  db: AnyDB,
  input: ReviewWorkspaceTransitionInput
): Promise<ReviewWorkspaceTransitionResult> {
  const prepared = await prepareWorkspaceTransition(db, input);
  const materialized = await materializePreparedWorkspaceTransition(db, prepared);
  const inspection = materializedPreparedInspection({ materialized, prepared });
  const artifacts = buildWorkspaceReviewArtifacts({
    inspection,
    createdAt: materialized.membership.createdAt,
  });
  await persistWorkspaceReviewArtifacts(db, artifacts);
  return {
    transitionId: materialized.membership.transitionId,
    transition: prepared.transition,
    precondition: prepared.precondition,
    ...artifacts,
  };
}

async function materializePreparedWorkspaceTransition(
  db: AnyDB,
  prepared: PreparedWorkspaceTransition
): Promise<MaterializedPreparedWorkspaceTransition> {
  const proposalDigest = describeTransitionObject(prepared.proposal).digest;
  const requestId = [
    'compat:workspace-transition-review',
    prepared.workspaceId,
    prepared.precondition.workspaceRevision,
    proposalDigest,
  ].join(':');
  const created = await materializeTransitionProposal({
    db,
    projectId: prepared.projectId,
    workspaceId: prepared.workspaceId,
    workspaceRevision: prepared.precondition.workspaceRevision,
    refName: prepared.targetBranch,
    refHead: prepared.precondition.refHead,
    requestKind: 'structured_yops',
    requestFacts: {
      adapter: 'workspace_transition_review',
      workspace_id: prepared.workspaceId,
      workspace_revision: prepared.precondition.workspaceRevision,
      ref_name: prepared.targetBranch,
      ref_head: prepared.precondition.refHead,
      effect_digest: prepared.precondition.effectDigest,
      proposal_digest: proposalDigest,
    },
    requestId,
    actor: prepared.actor,
    base: prepared.base,
    result: prepared.result,
    effect: prepared.effect,
    proposal: prepared.proposal,
  });
  const statementDigests = prepared.observations.map(
    (observation) => describeTransitionObject(observation.statement).digest
  );
  const statementRequestId = `${requestId}:verify`;
  const requestFacts: ProtocolValue = {
    operation: 'workspace_transition_review_verify',
    effect_digest: prepared.precondition.effectDigest,
    statement_digests: [...statementDigests].sort(),
  };
  const durableObservations = [
    { observation: prepared.observations[0]!, source: 'server:workspace-replay' },
    { observation: prepared.observations[1]!, source: 'server:workspace-yschema' },
  ] as const;
  const statements: TransitionStatementMembership[] = [];
  for (const { observation, source } of durableObservations) {
    const persisted = await materializeTransitionStatement({
      db,
      projectId: created.membership.projectId,
      transitionId: created.membership.transitionId,
      statement: observation.statement,
      source,
      issuer: observation.issuerContext.actor,
      requestId: statementRequestId,
      requestFacts,
    });
    statements.push(persisted.membership);
  }
  return { membership: created.membership, statements };
}

function compatibilityRequestId(action: 'decide' | 'commit', facts: ProtocolValue): string {
  const digest = canonicalTransitionRequest(facts).digest.slice('sha256:'.length);
  return `workspace-transition:${action}:${digest}`;
}

function canonicalPrecondition(precondition: WorkspaceTransitionPrecondition, refName: string) {
  return {
    workspaceRevision: precondition.workspaceRevision,
    refName,
    refHead: precondition.refHead,
    effectDigest: precondition.effectDigest,
    proposalDigest: precondition.proposalDigest,
    statementDigests: [...precondition.statementDigests],
    policyDigest: precondition.policyDigest,
  };
}

function materializedPreparedInspection(input: {
  materialized: MaterializedPreparedWorkspaceTransition;
  prepared: PreparedWorkspaceTransition;
  transition?: TransitionViewV1;
}): TransitionInspectionView {
  const membership = input.materialized.membership;
  return {
    transitionId: membership.transitionId,
    projectId: membership.projectId,
    workspaceId: membership.workspaceId,
    requestKind: membership.requestKind,
    requestId: membership.requestId,
    createdAt: membership.createdAt,
    precondition: {
      workspaceRevision: input.prepared.precondition.workspaceRevision,
      refName: membership.refName,
      refHead: input.prepared.precondition.refHead,
      effectDigest: input.prepared.precondition.effectDigest,
      proposalDigest: input.prepared.precondition.proposalDigest,
      statementDigests: [...input.prepared.precondition.statementDigests],
      policyDigest: input.prepared.precondition.policyDigest,
    },
    transition: input.transition ?? input.prepared.transition,
    statements: input.materialized.statements.map((statement) => ({
      digest: statement.statementDigest,
      source: statement.source,
      issuer: statement.issuer,
      requestId: statement.requestId,
      createdAt: statement.createdAt,
    })),
  };
}

function inspectionWithTransition(
  inspection: TransitionInspectionView,
  transition: TransitionViewV1
): TransitionInspectionView {
  return { ...inspection, transition };
}

function inspectionWithWorkspacePrecondition(
  inspection: TransitionInspectionView,
  precondition: ReturnType<typeof canonicalPrecondition>
): TransitionInspectionView {
  return {
    ...inspection,
    precondition: {
      workspaceRevision: precondition.workspaceRevision,
      refName: precondition.refName,
      refHead: precondition.refHead,
      effectDigest: precondition.effectDigest,
      proposalDigest: precondition.proposalDigest,
      statementDigests: [...precondition.statementDigests],
      policyDigest: precondition.policyDigest,
    },
  };
}

export async function decideWorkspaceTransition(
  db: AnyDB,
  input: DecideWorkspaceTransitionInput
): Promise<DecideWorkspaceTransitionResult> {
  try {
    const policyBinding = input.policyBinding ?? WORKSPACE_POLICY;
    let transitionId = input.transitionId;
    if (transitionId === undefined) {
      if (input.content === undefined) {
        throw new TypeError('Workspace Transition Decision requires content without transition_id');
      }
      const prepared = await prepareWorkspaceTransition(db, {
        ...input,
        content: input.content,
        expectedRevision: input.precondition.workspaceRevision,
      });
      if (!samePrecondition(input.precondition, prepared.precondition)) {
        throw new WorkspaceTransitionReviewStaleError();
      }
      const materialized = await materializePreparedWorkspaceTransition(db, prepared);
      transitionId = materialized.membership.transitionId;
    }

    const graph = await resolveTransitionProposalGraph(db, input.projectId, transitionId);
    let requestFacts: unknown;
    try {
      requestFacts = JSON.parse(graph.membership.requestCanonicalJson);
    } catch {
      throw new WorkspaceTransitionReviewStaleError();
    }
    if (
      graph.membership.workspaceId !== input.workspaceId ||
      graph.membership.requestKind !== 'structured_yops' ||
      requestFacts === null ||
      typeof requestFacts !== 'object' ||
      Array.isArray(requestFacts) ||
      !('adapter' in requestFacts) ||
      requestFacts.adapter !== 'workspace_transition_review'
    ) {
      throw new WorkspaceTransitionReviewStaleError();
    }
    const precondition = canonicalPrecondition(input.precondition, graph.membership.refName);
    const decisionFacts: ProtocolValue = {
      adapter: 'workspace_transition',
      operation: 'decide',
      transition_id: transitionId,
      workspace_id: input.workspaceId,
      outcome: input.outcome,
      ...(input.decisionReason === undefined
        ? {}
        : { decision_reason: input.decisionReason.trim() }),
      precondition: {
        workspace_revision: precondition.workspaceRevision,
        ref_name: precondition.refName,
        ref_head: precondition.refHead,
        effect_digest: precondition.effectDigest,
        proposal_digest: precondition.proposalDigest,
        statement_digests: [...precondition.statementDigests],
        policy_digest: precondition.policyDigest,
      },
    };
    const decided = await decideTransition({
      db,
      projectId: input.projectId,
      transitionId,
      actor: input.actor,
      requestId: compatibilityRequestId('decide', decisionFacts),
      outcome: input.outcome,
      ...(input.decisionReason === undefined ? {} : { rationale: input.decisionReason }),
      precondition,
      authoritySelection: {
        policyDigest: policyBinding.resource.digest,
        authority: {
          async resolve() {
            return {
              actorContext: { actor: input.actor },
              observationScope: OBSERVATION_SCOPE,
              policy: policyBinding.policy,
              policyResource: policyBinding.resource,
              statements: graph.observations.map((observation) => ({
                statement: observation.statement,
                issuerContext: observation.issuerContext,
              })) as TrustedDecisionFacts['statements'],
            };
          },
        },
      },
    });
    const decidedInspection = inspectionWithWorkspacePrecondition(decided.view, precondition);
    if (input.outcome === 'rejected') {
      const artifacts = buildWorkspaceReviewArtifacts({
        inspection: decidedInspection,
        createdAt: reviewSnapshotCreatedAt(decidedInspection),
      });
      await persistWorkspaceReviewArtifacts(db, artifacts);
      return {
        transitionId,
        transition: decidedInspection.transition,
        precondition: input.precondition,
        decisionDigest: decided.decisionDigest,
        ...artifacts,
      };
    }

    const projectionFacts: ProtocolValue = {
      adapter: 'workspace_transition',
      workspace_id: input.workspaceId,
      yops_log_ids: [...(input.yopsLogIds ?? [])],
      ...(input.workspaceCommitOverride === undefined
        ? {}
        : {
            commit_override: {
              kind: input.workspaceCommitOverride.kind,
              reason: input.workspaceCommitOverride.reason,
              blockers: [...input.workspaceCommitOverride.blockers],
            },
          }),
    };
    const commitFacts: ProtocolValue = {
      adapter: 'workspace_transition',
      operation: 'commit',
      transition_id: transitionId,
      decision_digest: decided.decisionDigest,
      expected_head: input.precondition.refHead,
      workspace_projection: projectionFacts,
    };
    const committed = await commitTransition({
      db,
      projectId: input.projectId,
      transitionId,
      actor: input.actor,
      requestId: compatibilityRequestId('commit', commitFacts),
      decisionDigest: decided.decisionDigest,
      expectedHead: input.precondition.refHead,
      workspaceProjection: {
        requestFacts: projectionFacts,
        ...(input.yopsLogIds === undefined ? {} : { yopsLogIds: input.yopsLogIds }),
        apply({ workspace, committedAt }) {
          return {
            ...workspace,
            ...(input.workspaceCommitOverride === undefined
              ? {}
              : {
                  commitOverride: {
                    ...input.workspaceCommitOverride,
                    blockers: [...input.workspaceCommitOverride.blockers],
                    confirmedAt: committedAt,
                  },
                }),
          };
        },
      },
    });
    if (committed.workspace === undefined) {
      throw new WorkspaceTransitionReviewStaleError();
    }
    const committedInspection = inspectionWithTransition(decidedInspection, committed.view);
    const artifacts = buildWorkspaceReviewArtifacts({
      inspection: committedInspection,
      createdAt: reviewSnapshotCreatedAt(committedInspection),
    });
    await persistWorkspaceReviewArtifacts(db, artifacts);
    return {
      transitionId,
      transition: committed.view,
      precondition: input.precondition,
      decisionDigest: decided.decisionDigest,
      commit: committed.commit,
      workspace: committed.workspace,
      ...artifacts,
    };
  } catch (error) {
    if (error instanceof TransitionDecisionDeniedError) {
      throw new WorkspaceTransitionDecisionDeniedError(error.failures);
    }
    if (
      error instanceof TransitionReviewStaleError ||
      error instanceof TransitionCommandConflictError ||
      error instanceof TransitionMembershipNotFoundError
    ) {
      throw new WorkspaceTransitionReviewStaleError();
    }
    throw error;
  }
}

import {
  authorizeDecisionForRepository,
  buildReplayVerificationStatement,
  type CommitV2,
  compileProposalDraft,
  createAcceptancePolicyResource,
  createCommitV2,
  createHumanProposalDraft,
  createRepositorySemanticState,
  createYOpsEffect,
  createYOpsReplacementEffect,
  createYOpsState,
  createYSchemaContextDescriptor,
  createYSchemaResourceDescriptor,
  decodeRepositorySemanticState,
  describeCommitV2,
  describeTransitionObject,
  InMemoryTransitionObjectResolver,
  type ProposalStatement,
  type ProtocolObject,
  parseAcceptancePolicy,
  projectTransitionView,
  type RepositoryDecisionAuthority,
  repositorySemanticYSchemaTree,
  runRepositorySemanticYSchemaStatementProvider,
  type SemanticContent,
  type State,
  type StatementObservation,
  type TransitionViewV1,
} from '@t3x-dev/core';
import {
  type AnyDB,
  ConflictError,
  createTransitionCommit,
  findMaterialsByIds,
  findWorkspaceDraft,
  getTransitionRefHead,
  getTransitionViewForCommit,
  recordRepositoryDecision,
  recordRepositoryDecisionAuthorization,
  type TransitionRefHead,
  upsertWorkspaceDraft,
} from '@t3x-dev/storage';
import type { ProvenanceIndex, YSchema, YSchemaRelation } from '@t3x-dev/yschema';
import {
  materializeTransitionProposal,
  materializeTransitionStatement,
} from './transition-control-plane/materialize';
import {
  canonicalSchemaNameFromBinding,
  resolveBuiltInYSchema,
  schemaRootKeyFromBinding,
  schemaVersionFromBinding,
} from './yschema-registry';

type ActorRef = ProposalStatement['actor'];
type CanonicalTimestamp = Parameters<typeof authorizeDecisionForRepository>[0]['decidedAt'];
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
  actor: ActorRef & { kind: 'human' };
}

export interface ReviewWorkspaceTransitionResult {
  transitionId: string;
  transition: TransitionViewV1;
  precondition: WorkspaceTransitionPrecondition;
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

export interface DecideWorkspaceTransitionInput extends ReviewWorkspaceTransitionInput {
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
        ? 'Workspace Transition review requires one explicit built-in YSchema binding'
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
  extends Omit<ReviewWorkspaceTransitionResult, 'transitionId'> {
  actor: ActorRef & { kind: 'human' };
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

interface ResolvedWorkspaceTransitionContext {
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

function resolveWorkspaceSchema(workspace: Record<string, unknown>): {
  canonicalName: string;
  rootKey: string;
  schema: YSchema;
} {
  const bindings = Array.isArray(workspace.schemaBindings) ? workspace.schemaBindings : [];
  if (bindings.length !== 1) throw new WorkspaceTransitionSchemaUnavailableError(null);
  const binding = bindings[0];
  const canonicalName = canonicalSchemaNameFromBinding(binding);
  const version = schemaVersionFromBinding(binding);
  const schema = canonicalName ? resolveBuiltInYSchema(canonicalName, version) : null;
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

function decisionRationale(
  input: DecideWorkspaceTransitionInput
): Parameters<typeof authorizeDecisionForRepository>[0]['rationale'] {
  const reason = input.decisionReason?.trim();
  if (input.outcome === 'overridden' && !reason) {
    throw new TypeError('Override requires an explicit authored Decision reason');
  }
  return reason ? { mode: 'authored', value: reason, evidence: [] } : { mode: 'unspecified' };
}

async function resolveWorkspaceTransitionContext(
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

function buildWorkspaceYOpsProposalFromContext(
  context: ResolvedWorkspaceTransitionContext,
  input: { operations: ProtocolValue[]; why?: string; actor: ActorRef }
): BuiltWorkspaceYOpsProposal {
  const { effect, result } = createYOpsEffect({
    base: context.base,
    operations: input.operations,
    expectedBase: describeTransitionObject(context.base),
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

  const { canonicalName, rootKey, schema } = resolveWorkspaceSchema(context.workspace);
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
  const precondition: WorkspaceTransitionPrecondition = {
    workspaceRevision: context.workspaceRevision,
    refHead: context.head.head,
    effectDigest: describeTransitionObject(effect).digest,
    proposalDigest: describeTransitionObject(proposal).digest,
    statementDigests,
    policyDigest: WORKSPACE_POLICY.resource.digest,
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
      policy: WORKSPACE_POLICY.policy,
      policyResource: WORKSPACE_POLICY.resource,
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
  const transitionId = await materializePreparedWorkspaceTransition(db, prepared);
  return { transitionId, transition: prepared.transition, precondition: prepared.precondition };
}

async function materializePreparedWorkspaceTransition(
  db: AnyDB,
  prepared: PreparedWorkspaceTransition
): Promise<string> {
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
  for (const { observation, source } of durableObservations) {
    await materializeTransitionStatement({
      db,
      projectId: created.membership.projectId,
      transitionId: created.membership.transitionId,
      statement: observation.statement,
      source,
      issuer: observation.issuerContext.actor,
      requestId: statementRequestId,
      requestFacts,
    });
  }
  return created.membership.transitionId;
}

function authorityFor(prepared: PreparedWorkspaceTransition): RepositoryDecisionAuthority {
  return {
    async resolve() {
      return {
        actorContext: { actor: prepared.actor },
        observationScope: OBSERVATION_SCOPE,
        policy: WORKSPACE_POLICY.policy,
        policyResource: WORKSPACE_POLICY.resource,
        statements: prepared.observations,
      };
    },
  };
}

type TxRunner = { transaction: <T>(fn: (tx: unknown) => Promise<T>) => Promise<T> };

export async function decideWorkspaceTransition(
  db: AnyDB,
  input: DecideWorkspaceTransitionInput
): Promise<DecideWorkspaceTransitionResult> {
  const prepared = await prepareWorkspaceTransition(db, {
    ...input,
    expectedRevision: input.precondition.workspaceRevision,
  });
  if (!samePrecondition(input.precondition, prepared.precondition)) {
    throw new WorkspaceTransitionReviewStaleError();
  }
  const transitionId = await materializePreparedWorkspaceTransition(db, prepared);
  if (input.transitionId !== undefined && input.transitionId !== transitionId) {
    throw new WorkspaceTransitionReviewStaleError();
  }

  const decidedAt = new Date().toISOString() as CanonicalTimestamp;
  const issued = await authorizeDecisionForRepository({
    projectId: input.projectId,
    refName: prepared.targetBranch,
    proposal: prepared.proposal,
    effect: prepared.effect,
    outcome: input.outcome,
    rationale: decisionRationale(input),
    decidedAt,
    authority: authorityFor(prepared),
  });
  if (!issued.ok) {
    throw new WorkspaceTransitionDecisionDeniedError(issued.failures);
  }

  const decisionDigest = describeTransitionObject(issued.decision).digest;
  if (issued.authorization === null) {
    await recordRepositoryDecision(db, issued.record);
    return {
      transitionId,
      transition: projectTransitionView({
        mode: 'transition',
        effect: prepared.effect,
        proposal: prepared.proposal,
        observations: prepared.observations,
        observationScope: OBSERVATION_SCOPE,
        objectIntegrity: 'verified',
        decision: issued.decision,
      }),
      precondition: prepared.precondition,
      decisionDigest,
    };
  }

  // Record authorization before branch CAS. A stale writer remains auditable,
  // but it can never create a CommitV2 or advance the ref.
  await recordRepositoryDecisionAuthorization(db, issued.authorization);
  const parentObjects = prepared.head.format === 'transition_v2' ? [prepared.head.commit] : [];
  const objects: ProtocolObject[] = [
    prepared.base,
    prepared.result,
    ...issued.authorization.objects,
    ...parentObjects,
  ];
  const parents =
    prepared.head.format === 'transition_v2' ? [describeCommitV2(prepared.head.commit)] : [];
  const commit = await createCommitV2({
    parents,
    decision: issued.decision,
    resolver: new InMemoryTransitionObjectResolver(objects),
  });

  const commitAndWorkspace = async (tx: AnyDB) => {
    const created = await createTransitionCommit(tx, {
      projectId: input.projectId,
      refName: prepared.targetBranch,
      expectedHead: prepared.precondition.refHead,
      commit,
      objects,
      yopsLogIds: input.yopsLogIds,
    });
    const committedWorkspace = {
      ...prepared.workspace,
      id: input.workspaceId,
      projectId: input.projectId,
      lastCommitHash: created.digest,
      status: 'committed',
      updatedAt: decidedAt,
      ...(input.workspaceCommitOverride
        ? {
            commitOverride: {
              ...input.workspaceCommitOverride,
              blockers: [...input.workspaceCommitOverride.blockers],
              confirmedAt: decidedAt,
            },
          }
        : {}),
    };
    const draft = await upsertWorkspaceDraft(
      tx,
      {
        project_id: input.projectId,
        workspace_id: input.workspaceId,
        title:
          typeof prepared.workspace.title === 'string' && prepared.workspace.title.trim()
            ? prepared.workspace.title
            : input.workspaceId,
        parent_commit_hash: prepared.precondition.refHead,
        target_branch: prepared.targetBranch,
        workspace_state: committedWorkspace,
      },
      prepared.precondition.workspaceRevision
    );
    return { created, draft };
  };
  const runner = db as unknown as Partial<TxRunner>;
  const committed =
    typeof runner.transaction === 'function'
      ? await runner.transaction((tx) => commitAndWorkspace(tx as AnyDB))
      : await commitAndWorkspace(db);
  const transition = await getTransitionViewForCommit(db, {
    projectId: input.projectId,
    refName: prepared.targetBranch,
    commitId: committed.created.digest,
  });
  if (transition === null) throw new TypeError('Committed Transition view could not be resolved');
  return {
    transitionId,
    transition,
    precondition: prepared.precondition,
    decisionDigest,
    commit,
    workspace: {
      ...(committed.draft.workspace_state ?? {}),
      revision: committed.draft.revision,
    },
  };
}

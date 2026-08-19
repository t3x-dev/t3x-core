import {
  buildReplayVerificationStatement,
  describeTransitionObject,
  InMemoryTransitionObjectResolver,
  type ProposalStatement,
  stateImportMutationDrivers,
  yamlSourceMutationDrivers,
  yopsMutationDrivers,
} from '@t3x-dev/core';
import {
  CORE_PREDICATE_TYPES,
  type Effect,
  EffectClaimFalseError,
  type MutationDriverRegistry,
  type ProtocolValue,
  parseStatement,
  type State,
  type Statement,
  verifyEffect,
} from '@t3x-dev/transition';
import type {
  InspectTransitionInput,
  TransitionActorRef,
  TransitionInspectionGraph,
  TransitionInspectionView,
  TransitionRequestKind,
} from './inspect';

export type TransitionSubjectRole = 'effect' | 'result' | 'proposal';

export type TransitionSourceArtifactSelector = {
  format: 't3x.dev/workspace-source-artifact/v1';
  rootPath: string;
  resources: Array<{
    path: string;
    materialId: string;
    contentHash?: string;
  }>;
};

export type TransitionProposeRequest =
  | {
      kind: 'structured_yops';
      workspaceId: string;
      operations: ProtocolValue[];
      source?: never;
      why?: string;
      ifRevision?: number;
    }
  | {
      kind: 'structured_yops';
      workspaceId: string;
      source: {
        type: 'workspace_extraction_proposal';
        candidateId: string;
      };
      operations?: never;
      why?: string;
      ifRevision?: number;
    }
  | {
      kind: 'exact_source_import';
      workspaceId: string;
      artifact: TransitionSourceArtifactSelector;
      root: { materialId: string; contentHash?: string };
      why?: string;
      ifRevision?: number;
    }
  | {
      kind: 'exact_source_edit';
      workspaceId: string;
      artifact: TransitionSourceArtifactSelector;
      operations: Array<{
        op: 'replace_scalar';
        path: Array<string | number>;
        expect: string;
        value: string;
      }>;
      why?: string;
      ifRevision?: number;
    }
  | {
      kind: 'exact_source_revert';
      workspaceId: string;
      commitId: string;
      why?: string;
      ifRevision?: number;
    };

export interface TransitionExternalStatementDraft {
  predicateType: string;
  predicate: ProtocolValue;
  subjects: TransitionSubjectRole[];
}

export type TransitionExternalProviderResult =
  | { outcome: 'statement'; statement: TransitionExternalStatementDraft }
  | { outcome: 'no_statement'; code: string; message: string };

export type TransitionNativeProviderResult =
  | { outcome: 'statement'; statement: Statement }
  | { outcome: 'no_statement'; code: string; message: string }
  | { outcome: 'not_applicable' };

export interface TransitionExternalStatementProvider {
  /** Stable server-owned key persisted as Statement membership source. */
  source: string;
  /** Trusted issuer identity established by server configuration. */
  issuer: TransitionActorRef;
  /** Closed provider-local predicate allowlist. */
  predicateTypes: readonly string[];
  verify(input: {
    transitionId: string;
    projectId: string;
    workspaceId: string;
    effect: Effect;
    base: State;
    result: State;
    proposal: ProposalStatement;
    run: { id: string; recordedAt: string };
  }): Promise<TransitionExternalProviderResult>;
}

/**
 * Trusted application adapter for a native Statement profile. The command
 * layer owns Statement subject/issuer validation; the adapter context is
 * injected by the composition root so storage never becomes an application
 * package dependency.
 */
export interface TransitionNativeStatementProvider<AdapterContext = unknown> {
  source: string;
  issuer: TransitionActorRef;
  predicateTypes: readonly string[];
  verify(input: {
    db: AdapterContext;
    transitionId: string;
    projectId: string;
    workspaceId: string;
    requestKind: TransitionRequestKind;
    requestFacts: ProtocolValue;
    preparationFacts: ProtocolValue | null;
    effect: Effect;
    base: State;
    result: State;
    proposal: ProposalStatement;
    run: { id: string; recordedAt: string };
  }): Promise<TransitionNativeProviderResult>;
}

export interface TransitionControlPlaneOptions<AdapterContext = unknown> {
  providers?: readonly TransitionExternalStatementProvider[];
  nativeProviders?: readonly TransitionNativeStatementProvider<AdapterContext>[];
  allowedExternalPredicateTypes?: readonly string[];
}

export interface TransitionOperationalResult {
  source: string;
  outcome: 'no_statement' | 'failed';
  code: string;
  message: string;
}

export class TransitionApplicationRequestConflictError extends Error {
  readonly code = 'TRANSITION_REQUEST_CONFLICT';

  constructor(readonly requestId: string) {
    super(`Transition request ${requestId} conflicts with an earlier request`);
    this.name = 'TransitionApplicationRequestConflictError';
  }
}

export class TransitionPredicateNotAllowedError extends Error {
  readonly code = 'TRANSITION_PREDICATE_NOT_ALLOWED';

  constructor(readonly predicateType: string) {
    super(`Predicate type ${predicateType} is not allowed on this Transition endpoint`);
    this.name = 'TransitionPredicateNotAllowedError';
  }
}

export interface CanonicalTransitionRequest {
  canonicalJson: string;
  digest: `sha256:${string}`;
}

export interface ExistingTransitionProposal {
  transitionId: string;
  requestDigest: string;
}

export interface BuiltTransitionProposal {
  workspaceId: string;
  workspaceRevision: number;
  refName: string;
  refHead: string | null;
  base: State;
  result: State;
  effect: Effect;
  proposal: ProposalStatement;
  preparationFacts?: ProtocolValue;
}

export interface TransitionProposalMembershipLike {
  transitionId: string;
}

export interface TransitionStatementMembershipLike {
  statementDigest: string;
  source: string;
  issuer: TransitionActorRef;
  requestId: string;
  createdAt: string;
}

export interface TransitionStatementRecordInput {
  projectId: string;
  transitionId: string;
  statement: Statement;
  source: string;
  issuer: TransitionActorRef;
  requestId: string;
  requestDigest: `sha256:${string}`;
}

export interface TransitionVerificationReceiptLike {
  requestDigest: string;
  operationalResults: TransitionOperationalResult[];
}

export interface TransitionProposalCommandPorts<View> {
  canonicalTransitionRequest(value: ProtocolValue): CanonicalTransitionRequest;
  findTransitionProposalByRequest(input: {
    projectId: string;
    actor: TransitionActorRef;
    requestId: string;
  }): Promise<ExistingTransitionProposal | null>;
  buildProposal(input: {
    projectId: string;
    actor: TransitionActorRef;
    request: TransitionProposeRequest;
  }): Promise<BuiltTransitionProposal>;
  materializeTransitionProposal(input: {
    projectId: string;
    workspaceId: string;
    workspaceRevision: number;
    refName: string;
    refHead: string | null;
    requestKind: TransitionRequestKind;
    requestFacts: ProtocolValue;
    preparationFacts?: ProtocolValue;
    requestId: string;
    actor: TransitionActorRef;
    base: State;
    result: State;
    effect: Effect;
    proposal: ProposalStatement;
  }): Promise<{ membership: TransitionProposalMembershipLike; reused: boolean }>;
  inspectTransition(input: InspectTransitionInput): Promise<View>;
}

export interface TransitionVerificationCommandPorts<
  View,
  Membership extends TransitionStatementMembershipLike,
  AdapterContext,
> {
  canonicalTransitionRequest(value: ProtocolValue): CanonicalTransitionRequest;
  findTransitionStatementsByRequest(input: {
    projectId: string;
    transitionId: string;
    requestId: string;
    requestDigest: `sha256:${string}`;
  }): Promise<Membership[]>;
  findTransitionVerificationReceipt(input: {
    projectId: string;
    transitionId: string;
    requestId: string;
  }): Promise<TransitionVerificationReceiptLike | null>;
  resolveTransitionProposalGraph(input: {
    projectId: string;
    transitionId: string;
  }): Promise<TransitionInspectionGraph>;
  recordTransitionVerification(input: {
    statementInputs: TransitionStatementRecordInput[];
    receipt: {
      projectId: string;
      transitionId: string;
      requestId: string;
      requestDigest: `sha256:${string}`;
      operationalResults: TransitionOperationalResult[];
    };
  }): Promise<{ statements: Membership[]; operationalResults: TransitionOperationalResult[] }>;
  inspectTransition(input: InspectTransitionInput): Promise<View>;
  nowIso(): string;
  nativeProviderContext: AdapterContext;
}

export interface TransitionAttachCommandPorts<
  View,
  Membership extends TransitionStatementMembershipLike,
> {
  canonicalTransitionRequest(value: ProtocolValue): CanonicalTransitionRequest;
  findTransitionStatementsByRequest(input: {
    projectId: string;
    transitionId: string;
    requestId: string;
    requestDigest: `sha256:${string}`;
  }): Promise<Membership[]>;
  resolveTransitionProposalGraph(input: {
    projectId: string;
    transitionId: string;
  }): Promise<TransitionInspectionGraph>;
  recordTransitionStatementMembership(
    input: TransitionStatementRecordInput
  ): Promise<{ membership: Membership; reused: boolean }>;
  inspectTransition(input: InspectTransitionInput): Promise<View>;
}

const REPLAY_PREDICATE_TYPE = 't3x.dev/replay-verification/v1' as const;
const REPLAY_ACTOR = Object.freeze({
  kind: 'service' as const,
  id: 'service:t3x-transition-replay',
});
const REPLAY_TOOL = Object.freeze({ name: '@t3x-dev/transition/replay', version: '1' });
const UNSPECIFIED_ENVIRONMENT = Object.freeze({ mode: 'unspecified' as const });
const mutationDrivers: MutationDriverRegistry = new Map([
  ...stateImportMutationDrivers,
  ...yamlSourceMutationDrivers,
  ...yopsMutationDrivers,
]);

function comparePortable(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function normalizedProposeRequest(request: TransitionProposeRequest): ProtocolValue {
  if (request.kind === 'structured_yops') {
    return {
      kind: request.kind,
      workspace_id: request.workspaceId,
      ...('source' in request && request.source !== undefined
        ? {
            source: {
              type: request.source.type,
              candidate_id: request.source.candidateId,
            },
          }
        : { operations: structuredClone(request.operations) }),
      ...(request.why === undefined ? {} : { why: request.why }),
      ...(request.ifRevision === undefined ? {} : { if_revision: request.ifRevision }),
    };
  }
  if (request.kind === 'exact_source_revert') {
    return {
      kind: request.kind,
      workspace_id: request.workspaceId,
      commit_id: request.commitId,
      ...(request.why === undefined ? {} : { why: request.why }),
      ...(request.ifRevision === undefined ? {} : { if_revision: request.ifRevision }),
    };
  }
  return {
    kind: request.kind,
    workspace_id: request.workspaceId,
    artifact: {
      format: request.artifact.format,
      root_path: request.artifact.rootPath,
      resources: request.artifact.resources
        .map((resource) => ({
          path: resource.path,
          material_id: resource.materialId,
          ...(resource.contentHash === undefined ? {} : { content_hash: resource.contentHash }),
        }))
        .sort((left, right) => comparePortable(left.path, right.path)),
    },
    ...(request.kind === 'exact_source_import'
      ? {
          root: {
            material_id: request.root.materialId,
            ...(request.root.contentHash === undefined
              ? {}
              : { content_hash: request.root.contentHash }),
          },
        }
      : { operations: structuredClone(request.operations) }),
    ...(request.why === undefined ? {} : { why: request.why }),
    ...(request.ifRevision === undefined ? {} : { if_revision: request.ifRevision }),
  } as ProtocolValue;
}

function subjectDescriptors(
  graph: TransitionInspectionGraph,
  roles: readonly TransitionSubjectRole[]
) {
  const byRole = {
    effect: describeTransitionObject(graph.effect),
    result: graph.effect.result,
    proposal: describeTransitionObject(graph.proposal),
  } as const;
  return [...new Set(roles)].sort(comparePortable).map((role) => byRole[role]);
}

function assertExternalPredicate(
  predicateType: string,
  allowed: ReadonlySet<string>,
  providerAllowed?: readonly string[]
): void {
  if (
    CORE_PREDICATE_TYPES.includes(predicateType as (typeof CORE_PREDICATE_TYPES)[number]) ||
    predicateType === REPLAY_PREDICATE_TYPE ||
    !allowed.has(predicateType) ||
    (providerAllowed !== undefined && !providerAllowed.includes(predicateType))
  ) {
    throw new TransitionPredicateNotAllowedError(predicateType);
  }
}

function configuredProviders<AdapterContext>(
  options: TransitionControlPlaneOptions<AdapterContext> | undefined
): {
  providers: TransitionExternalStatementProvider[];
  nativeProviders: TransitionNativeStatementProvider<AdapterContext>[];
  allowed: Set<string>;
} {
  const providers = [...(options?.providers ?? [])];
  const nativeProviders = [...(options?.nativeProviders ?? [])];
  const allowed = new Set(options?.allowedExternalPredicateTypes ?? []);
  const sources = new Set<string>();
  const configured = [
    ...providers.map((provider) => ({ kind: 'external' as const, provider })),
    ...nativeProviders.map((provider) => ({ kind: 'native' as const, provider })),
  ];
  for (const entry of configured) {
    const { provider } = entry;
    if (
      provider.source.length === 0 ||
      provider.source !== provider.source.trim() ||
      provider.issuer.id.length === 0 ||
      provider.issuer.id !== provider.issuer.id.trim() ||
      !['human', 'agent', 'service'].includes(provider.issuer.kind) ||
      sources.has(provider.source)
    ) {
      throw new TypeError('Transition providers require unique stable sources and valid issuers');
    }
    sources.add(provider.source);
    if (new Set(provider.predicateTypes).size !== provider.predicateTypes.length) {
      throw new TypeError(`Transition provider ${provider.source} repeats a predicate type`);
    }
    for (const predicateType of provider.predicateTypes) {
      if (entry.kind === 'native') {
        assertExternalPredicate(predicateType, new Set([predicateType]));
      } else {
        assertExternalPredicate(predicateType, allowed);
      }
    }
  }
  return { providers, nativeProviders, allowed };
}

function createExternalStatement(input: {
  graph: TransitionInspectionGraph;
  actor: TransitionActorRef;
  draft: TransitionExternalStatementDraft;
  allowed: ReadonlySet<string>;
  providerAllowed?: readonly string[];
}): Statement {
  assertExternalPredicate(input.draft.predicateType, input.allowed, input.providerAllowed);
  if (input.draft.subjects.length === 0) {
    throw new TypeError('External Statement requires at least one subject role');
  }
  return parseStatement({
    schema: 't3x/statement/v1',
    subjects: subjectDescriptors(input.graph, input.draft.subjects),
    actor: input.actor,
    predicateType: input.draft.predicateType,
    predicate: input.draft.predicate,
  });
}

function sameActor(left: TransitionActorRef, right: TransitionActorRef): boolean {
  return left.kind === right.kind && left.id === right.id;
}

function descriptorKey(value: { kind: string; schema: string; digest: string }): string {
  return `${value.kind}\0${value.schema}\0${value.digest}`;
}

function validateNativeStatement<AdapterContext>(input: {
  graph: TransitionInspectionGraph;
  provider: TransitionNativeStatementProvider<AdapterContext>;
  statement: Statement;
}): Statement {
  const statement = parseStatement(input.statement);
  if (!sameActor(statement.actor, input.provider.issuer)) {
    throw new TypeError(`Native provider ${input.provider.source} issued as another actor`);
  }
  if (!input.provider.predicateTypes.includes(statement.predicateType)) {
    throw new TransitionPredicateNotAllowedError(statement.predicateType);
  }
  const allowedSubjects = new Set([
    descriptorKey(describeTransitionObject(input.graph.effect)),
    descriptorKey(input.graph.effect.result),
    descriptorKey(describeTransitionObject(input.graph.proposal)),
  ]);
  if (statement.subjects.some((subject) => !allowedSubjects.has(descriptorKey(subject)))) {
    throw new TypeError(`Native provider ${input.provider.source} issued for another graph`);
  }
  return statement;
}

export async function proposeTransitionCommand<View = TransitionInspectionView>(input: {
  projectId: string;
  requestId: string;
  actor: TransitionActorRef;
  request: TransitionProposeRequest;
  ports: TransitionProposalCommandPorts<View>;
}): Promise<{ view: View; reused: boolean }> {
  const requestFacts = normalizedProposeRequest(input.request);
  const normalized = input.ports.canonicalTransitionRequest(requestFacts);
  const existing = await input.ports.findTransitionProposalByRequest({
    projectId: input.projectId,
    actor: input.actor,
    requestId: input.requestId,
  });
  if (existing !== null) {
    if (existing.requestDigest !== normalized.digest) {
      throw new TransitionApplicationRequestConflictError(input.requestId);
    }
    return {
      view: await input.ports.inspectTransition({
        projectId: input.projectId,
        transitionId: existing.transitionId,
        actor: input.actor,
      }),
      reused: true,
    };
  }

  const built = await input.ports.buildProposal({
    projectId: input.projectId,
    actor: input.actor,
    request: input.request,
  });
  const created = await input.ports.materializeTransitionProposal({
    projectId: input.projectId,
    workspaceId: built.workspaceId,
    workspaceRevision: built.workspaceRevision,
    refName: built.refName,
    refHead: built.refHead,
    requestKind: input.request.kind,
    requestFacts,
    ...(built.preparationFacts === undefined ? {} : { preparationFacts: built.preparationFacts }),
    requestId: input.requestId,
    actor: input.actor,
    base: built.base,
    result: built.result,
    effect: built.effect,
    proposal: built.proposal,
  });
  return {
    view: await input.ports.inspectTransition({
      projectId: input.projectId,
      transitionId: created.membership.transitionId,
      actor: input.actor,
    }),
    reused: created.reused,
  };
}

export async function verifyTransitionCommand<
  View = TransitionInspectionView,
  Membership extends TransitionStatementMembershipLike = TransitionStatementMembershipLike,
  AdapterContext = unknown,
>(input: {
  projectId: string;
  transitionId: string;
  requestId: string;
  actor?: TransitionActorRef;
  options?: TransitionControlPlaneOptions<AdapterContext>;
  ports: TransitionVerificationCommandPorts<View, Membership, AdapterContext>;
}): Promise<{
  view: View;
  statements: Membership[];
  operationalResults: TransitionOperationalResult[];
  reused: boolean;
}> {
  const request = input.ports.canonicalTransitionRequest({ operation: 'verify' });
  const receipt = await input.ports.findTransitionVerificationReceipt({
    projectId: input.projectId,
    transitionId: input.transitionId,
    requestId: input.requestId,
  });
  if (receipt !== null && receipt.requestDigest !== request.digest) {
    throw new TransitionApplicationRequestConflictError(input.requestId);
  }
  const prior = await input.ports.findTransitionStatementsByRequest({
    projectId: input.projectId,
    transitionId: input.transitionId,
    requestId: input.requestId,
    requestDigest: request.digest,
  });
  if (prior.length > 0) {
    return {
      view: await input.ports.inspectTransition(input),
      statements: prior,
      operationalResults: receipt?.operationalResults ?? [],
      reused: true,
    };
  }

  const { providers, nativeProviders, allowed } = configuredProviders(input.options);
  const graph = await input.ports.resolveTransitionProposalGraph({
    projectId: input.projectId,
    transitionId: input.transitionId,
  });
  const requestFacts = JSON.parse(graph.membership.requestCanonicalJson) as ProtocolValue;
  const preparationFacts =
    graph.preparation === null
      ? null
      : (JSON.parse(graph.preparation.canonicalJson) as ProtocolValue);
  const recordedAt = input.ports.nowIso();
  let replayPredicate:
    | {
        outcome: 'verified';
        result: Effect['result'];
        tool: typeof REPLAY_TOOL;
        run: { id: string; recordedAt: string };
        environment: typeof UNSPECIFIED_ENVIRONMENT;
      }
    | {
        outcome: 'false';
        reason: string;
        tool: typeof REPLAY_TOOL;
        run: { id: string; recordedAt: string };
        environment: typeof UNSPECIFIED_ENVIRONMENT;
      };
  const run = {
    id: `transition:${input.transitionId}:verify:${input.requestId}:replay`,
    recordedAt,
  };
  try {
    const verified = await verifyEffect(graph.effect, {
      resolver: new InMemoryTransitionObjectResolver([graph.base, graph.result]),
      drivers: mutationDrivers,
    });
    replayPredicate = {
      outcome: 'verified',
      result: verified.resultDescriptor,
      tool: REPLAY_TOOL,
      run,
      environment: UNSPECIFIED_ENVIRONMENT,
    };
  } catch (error) {
    if (!(error instanceof EffectClaimFalseError)) throw error;
    replayPredicate = {
      outcome: 'false',
      reason: `${error.code}: ${error.message}`,
      tool: REPLAY_TOOL,
      run,
      environment: UNSPECIFIED_ENVIRONMENT,
    };
  }
  const replay = buildReplayVerificationStatement({
    effect: graph.effect,
    actor: REPLAY_ACTOR,
    predicate: replayPredicate,
  });
  const statementInputs: TransitionStatementRecordInput[] = [
    {
      projectId: input.projectId,
      transitionId: input.transitionId,
      statement: replay,
      source: 'server:replay',
      issuer: REPLAY_ACTOR,
      requestId: input.requestId,
      requestDigest: request.digest,
    },
  ];

  const operationalResults: TransitionOperationalResult[] = [];
  const allProviders = [
    ...providers.map((provider) => ({ kind: 'external' as const, provider })),
    ...nativeProviders.map((provider) => ({ kind: 'native' as const, provider })),
  ];
  const providerRuns = await Promise.allSettled(
    allProviders.map(async (entry) => {
      const { provider } = entry;
      const common = {
        transitionId: input.transitionId,
        projectId: input.projectId,
        workspaceId: graph.membership.workspaceId,
        effect: graph.effect,
        base: graph.base,
        result: graph.result,
        proposal: graph.proposal,
        run: {
          id: `transition:${input.transitionId}:verify:${input.requestId}:${provider.source}`,
          recordedAt,
        },
      };
      if (entry.kind === 'native') {
        const result = await entry.provider.verify({
          ...common,
          db: input.ports.nativeProviderContext,
          requestKind: graph.membership.requestKind,
          requestFacts,
          preparationFacts,
        });
        if (result.outcome === 'not_applicable') return { provider, result } as const;
        if (result.outcome === 'no_statement') {
          if (result.code.trim().length === 0 || result.message.trim().length === 0) {
            throw new TypeError('Operational provider results require a code and message');
          }
          return { provider, result } as const;
        }
        return {
          provider,
          result,
          statement: validateNativeStatement({
            graph,
            provider: entry.provider,
            statement: result.statement,
          }),
        } as const;
      }
      const result = await entry.provider.verify(common);
      if (result.outcome === 'no_statement') {
        if (result.code.trim().length === 0 || result.message.trim().length === 0) {
          throw new TypeError('Operational provider results require a code and message');
        }
        return { provider, result } as const;
      }
      return {
        provider,
        result,
        statement: createExternalStatement({
          graph,
          actor: provider.issuer,
          draft: result.statement,
          allowed,
          providerAllowed: provider.predicateTypes,
        }),
      } as const;
    })
  );
  for (let index = 0; index < providerRuns.length; index += 1) {
    const provider = allProviders[index]!.provider;
    const settled = providerRuns[index]!;
    if (settled.status === 'rejected') {
      operationalResults.push({
        source: provider.source,
        outcome: 'failed',
        code: 'PROVIDER_FAILED',
        message: settled.reason instanceof Error ? settled.reason.message : 'Provider failed',
      });
      continue;
    }
    const value = settled.value;
    if (value.result.outcome === 'not_applicable') continue;
    if (value.result.outcome === 'no_statement') {
      operationalResults.push({
        source: provider.source,
        outcome: 'no_statement',
        code: value.result.code,
        message: value.result.message,
      });
      continue;
    }
    if (!('statement' in value) || value.statement === undefined) {
      throw new TypeError('Conclusive provider result is missing its Statement');
    }
    statementInputs.push({
      projectId: input.projectId,
      transitionId: input.transitionId,
      statement: value.statement,
      source: provider.source,
      issuer: provider.issuer,
      requestId: input.requestId,
      requestDigest: request.digest,
    });
  }
  operationalResults.sort((left, right) => comparePortable(left.source, right.source));
  const recorded = await input.ports.recordTransitionVerification({
    statementInputs,
    receipt: {
      projectId: input.projectId,
      transitionId: input.transitionId,
      requestId: input.requestId,
      requestDigest: request.digest,
      operationalResults,
    },
  });
  recorded.statements.sort((left, right) =>
    comparePortable(left.statementDigest, right.statementDigest)
  );
  return {
    view: await input.ports.inspectTransition(input),
    statements: recorded.statements,
    operationalResults: recorded.operationalResults,
    reused: false,
  };
}

export async function attachTransitionStatementCommand<
  View = TransitionInspectionView,
  Membership extends TransitionStatementMembershipLike = TransitionStatementMembershipLike,
>(input: {
  projectId: string;
  transitionId: string;
  requestId: string;
  actor: TransitionActorRef;
  statement: TransitionExternalStatementDraft;
  options?: TransitionControlPlaneOptions;
  ports: TransitionAttachCommandPorts<View, Membership>;
}): Promise<{
  view: View;
  membership: Membership;
  reused: boolean;
}> {
  const normalized = input.ports.canonicalTransitionRequest({
    operation: 'attach_statement',
    predicate_type: input.statement.predicateType,
    predicate: input.statement.predicate,
    subjects: [...new Set(input.statement.subjects)].sort(comparePortable),
  });
  const prior = await input.ports.findTransitionStatementsByRequest({
    projectId: input.projectId,
    transitionId: input.transitionId,
    requestId: input.requestId,
    requestDigest: normalized.digest,
  });
  if (prior.length > 0) {
    if (prior.length !== 1) throw new TransitionApplicationRequestConflictError(input.requestId);
    return {
      view: await input.ports.inspectTransition(input),
      membership: prior[0]!,
      reused: true,
    };
  }

  const graph = await input.ports.resolveTransitionProposalGraph({
    projectId: input.projectId,
    transitionId: input.transitionId,
  });
  const statement = createExternalStatement({
    graph,
    actor: input.actor,
    draft: input.statement,
    allowed: new Set(input.options?.allowedExternalPredicateTypes ?? []),
  });
  const recorded = await input.ports.recordTransitionStatementMembership({
    projectId: input.projectId,
    transitionId: input.transitionId,
    statement,
    source: `api:attach:${input.statement.predicateType}`,
    issuer: input.actor,
    requestId: input.requestId,
    requestDigest: normalized.digest,
  });
  return {
    view: await input.ports.inspectTransition(input),
    membership: recorded.membership,
    reused: recorded.reused,
  };
}

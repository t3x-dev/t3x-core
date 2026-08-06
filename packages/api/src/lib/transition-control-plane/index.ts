import type { ProjectionCapabilityContext, ProposalStatement } from '@t3x-dev/core';
import {
  buildReplayVerificationStatement,
  describeTransitionObject,
  InMemoryTransitionObjectResolver,
  projectTransitionView,
  stateImportMutationDrivers,
  type TransitionViewV1,
  yamlSourceMutationDrivers,
  yopsMutationDrivers,
} from '@t3x-dev/core';
import {
  type AnyDB,
  findTransitionProposalByRequest,
  findTransitionStatementsByRequest,
  getTransitionPolicyBinding,
  type RecordTransitionStatementMembershipInput,
  recordTransitionStatementMembership,
  recordTransitionStatementMemberships,
  resolveTransitionProposalGraph,
  TransitionRequestConflictError,
  type TransitionRequestKind,
  type TransitionStatementMembership,
} from '@t3x-dev/storage';
import {
  CORE_PREDICATE_TYPES,
  type DecisionStatement,
  type Effect,
  EffectClaimFalseError,
  type MutationDriverRegistry,
  type ProtocolValue,
  parseStatement,
  type State,
  type Statement,
  verifyEffect,
} from '@t3x-dev/transition';
import { resolveWorkspaceExtractionTransitionSource } from '../workspace-extraction-proposal';
import {
  buildWorkspaceSourceProposal,
  buildWorkspaceSourceRevertProposal,
  WORKSPACE_SOURCE_ARTIFACT_FORMAT,
  type WorkspaceSourceArtifactSelector,
} from '../workspace-source-transition';
import {
  buildWorkspaceYOpsProposal,
  WorkspaceTransitionReviewStaleError,
} from '../workspace-transition';
import { canonicalTransitionRequest, materializeTransitionProposal } from './materialize';

type ActorRef = ProposalStatement['actor'];
export type TransitionSubjectRole = 'effect' | 'result' | 'proposal';

const REPLAY_PREDICATE_TYPE = 't3x.dev/replay-verification/v1' as const;
const REPLAY_ACTOR = Object.freeze({
  kind: 'service' as const,
  id: 'service:t3x-transition-replay',
});
const REPLAY_TOOL = Object.freeze({ name: '@t3x-dev/transition/replay', version: '1' });
const UNSPECIFIED_ENVIRONMENT = Object.freeze({ mode: 'unspecified' as const });
const REPOSITORY_SCOPE = Object.freeze({
  completeness: 'complete' as const,
  sources: ['repository:transition-statement-memberships'],
});

const mutationDrivers: MutationDriverRegistry = new Map([
  ...stateImportMutationDrivers,
  ...yamlSourceMutationDrivers,
  ...yopsMutationDrivers,
]);

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
      artifact: WorkspaceSourceArtifactSelector;
      root: { materialId: string; contentHash?: string };
      why?: string;
      ifRevision?: number;
    }
  | {
      kind: 'exact_source_edit';
      workspaceId: string;
      artifact: WorkspaceSourceArtifactSelector;
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
  issuer: ActorRef;
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
 * Trusted application adapter for a native Statement profile. Unlike external
 * providers, it must construct the complete Statement through the profile's
 * parser/builder; the control plane still revalidates its authority and graph
 * subjects before persistence.
 */
export interface TransitionNativeStatementProvider {
  source: string;
  issuer: ActorRef;
  predicateTypes: readonly string[];
  verify(input: {
    db: AnyDB;
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

export interface TransitionControlPlaneOptions {
  providers?: readonly TransitionExternalStatementProvider[];
  nativeProviders?: readonly TransitionNativeStatementProvider[];
  allowedExternalPredicateTypes?: readonly string[];
}

export interface TransitionControlPlaneView {
  transitionId: string;
  projectId: string;
  workspaceId: string;
  requestKind: TransitionRequestKind;
  requestId: string;
  createdAt: string;
  precondition: {
    workspaceRevision: number;
    refName: string;
    refHead: string | null;
    effectDigest: string;
    proposalDigest: string;
    statementDigests: string[];
    policyDigest: string | null;
  };
  transition: TransitionViewV1;
  statements: Array<{
    digest: string;
    source: string;
    issuer: ActorRef;
    requestId: string;
    createdAt: string;
  }>;
}

export interface TransitionOperationalResult {
  source: string;
  outcome: 'no_statement' | 'failed';
  code: string;
  message: string;
}

export class TransitionPredicateNotAllowedError extends Error {
  readonly code = 'TRANSITION_PREDICATE_NOT_ALLOWED';

  constructor(readonly predicateType: string) {
    super(`Predicate type ${predicateType} is not allowed on this Transition endpoint`);
    this.name = 'TransitionPredicateNotAllowedError';
  }
}

function comparePortable(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
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

function normalizedSourcePreparation(sourceArtifact: unknown): ProtocolValue {
  if (
    !isRecord(sourceArtifact) ||
    sourceArtifact.format !== WORKSPACE_SOURCE_ARTIFACT_FORMAT ||
    typeof sourceArtifact.rootPath !== 'string' ||
    !Array.isArray(sourceArtifact.resources)
  ) {
    throw new TypeError('Server-resolved exact-source preparation is malformed');
  }
  return {
    artifact: {
      format: WORKSPACE_SOURCE_ARTIFACT_FORMAT,
      root_path: sourceArtifact.rootPath,
      resources: sourceArtifact.resources.map((resource) => {
        if (
          !isRecord(resource) ||
          typeof resource.path !== 'string' ||
          typeof resource.materialId !== 'string' ||
          typeof resource.contentHash !== 'string'
        ) {
          throw new TypeError('Server-resolved exact-source resource is malformed');
        }
        return {
          path: resource.path,
          material_id: resource.materialId,
          content_hash: resource.contentHash,
        };
      }),
    },
  };
}

async function buildProposal(
  db: AnyDB,
  input: {
    projectId: string;
    actor: ActorRef;
    request: TransitionProposeRequest;
  }
) {
  const common = {
    projectId: input.projectId,
    workspaceId: input.request.workspaceId,
    why: input.request.why,
    expectedRevision: input.request.ifRevision,
    actor: input.actor,
  };
  if (input.request.kind === 'structured_yops') {
    if ('source' in input.request && input.request.source !== undefined) {
      const source = await resolveWorkspaceExtractionTransitionSource(db, {
        projectId: input.projectId,
        workspaceId: input.request.workspaceId,
        candidateId: input.request.source.candidateId,
        expectedRevision: input.request.ifRevision,
      });
      const built = await buildWorkspaceYOpsProposal(db, {
        ...common,
        expectedRevision: source.workspaceRevision,
        operations: source.operations,
      });
      if (built.refHead !== source.baseCommitHash) {
        throw new WorkspaceTransitionReviewStaleError();
      }
      return built;
    }
    return buildWorkspaceYOpsProposal(db, { ...common, operations: input.request.operations });
  }
  if (input.request.kind === 'exact_source_revert') {
    return buildWorkspaceSourceRevertProposal(db, {
      ...common,
      commitId: input.request.commitId,
    });
  }
  return buildWorkspaceSourceProposal(db, {
    ...common,
    artifact: input.request.artifact,
    change:
      input.request.kind === 'exact_source_import'
        ? { mode: 'import', root: input.request.root }
        : { mode: 'edit', operations: input.request.operations },
  });
}

export async function proposeTransition(input: {
  db: AnyDB;
  projectId: string;
  requestId: string;
  actor: ActorRef;
  request: TransitionProposeRequest;
}): Promise<{ view: TransitionControlPlaneView; reused: boolean }> {
  const requestFacts = normalizedProposeRequest(input.request);
  const normalized = canonicalTransitionRequest(requestFacts);
  const existing = await findTransitionProposalByRequest(input.db, {
    projectId: input.projectId,
    actor: input.actor,
    requestId: input.requestId,
  });
  if (existing !== null) {
    if (existing.requestDigest !== normalized.digest) {
      throw new TransitionRequestConflictError(input.requestId);
    }
    return {
      view: await inspectTransition({
        db: input.db,
        projectId: input.projectId,
        transitionId: existing.transitionId,
        actor: input.actor,
      }),
      reused: true,
    };
  }

  const built = await buildProposal(input.db, input);
  let preparationFacts: ProtocolValue | undefined;
  if (input.request.kind === 'exact_source_revert') {
    if (!('sourceArtifact' in built)) {
      throw new TypeError('Exact-source revert did not produce preparation facts');
    }
    preparationFacts = normalizedSourcePreparation(built.sourceArtifact);
  }
  const created = await materializeTransitionProposal({
    db: input.db,
    projectId: input.projectId,
    workspaceId: built.workspaceId,
    workspaceRevision: built.workspaceRevision,
    refName: built.refName,
    refHead: built.refHead,
    requestKind: input.request.kind,
    requestFacts,
    ...(preparationFacts === undefined ? {} : { preparationFacts }),
    requestId: input.requestId,
    actor: input.actor,
    base: built.base,
    result: built.result,
    effect: built.effect,
    proposal: built.proposal,
  });
  return {
    view: await inspectTransition({
      db: input.db,
      projectId: input.projectId,
      transitionId: created.membership.transitionId,
      actor: input.actor,
    }),
    reused: created.reused,
  };
}

export async function inspectTransition(input: {
  db: AnyDB;
  projectId: string;
  transitionId: string;
  actor?: ActorRef;
  decision?: DecisionStatement;
}): Promise<TransitionControlPlaneView> {
  const graph = await resolveTransitionProposalGraph(input.db, input.projectId, input.transitionId);
  const policyBinding = await getTransitionPolicyBinding(
    input.db,
    input.projectId,
    graph.membership.refName
  );
  const capabilityContext: ProjectionCapabilityContext | undefined =
    input.actor === undefined || policyBinding === null
      ? undefined
      : {
          actorContext: { actor: input.actor },
          policy: policyBinding.policy,
          policyResource: policyBinding.resource,
        };
  const transition = projectTransitionView({
    mode: 'transition',
    effect: graph.effect,
    proposal: graph.proposal,
    observations: graph.observations.map((observation) => ({
      statement: observation.statement as Statement,
      issuerContext: observation.issuerContext,
    })),
    observationScope: REPOSITORY_SCOPE,
    objectIntegrity: 'verified',
    ...(input.decision === undefined ? {} : { decision: input.decision }),
    ...(capabilityContext === undefined ? {} : { capabilityContext }),
  });
  return {
    transitionId: graph.membership.transitionId,
    projectId: graph.membership.projectId,
    workspaceId: graph.membership.workspaceId,
    requestKind: graph.membership.requestKind,
    requestId: graph.membership.requestId,
    createdAt: graph.membership.createdAt,
    precondition: {
      workspaceRevision: graph.membership.workspaceRevision,
      refName: graph.membership.refName,
      refHead: graph.membership.refHead,
      effectDigest: graph.membership.effectDigest,
      proposalDigest: graph.membership.proposalDigest,
      statementDigests: graph.observations.map(
        (observation) => observation.membership.statementDigest
      ),
      policyDigest: policyBinding?.resource.digest ?? null,
    },
    transition,
    statements: graph.observations.map((observation) => ({
      digest: observation.membership.statementDigest,
      source: observation.membership.source,
      issuer: observation.membership.issuer,
      requestId: observation.membership.requestId,
      createdAt: observation.membership.createdAt,
    })),
  };
}

function subjectDescriptors(
  graph: Awaited<ReturnType<typeof resolveTransitionProposalGraph>>,
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

function configuredProviders(options: TransitionControlPlaneOptions | undefined): {
  providers: TransitionExternalStatementProvider[];
  nativeProviders: TransitionNativeStatementProvider[];
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
  graph: Awaited<ReturnType<typeof resolveTransitionProposalGraph>>;
  actor: ActorRef;
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

function sameActor(left: ActorRef, right: ActorRef): boolean {
  return left.kind === right.kind && left.id === right.id;
}

function descriptorKey(value: { kind: string; schema: string; digest: string }): string {
  return `${value.kind}\0${value.schema}\0${value.digest}`;
}

function validateNativeStatement(input: {
  graph: Awaited<ReturnType<typeof resolveTransitionProposalGraph>>;
  provider: TransitionNativeStatementProvider;
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

export async function verifyTransition(input: {
  db: AnyDB;
  projectId: string;
  transitionId: string;
  requestId: string;
  actor?: ActorRef;
  options?: TransitionControlPlaneOptions;
}): Promise<{
  view: TransitionControlPlaneView;
  statements: TransitionStatementMembership[];
  operationalResults: TransitionOperationalResult[];
  reused: boolean;
}> {
  const request = canonicalTransitionRequest({ operation: 'verify' });
  const prior = await findTransitionStatementsByRequest(input.db, {
    projectId: input.projectId,
    transitionId: input.transitionId,
    requestId: input.requestId,
    requestDigest: request.digest,
  });
  if (prior.length > 0) {
    return {
      view: await inspectTransition(input),
      statements: prior,
      operationalResults: [],
      reused: true,
    };
  }

  const { providers, nativeProviders, allowed } = configuredProviders(input.options);
  const graph = await resolveTransitionProposalGraph(input.db, input.projectId, input.transitionId);
  const requestFacts = JSON.parse(graph.membership.requestCanonicalJson) as ProtocolValue;
  const preparationFacts =
    graph.preparation === null
      ? null
      : (JSON.parse(graph.preparation.canonicalJson) as ProtocolValue);
  const recordedAt = new Date().toISOString();
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
  const statementInputs: RecordTransitionStatementMembershipInput[] = [
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
          db: input.db,
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
  const statements = (await recordTransitionStatementMemberships(input.db, statementInputs)).map(
    (recorded) => recorded.membership
  );
  statements.sort((left, right) => comparePortable(left.statementDigest, right.statementDigest));
  operationalResults.sort((left, right) => comparePortable(left.source, right.source));
  return {
    view: await inspectTransition(input),
    statements,
    operationalResults,
    reused: false,
  };
}

export async function attachTransitionStatement(input: {
  db: AnyDB;
  projectId: string;
  transitionId: string;
  requestId: string;
  actor: ActorRef;
  statement: TransitionExternalStatementDraft;
  options?: TransitionControlPlaneOptions;
}): Promise<{
  view: TransitionControlPlaneView;
  membership: TransitionStatementMembership;
  reused: boolean;
}> {
  const normalized = canonicalTransitionRequest({
    operation: 'attach_statement',
    predicate_type: input.statement.predicateType,
    predicate: input.statement.predicate,
    subjects: [...new Set(input.statement.subjects)].sort(comparePortable),
  });
  const prior = await findTransitionStatementsByRequest(input.db, {
    projectId: input.projectId,
    transitionId: input.transitionId,
    requestId: input.requestId,
    requestDigest: normalized.digest,
  });
  if (prior.length > 0) {
    if (prior.length !== 1) throw new TransitionRequestConflictError(input.requestId);
    return {
      view: await inspectTransition(input),
      membership: prior[0]!,
      reused: true,
    };
  }

  const graph = await resolveTransitionProposalGraph(input.db, input.projectId, input.transitionId);
  const statement = createExternalStatement({
    graph,
    actor: input.actor,
    draft: input.statement,
    allowed: new Set(input.options?.allowedExternalPredicateTypes ?? []),
  });
  const recorded = await recordTransitionStatementMembership(input.db, {
    projectId: input.projectId,
    transitionId: input.transitionId,
    statement,
    source: `api:attach:${input.statement.predicateType}`,
    issuer: input.actor,
    requestId: input.requestId,
    requestDigest: normalized.digest,
  });
  return {
    view: await inspectTransition(input),
    membership: recorded.membership,
    reused: recorded.reused,
  };
}

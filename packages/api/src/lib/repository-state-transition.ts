import {
  authorizeDecisionForRepository,
  buildReplayVerificationStatement,
  type CommitV2,
  compileProposalDraft,
  createAcceptancePolicyResource,
  createCommitV2,
  createHumanProposalDraft,
  createYOpsReplacementEffect,
  createYOpsState,
  describeCommitV2,
  describeTransitionObject,
  InMemoryTransitionObjectResolver,
  type ProposalStatement,
  type ProtocolObject,
  parseAcceptancePolicy,
  type RepositoryDecisionAuthority,
  type SemanticContent,
  type State,
  type StatementObservation,
  type TransitionViewV1,
  yopsStateCodec,
} from '@t3x-dev/core';
import {
  type AnyDB,
  createTransitionCommit,
  getTransitionRefHead,
  getTransitionViewForCommit,
  recordRepositoryDecisionAuthorization,
  TransitionHeadConflictError,
} from '@t3x-dev/storage';

type ActorRef = ProposalStatement['actor'];
type CanonicalTimestamp = Parameters<typeof authorizeDecisionForRepository>[0]['decidedAt'];

const REPLAY_ACTOR = Object.freeze({
  kind: 'service' as const,
  id: 'service:t3x-repository-yops-replay',
});
const REPLAY_TOOL = Object.freeze({ name: '@t3x-dev/core/yops-replay', version: '1' });
const UNSPECIFIED_ENVIRONMENT = Object.freeze({ mode: 'unspecified' as const });
const OBSERVATION_SCOPE = Object.freeze({
  completeness: 'complete' as const,
  sources: ['server:repository-state-transition'],
});
const REPOSITORY_SEMANTIC_CONTENT_DOMAIN = 't3x.dev/semantic-content' as const;
const REPOSITORY_SEMANTIC_CONTENT_VERSION = 1 as const;

const REPOSITORY_STATE_POLICY = createAcceptancePolicyResource({
  uri: 't3x://policies/repository-state-transition/v1',
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
        allowedModes: ['authored', 'unspecified'],
        minimumEvidence: 0,
        humanConfirmation: 'not_required',
      },
      rationale: {
        allowedModes: ['authored', 'unspecified'],
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
        requirement: 'optional',
        issuers: { mode: 'any' },
        tools: { mode: 'any' },
        environments: { mode: 'any' },
        profiles: { mode: 'any' },
        schemas: { mode: 'any' },
        contexts: { mode: 'any' },
      },
      humanConfirmation: { issuers: { mode: 'any' } },
    },
    override: {
      allowClaimFailures: false,
      allowFailedValidation: false,
      allowMissingHumanConfirmation: false,
      allowMissingValidation: true,
    },
  }),
});

export interface CommitRepositoryYOpsStateInput {
  db: AnyDB;
  projectId: string;
  refName: string;
  /** Exact head observed by the application command; never inferred inside the write. */
  expectedHead: string | null;
  target: State;
  /** Trusted server-derived actor, never copied from a request body. */
  actor: ActorRef;
  intent?: string;
  rationale?: string;
  yopsLogIds?: readonly string[];
}

export interface CommitRepositoryYOpsStateResult {
  commit: CommitV2;
  commitDigest: string;
  transition: TransitionViewV1;
}

export class RepositoryStateDomainUnsupportedError extends Error {
  readonly code = 'UNSUPPORTED_DOMAIN';

  constructor(message: string) {
    super(message);
    this.name = 'RepositoryStateDomainUnsupportedError';
  }
}

export class RepositoryStateProposalError extends Error {
  readonly code = 'PROPOSAL_INVALID';

  constructor(readonly issues: readonly { code: string; path: string; message: string }[]) {
    super('Repository State Proposal could not be compiled');
    this.name = 'RepositoryStateProposalError';
  }
}

export class RepositoryStateDecisionDeniedError extends Error {
  readonly code = 'DECISION_NOT_PERMITTED';

  constructor(readonly failures: readonly { code: string; message: string }[]) {
    super('Repository State Decision was denied by the server policy');
    this.name = 'RepositoryStateDecisionDeniedError';
  }
}

/** Losslessly encode structured repository content in the versioned YOps State domain. */
export function createRepositoryYOpsStateFromSemanticContent(content: SemanticContent): State {
  if (!Array.isArray(content.trees) || !Array.isArray(content.relations)) {
    throw new TypeError('Structured repository state requires trees and relations arrays');
  }
  return createYOpsState({
    domain: REPOSITORY_SEMANTIC_CONTENT_DOMAIN,
    version: REPOSITORY_SEMANTIC_CONTENT_VERSION,
    content: {
      trees: content.trees,
      relations: content.relations,
    },
  } as unknown as Parameters<typeof createYOpsState>[0]);
}

/** Decode only the repository SemanticContent domain; never guess another State shape. */
export function decodeRepositorySemanticContentState(state: State): SemanticContent {
  if (
    state.codec.mediaType !== yopsStateCodec.mediaType ||
    state.codec.version !== yopsStateCodec.version
  ) {
    throw new RepositoryStateDomainUnsupportedError(
      `Repository SemanticContent requires ${yopsStateCodec.mediaType}@${yopsStateCodec.version}`
    );
  }
  const decoded = yopsStateCodec.decode(state.value);
  if (decoded === null || typeof decoded !== 'object' || Array.isArray(decoded)) {
    throw new RepositoryStateDomainUnsupportedError(
      'State is not a t3x.dev/semantic-content version 1 YOps document'
    );
  }
  const value = decoded as Record<string, unknown>;
  const rawContent = value.content;
  if (
    value.domain !== REPOSITORY_SEMANTIC_CONTENT_DOMAIN ||
    value.version !== REPOSITORY_SEMANTIC_CONTENT_VERSION ||
    rawContent === null ||
    typeof rawContent !== 'object' ||
    Array.isArray(rawContent)
  ) {
    throw new RepositoryStateDomainUnsupportedError(
      'State is not a t3x.dev/semantic-content version 1 YOps document'
    );
  }
  const repositoryContent = rawContent as Record<string, unknown>;
  if (!Array.isArray(repositoryContent.trees) || !Array.isArray(repositoryContent.relations)) {
    throw new RepositoryStateDomainUnsupportedError(
      'State is not a t3x.dev/semantic-content version 1 YOps document'
    );
  }
  return {
    trees: repositoryContent.trees,
    relations: repositoryContent.relations,
  } as SemanticContent;
}

/**
 * Persist one complete YOps repository state-change graph and advance its ref.
 *
 * This is the shared one-shot application path for task-oriented commands that
 * already have an exact target State. It always creates Effect, Proposal,
 * deterministic replay Statement, accepted Decision, CommitV2, and an
 * expected-head ref CAS. External systems and protocol storage stay outside
 * the deterministic mutation driver.
 */
export async function commitRepositoryYOpsState(
  input: CommitRepositoryYOpsStateInput
): Promise<CommitRepositoryYOpsStateResult> {
  const head = await getTransitionRefHead(input.db, {
    projectId: input.projectId,
    refName: input.refName,
  });
  if (head.head !== input.expectedHead) {
    throw new TransitionHeadConflictError(input.expectedHead, head.head);
  }
  if (head.format === 'legacy_v1') {
    throw new TransitionHeadConflictError(input.expectedHead, head.head);
  }

  const base = head.format === 'empty' ? createYOpsState({}) : head.state;
  const { effect, result } = createYOpsReplacementEffect({
    base,
    target: input.target,
    expectedBase: describeTransitionObject(base),
  });
  const compiled = compileProposalDraft({
    draft: createHumanProposalDraft({
      ...(input.intent?.trim() ? { intent: input.intent.trim() } : {}),
      ...(input.rationale?.trim() ? { why: input.rationale.trim() } : {}),
    }),
    effect,
    actor: input.actor,
  });
  if (!compiled.ok) throw new RepositoryStateProposalError(compiled.issues);

  const recordedAt = new Date().toISOString() as CanonicalTimestamp;
  const replay = buildReplayVerificationStatement({
    effect,
    actor: REPLAY_ACTOR,
    predicate: {
      outcome: 'verified',
      result: effect.result,
      tool: REPLAY_TOOL,
      run: {
        id: `repository:${input.projectId}:ref:${input.refName}:base:${input.expectedHead ?? 'empty'}:replay`,
        recordedAt,
      },
      environment: UNSPECIFIED_ENVIRONMENT,
    },
  });
  const observations: StatementObservation[] = [
    { statement: replay, issuerContext: { actor: REPLAY_ACTOR } },
  ];
  const authority: RepositoryDecisionAuthority = {
    async resolve() {
      return {
        actorContext: { actor: input.actor },
        observationScope: OBSERVATION_SCOPE,
        policy: REPOSITORY_STATE_POLICY.policy,
        policyResource: REPOSITORY_STATE_POLICY.resource,
        statements: observations,
      };
    },
  };
  const issued = await authorizeDecisionForRepository({
    projectId: input.projectId,
    refName: input.refName,
    proposal: compiled.proposal,
    effect,
    outcome: 'accepted',
    rationale: input.rationale?.trim()
      ? { mode: 'authored', value: input.rationale.trim(), evidence: [] }
      : { mode: 'unspecified' },
    decidedAt: recordedAt,
    authority,
  });
  if (!issued.ok || issued.authorization === null) {
    throw new RepositoryStateDecisionDeniedError(issued.ok ? [] : issued.failures);
  }

  await recordRepositoryDecisionAuthorization(input.db, issued.authorization);
  const parentObjects = head.format === 'transition_v2' ? [head.commit] : [];
  const objects: ProtocolObject[] = [
    base,
    result,
    ...issued.authorization.objects,
    ...parentObjects,
  ];
  const commit = await createCommitV2({
    parents: head.format === 'transition_v2' ? [describeCommitV2(head.commit)] : [],
    decision: issued.decision,
    resolver: new InMemoryTransitionObjectResolver(objects),
  });
  const created = await createTransitionCommit(input.db, {
    projectId: input.projectId,
    refName: input.refName,
    expectedHead: input.expectedHead,
    commit,
    objects,
    ...(input.yopsLogIds === undefined ? {} : { yopsLogIds: input.yopsLogIds }),
  });
  const transition = await getTransitionViewForCommit(input.db, {
    projectId: input.projectId,
    refName: input.refName,
    commitId: created.digest,
  });
  if (transition === null) {
    throw new TypeError('Committed repository Transition could not be resolved');
  }
  return { commit, commitDigest: created.digest, transition };
}

import { createHash } from 'node:crypto';
import {
  authorizeDecisionForRepository,
  bindEspHomeSourceInputs,
  buildReplayVerificationStatement,
  type CommitV2,
  compileProposalDraft,
  createAcceptancePolicyResource,
  createCommitV2,
  createHumanProposalDraft,
  createStateImportEffect,
  createYamlSourceEffect,
  createYamlSourceResourceDescriptor,
  createYamlSourceState,
  createYOpsState,
  deriveYamlSourceRevertOperations,
  describeCommitV2,
  describeTransitionObject,
  type EspHomeSourceInputIssue,
  InMemoryTransitionObjectResolver,
  type ProposalStatement,
  type ProtocolObject,
  parseAcceptancePolicy,
  projectTransitionView,
  type ReadyEspHomeSourceInputs,
  type RepositoryDecisionAuthority,
  type State,
  type StatementObservation,
  stateImportMutationDrivers,
  type TransitionViewV1,
  type YamlSourceReplaceScalarOperation,
  yamlSourceMutationDrivers,
  yamlSourceStateCodec,
} from '@t3x-dev/core';
import {
  type AnyDB,
  ConflictError,
  createTransitionCommit,
  findMaterialsByIds,
  findWorkspaceDraft,
  getTransitionRefHead,
  getTransitionViewForCommit,
  getVerifiedTransitionCommitGraph,
  recordRepositoryDecision,
  recordRepositoryDecisionAuthorization,
  type TransitionRefHead,
  upsertWorkspaceDraft,
} from '@t3x-dev/storage';
import { type ProtocolValue, TransitionProtocolError, verifyEffect } from '@t3x-dev/transition';
import {
  materializeTransitionProposal,
  materializeTransitionStatement,
} from './transition-control-plane/materialize';
import {
  WorkspaceTransitionDecisionDeniedError,
  WorkspaceTransitionNotFoundError,
  WorkspaceTransitionReviewStaleError,
} from './workspace-transition';
import {
  type EsphomeRunnerStatementResult,
  runEsphomeRunnerStatement,
} from './workspace-validation/esphome-runner-statement';
import type { LocalOciCommandExecutor } from './workspace-validation/local-oci-provider';

type ActorRef = ProposalStatement['actor'];
type CanonicalTimestamp = Parameters<typeof authorizeDecisionForRepository>[0]['decidedAt'];

export const WORKSPACE_SOURCE_ARTIFACT_FORMAT = 't3x.dev/workspace-source-artifact/v1' as const;

const REPLAY_ACTOR = Object.freeze({
  kind: 'service' as const,
  id: 'service:t3x-workspace-source-replay',
});
const RUNNER_ACTOR = Object.freeze({
  kind: 'service' as const,
  id: 'service:t3x-workspace-esphome-runner',
});
const REPLAY_TOOL = Object.freeze({
  name: '@t3x-dev/transition/replay',
  version: '1',
});
const UNSPECIFIED_ENVIRONMENT = Object.freeze({ mode: 'unspecified' as const });
const OBSERVATION_SCOPE = Object.freeze({
  completeness: 'complete' as const,
  sources: ['server:workspace-source-transition-review'],
});

const WORKSPACE_SOURCE_POLICY = createAcceptancePolicyResource({
  uri: 't3x://policies/workspace-source-human-review/v1',
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
        requirement: 'optional',
        issuers: { mode: 'any' },
        tools: { mode: 'any' },
        environments: { mode: 'any' },
        profiles: { mode: 'any' },
        schemas: { mode: 'any' },
        contexts: { mode: 'any' },
      },
      runner: {
        requirement: 'optional',
        issuers: { mode: 'one_of', values: [RUNNER_ACTOR] },
        tools: { mode: 'any' },
        workflows: { mode: 'any' },
        environments: { mode: 'any' },
      },
      humanConfirmation: { issuers: { mode: 'any' } },
    },
    override: {
      allowClaimFailures: false,
      allowFailedValidation: false,
      allowMissingHumanConfirmation: false,
      allowMissingValidation: false,
      allowFailedRunner: true,
      allowMissingRunner: false,
    },
  }),
});

export interface WorkspaceSourceMaterialSelector {
  materialId: string;
  contentHash?: string;
}

export interface WorkspaceSourceResourceSelector extends WorkspaceSourceMaterialSelector {
  path: string;
}

export interface WorkspaceSourceArtifactSelector {
  format: typeof WORKSPACE_SOURCE_ARTIFACT_FORMAT;
  rootPath: string;
  resources: WorkspaceSourceResourceSelector[];
}

export type WorkspaceSourceChange =
  | {
      mode: 'import';
      root: WorkspaceSourceMaterialSelector;
    }
  | {
      mode: 'edit';
      operations: YamlSourceReplaceScalarOperation[];
    };

export interface WorkspaceSourceSecretResolver {
  /** Returns only server-owned values for exactly the requested reference names. */
  resolve(input: {
    projectId: string;
    workspaceId: string;
    names: readonly string[];
  }): Promise<Readonly<Record<string, string>>>;
}

export interface WorkspaceSourceRunnerCapability {
  executor?: LocalOciCommandExecutor;
  image?: string;
  tempRoot?: string;
  preflightTimeoutMs?: number;
  configTimeoutMs?: number;
}

export interface WorkspaceSourceTransitionCapabilities {
  secretResolver?: WorkspaceSourceSecretResolver;
  /** Presence enables the canonical ESPHome provider; absence produces no Statement. */
  runner?: WorkspaceSourceRunnerCapability;
}

export type WorkspaceSourceRunnerStatus =
  | { mode: 'not_configured' }
  | {
      mode: 'inputs_unavailable';
      reason: 'secret_resolver_unavailable' | 'secret_resolution_failed';
      secretReferenceNames: string[];
    }
  | {
      mode: 'no_statement';
      reason: 'environment_required' | 'timed_out';
    }
  | {
      mode: 'statement';
      statementDigest: string;
      outcome: 'passed' | 'failed';
    };

export interface WorkspaceSourceTransitionPrecondition {
  workspaceRevision: number;
  refHead: string | null;
  sourceSelectorDigest: string;
  sourceInputManifestDigest: string | null;
  effectDigest: string;
  proposalDigest: string;
  statementDigests: string[];
  policyDigest: string;
}

export interface ReviewWorkspaceSourceTransitionInput {
  projectId: string;
  workspaceId: string;
  artifact: WorkspaceSourceArtifactSelector;
  change: WorkspaceSourceChange;
  why?: string;
  expectedRevision?: number;
  actor: ActorRef & { kind: 'human' };
}

export interface BuildWorkspaceSourceProposalInput {
  projectId: string;
  workspaceId: string;
  artifact: WorkspaceSourceArtifactSelector;
  change: WorkspaceSourceChange;
  why?: string;
  expectedRevision?: number;
  actor: ActorRef;
}

export interface BuiltWorkspaceSourceProposal {
  actor: ActorRef;
  base: State;
  effect: ReturnType<typeof createStateImportEffect>['effect'];
  proposal: ProposalStatement;
  refHead: string | null;
  refName: string;
  result: State;
  sourceArtifact: Record<string, unknown>;
  sourceSelectorDigest: string;
  workspace: Record<string, unknown>;
  workspaceId: string;
  workspaceRevision: number;
  workspaceUpdatedAt: string;
}

export interface ReviewWorkspaceSourceTransitionResult {
  transitionId: string;
  transition: TransitionViewV1;
  precondition: WorkspaceSourceTransitionPrecondition;
  runner: WorkspaceSourceRunnerStatus;
}

export interface DecideWorkspaceSourceTransitionInput extends ReviewWorkspaceSourceTransitionInput {
  transitionId?: string;
  outcome: 'accepted' | 'overridden' | 'rejected';
  decisionReason?: string;
  precondition: WorkspaceSourceTransitionPrecondition;
}

export interface DecideWorkspaceSourceTransitionResult
  extends ReviewWorkspaceSourceTransitionResult {
  decisionDigest: string;
  commit?: CommitV2;
  workspace?: Record<string, unknown>;
}

export interface ReviewWorkspaceSourceRevertInput {
  projectId: string;
  workspaceId: string;
  commitId: string;
  why?: string;
  expectedRevision?: number;
  actor: ActorRef & { kind: 'human' };
}

export interface BuildWorkspaceSourceRevertProposalInput {
  projectId: string;
  workspaceId: string;
  commitId: string;
  why?: string;
  expectedRevision?: number;
  actor: ActorRef;
}

export interface DecideWorkspaceSourceRevertInput extends ReviewWorkspaceSourceRevertInput {
  transitionId?: string;
  outcome: 'accepted' | 'overridden' | 'rejected';
  decisionReason?: string;
  precondition: WorkspaceSourceTransitionPrecondition;
}

export class WorkspaceSourceArtifactError extends Error {
  readonly code = 'SOURCE_ARTIFACT_INVALID';

  constructor(
    message: string,
    readonly details?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'WorkspaceSourceArtifactError';
  }
}

export class WorkspaceSourceInputsError extends Error {
  readonly code = 'SOURCE_INPUTS_INVALID';

  constructor(readonly issues: readonly EspHomeSourceInputIssue[]) {
    super('Exact-source dependencies are incomplete or unsupported');
    this.name = 'WorkspaceSourceInputsError';
  }
}

export class WorkspaceSourceRevertUnavailableError extends Error {
  readonly code = 'SOURCE_REVERT_UNAVAILABLE';

  constructor(message: string) {
    super(message);
    this.name = 'WorkspaceSourceRevertUnavailableError';
  }
}

interface ResolvedMaterial {
  materialId: string;
  contentHash: string;
  source: string;
}

interface ResolvedSourceArtifact {
  rootPath: string;
  root?: ResolvedMaterial;
  resources: Array<ResolvedMaterial & { path: string }>;
  selectorDigest: string;
  persistedSelector: Record<string, unknown>;
}

interface BuiltWorkspaceSourceProposalInternal extends BuiltWorkspaceSourceProposal {
  head: TransitionRefHead;
  resolvedSourceArtifact: ResolvedSourceArtifact;
}

interface BoundSourceInputs {
  ready: ReadyEspHomeSourceInputs | null;
  secretValues: Readonly<Record<string, string>> | null;
  unavailableSecrets: {
    reason: 'secret_resolver_unavailable' | 'secret_resolution_failed';
    names: string[];
  } | null;
}

interface PreparedWorkspaceSourceTransition
  extends Omit<ReviewWorkspaceSourceTransitionResult, 'transitionId'> {
  actor: ActorRef;
  base: State;
  effect: ReturnType<typeof createStateImportEffect>['effect'];
  head: TransitionRefHead;
  observations: StatementObservation[];
  projectId: string;
  proposal: Extract<ReturnType<typeof compileProposalDraft>, { ok: true }>['proposal'];
  result: State;
  requestKind: 'exact_source_import' | 'exact_source_edit' | 'exact_source_revert';
  sourceArtifact: Record<string, unknown>;
  targetBranch: string;
  workspace: Record<string, unknown>;
  workspaceId: string;
}

function asCanonicalTimestamp(value: string): CanonicalTimestamp {
  return new Date(value).toISOString() as CanonicalTimestamp;
}

function comparePortable(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function sha256(value: string): `sha256:${string}` {
  return `sha256:${createHash('sha256').update(value, 'utf8').digest('hex')}`;
}

function sourceSelectorDigest(value: Record<string, unknown>): `sha256:${string}` {
  return sha256(`t3x-workspace-source-selector-v1\0${JSON.stringify(value)}`);
}

function materialUri(projectId: string, materialId: string): string {
  return `t3x://projects/${encodeURIComponent(projectId)}/materials/${encodeURIComponent(materialId)}`;
}

function manifestUri(projectId: string, workspaceId: string, selectorDigest: string): string {
  return `t3x://projects/${encodeURIComponent(projectId)}/workspaces/${encodeURIComponent(workspaceId)}/source-inputs/${selectorDigest}`;
}

function assertNonEmpty(value: string, field: string): string {
  const normalized = value.trim();
  if (normalized.length === 0) {
    throw new WorkspaceSourceArtifactError(`${field} must be a non-empty string`);
  }
  return normalized;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function sourceArtifactFromWorkspace(
  workspace: Record<string, unknown>
): WorkspaceSourceArtifactSelector {
  const value = workspace.sourceArtifact;
  if (!isRecord(value) || value.format !== WORKSPACE_SOURCE_ARTIFACT_FORMAT) {
    throw new WorkspaceSourceArtifactError(
      'The Workspace does not contain an exact-source artifact selector'
    );
  }
  if (typeof value.rootPath !== 'string' || !Array.isArray(value.resources)) {
    throw new WorkspaceSourceArtifactError('The stored source-artifact selector is malformed');
  }
  const resources = value.resources.map((resource, index) => {
    if (
      !isRecord(resource) ||
      typeof resource.path !== 'string' ||
      typeof resource.materialId !== 'string' ||
      (resource.contentHash !== undefined && typeof resource.contentHash !== 'string')
    ) {
      throw new WorkspaceSourceArtifactError(
        `The stored source-artifact resource ${index} is malformed`
      );
    }
    return {
      path: resource.path,
      materialId: resource.materialId,
      ...(resource.contentHash === undefined ? {} : { contentHash: resource.contentHash }),
    };
  });
  return {
    format: WORKSPACE_SOURCE_ARTIFACT_FORMAT,
    rootPath: value.rootPath,
    resources,
  };
}

async function resolveSourceArtifact(
  db: AnyDB,
  input: BuildWorkspaceSourceProposalInput
): Promise<ResolvedSourceArtifact> {
  if (input.artifact.format !== WORKSPACE_SOURCE_ARTIFACT_FORMAT) {
    throw new WorkspaceSourceArtifactError('Unsupported source-artifact selector format');
  }
  const rootPath = assertNonEmpty(input.artifact.rootPath, 'artifact.rootPath');
  if (input.change.mode === 'edit' && input.change.operations.length === 0) {
    throw new WorkspaceSourceArtifactError('Exact-source edit requires at least one operation');
  }

  const selectedPaths = new Set([rootPath]);
  input.artifact.resources.forEach((resource, index) => {
    const resourcePath = assertNonEmpty(resource.path, `artifact.resources[${index}].path`);
    if (selectedPaths.has(resourcePath)) {
      throw new WorkspaceSourceArtifactError('Source artifact paths must be unique', {
        path: resourcePath,
      });
    }
    selectedPaths.add(resourcePath);
  });

  const selected = [
    ...(input.change.mode === 'import'
      ? [
          {
            role: 'root' as const,
            path: rootPath,
            materialId: assertNonEmpty(input.change.root.materialId, 'change.root.materialId'),
            claimedHash: input.change.root.contentHash,
          },
        ]
      : []),
    ...input.artifact.resources.map((resource, index) => ({
      role: 'resource' as const,
      path: assertNonEmpty(resource.path, `artifact.resources[${index}].path`),
      materialId: assertNonEmpty(resource.materialId, `artifact.resources[${index}].materialId`),
      claimedHash: resource.contentHash,
    })),
  ];
  const materials = await findMaterialsByIds(db, [
    ...new Set(selected.map((selector) => selector.materialId)),
  ]);
  const materialById = new Map(materials.map((material) => [material.id, material]));
  const resolved = selected.map((selector) => {
    const material = materialById.get(selector.materialId);
    if (material === undefined) {
      throw new WorkspaceSourceArtifactError('Selected source Material was not found', {
        materialId: selector.materialId,
      });
    }
    if (material.project_id !== input.projectId) {
      throw new WorkspaceSourceArtifactError(
        'Selected source Material belongs to another project',
        {
          materialId: selector.materialId,
        }
      );
    }
    if (selector.claimedHash !== undefined && selector.claimedHash !== material.content_hash) {
      throw new WorkspaceSourceArtifactError('Selected source Material content hash changed', {
        materialId: selector.materialId,
      });
    }
    return {
      ...selector,
      contentHash: material.content_hash,
      source: material.content_text,
    };
  });
  const root = resolved.find((resource) => resource.role === 'root');
  const resources = resolved
    .filter((resource) => resource.role === 'resource')
    .map((resource) => ({
      path: resource.path,
      materialId: resource.materialId,
      contentHash: resource.contentHash,
      source: resource.source,
    }))
    .sort((left, right) => comparePortable(left.path, right.path));
  const persistedSelector = {
    format: WORKSPACE_SOURCE_ARTIFACT_FORMAT,
    rootPath,
    ...(root === undefined
      ? {}
      : {
          root: {
            materialId: root.materialId,
            contentHash: root.contentHash,
          },
        }),
    resources: resources.map(({ path, materialId, contentHash }) => ({
      path,
      materialId,
      contentHash,
    })),
  };
  return {
    rootPath,
    ...(root === undefined
      ? {}
      : {
          root: {
            materialId: root.materialId,
            contentHash: root.contentHash,
            source: root.source,
          },
        }),
    resources,
    selectorDigest: sourceSelectorDigest(persistedSelector),
    persistedSelector,
  };
}

function nonSecretIssues(issues: readonly EspHomeSourceInputIssue[]): EspHomeSourceInputIssue[] {
  return issues.filter((issue) => issue.code !== 'MISSING_SECRET');
}

function missingSecretNames(issues: readonly EspHomeSourceInputIssue[]): string[] {
  return [
    ...new Set(
      issues.flatMap((issue) =>
        issue.code === 'MISSING_SECRET' && issue.reference !== undefined ? [issue.reference] : []
      )
    ),
  ].sort(comparePortable);
}

function exactSecretSet(
  names: readonly string[],
  values: Readonly<Record<string, string>>
): boolean {
  const actual = Object.keys(values).sort(comparePortable);
  return names.length === actual.length && names.every((name, index) => name === actual[index]);
}

async function bindSourceInputs(
  input: { projectId: string; workspaceId: string },
  artifact: ResolvedSourceArtifact,
  result: State,
  capabilities: WorkspaceSourceTransitionCapabilities
): Promise<BoundSourceInputs> {
  const resources = artifact.resources.map((resource) => ({
    path: resource.path,
    source: resource.source,
    descriptor: createYamlSourceResourceDescriptor(
      materialUri(input.projectId, resource.materialId),
      resource.source
    ),
  }));
  const bind = (availableSecretNames: readonly string[]) =>
    bindEspHomeSourceInputs({
      root: result,
      rootPath: artifact.rootPath,
      resources,
      availableSecretNames,
      manifestUri: manifestUri(input.projectId, input.workspaceId, artifact.selectorDigest),
    });
  const scanned = bind([]);
  if (scanned.outcome === 'unsupported') {
    throw new WorkspaceSourceInputsError(scanned.issues);
  }
  if (scanned.outcome === 'ready') {
    return { ready: scanned, secretValues: {}, unavailableSecrets: null };
  }
  if (nonSecretIssues(scanned.issues).length > 0) {
    throw new WorkspaceSourceInputsError(scanned.issues);
  }

  const names = missingSecretNames(scanned.issues);
  if (capabilities.secretResolver === undefined) {
    return {
      ready: null,
      secretValues: null,
      unavailableSecrets: { reason: 'secret_resolver_unavailable', names },
    };
  }
  let secretValues: Readonly<Record<string, string>>;
  try {
    secretValues = await capabilities.secretResolver.resolve({
      projectId: input.projectId,
      workspaceId: input.workspaceId,
      names,
    });
  } catch {
    return {
      ready: null,
      secretValues: null,
      unavailableSecrets: { reason: 'secret_resolution_failed', names },
    };
  }
  if (!exactSecretSet(names, secretValues)) {
    return {
      ready: null,
      secretValues: null,
      unavailableSecrets: { reason: 'secret_resolution_failed', names },
    };
  }
  const rebound = bind(names);
  if (rebound.outcome !== 'ready') throw new WorkspaceSourceInputsError(rebound.issues);
  return { ready: rebound, secretValues, unavailableSecrets: null };
}

function buildEffect(input: {
  head: TransitionRefHead;
  change: WorkspaceSourceChange;
  artifact: ResolvedSourceArtifact;
}): {
  base: State;
  effect: ReturnType<typeof createStateImportEffect>['effect'];
  result: State;
} {
  if (input.head.format === 'empty') {
    if (input.change.mode !== 'import' || input.artifact.root === undefined) {
      throw new WorkspaceSourceArtifactError('An empty ref requires an explicit source import');
    }
    const base = createYOpsState({});
    const imported = createYamlSourceState(input.artifact.root.source);
    const created = createStateImportEffect({
      base,
      imported,
      expectedBase: describeTransitionObject(base),
    });
    return { base, effect: created.effect, result: created.result };
  }
  if (input.change.mode !== 'edit') {
    throw new WorkspaceSourceArtifactError('An existing ref requires an exact-source edit');
  }
  const base = input.head.state;
  if (
    base.codec.mediaType !== yamlSourceStateCodec.mediaType ||
    base.codec.version !== yamlSourceStateCodec.version
  ) {
    throw new WorkspaceSourceArtifactError(
      'The current ref head is not an exact-source YAML State'
    );
  }
  const created = createYamlSourceEffect({
    base,
    operations: input.change.operations as unknown as readonly ProtocolValue[],
    expectedBase: describeTransitionObject(base),
  });
  return { base, effect: created.effect, result: created.result };
}

function runnerStatusWithoutExecution(bound: BoundSourceInputs): WorkspaceSourceRunnerStatus {
  if (bound.unavailableSecrets !== null) {
    return {
      mode: 'inputs_unavailable',
      reason: bound.unavailableSecrets.reason,
      secretReferenceNames: [...bound.unavailableSecrets.names],
    };
  }
  return { mode: 'not_configured' };
}

function runnerStatusFromResult(result: EsphomeRunnerStatementResult): WorkspaceSourceRunnerStatus {
  if (result.outcome === 'no_statement') return { mode: 'no_statement', reason: result.reason };
  return {
    mode: 'statement',
    statementDigest: describeTransitionObject(result.statement).digest,
    outcome: result.statement.predicate.outcome,
  };
}

function samePrecondition(
  left: WorkspaceSourceTransitionPrecondition,
  right: WorkspaceSourceTransitionPrecondition
): boolean {
  return (
    left.workspaceRevision === right.workspaceRevision &&
    left.refHead === right.refHead &&
    left.sourceSelectorDigest === right.sourceSelectorDigest &&
    left.sourceInputManifestDigest === right.sourceInputManifestDigest &&
    left.effectDigest === right.effectDigest &&
    left.proposalDigest === right.proposalDigest &&
    left.policyDigest === right.policyDigest &&
    left.statementDigests.length === right.statementDigests.length &&
    left.statementDigests.every((digest, index) => digest === right.statementDigests[index])
  );
}

function decisionRationale(input: {
  outcome: 'accepted' | 'overridden' | 'rejected';
  decisionReason?: string;
}): Parameters<typeof authorizeDecisionForRepository>[0]['rationale'] {
  const reason = input.decisionReason?.trim();
  if (input.outcome === 'overridden' && !reason) {
    throw new TypeError('Override requires an explicit authored Decision reason');
  }
  return reason ? { mode: 'authored', value: reason, evidence: [] } : { mode: 'unspecified' };
}

async function buildWorkspaceSourceProposalInternal(
  db: AnyDB,
  input: BuildWorkspaceSourceProposalInput,
  expectedPrecondition?: WorkspaceSourceTransitionPrecondition
): Promise<BuiltWorkspaceSourceProposalInternal> {
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
  if (expectedPrecondition !== undefined && head.head !== expectedPrecondition.refHead) {
    throw new WorkspaceTransitionReviewStaleError();
  }

  const sourceArtifact = await resolveSourceArtifact(db, input);
  if (
    expectedPrecondition !== undefined &&
    sourceArtifact.selectorDigest !== expectedPrecondition.sourceSelectorDigest
  ) {
    throw new WorkspaceTransitionReviewStaleError();
  }
  const { base, effect, result } = buildEffect({
    head,
    change: input.change,
    artifact: sourceArtifact,
  });
  const compiled = compileProposalDraft({
    draft: createHumanProposalDraft({ why: input.why?.trim() || undefined }),
    effect,
    actor: input.actor,
  });
  if (!compiled.ok) {
    throw new TypeError(
      `Workspace source Proposal compilation failed: ${JSON.stringify(compiled.issues)}`
    );
  }

  return {
    actor: input.actor,
    base,
    effect,
    head,
    proposal: compiled.proposal,
    refHead: head.head,
    refName: targetBranch,
    resolvedSourceArtifact: sourceArtifact,
    result,
    sourceArtifact: sourceArtifact.persistedSelector,
    sourceSelectorDigest: sourceArtifact.selectorDigest,
    workspace,
    workspaceId: input.workspaceId,
    workspaceRevision: draft.revision,
    workspaceUpdatedAt: draft.updated_at,
  };
}

/** Server-side exact-source builder shared by review and control-plane proposals. */
export async function buildWorkspaceSourceProposal(
  db: AnyDB,
  input: BuildWorkspaceSourceProposalInput
): Promise<BuiltWorkspaceSourceProposal> {
  const built = await buildWorkspaceSourceProposalInternal(db, input);
  const { head: _head, resolvedSourceArtifact: _resolved, ...safe } = built;
  return safe;
}

async function completeWorkspaceSourceTransition(
  input: { projectId: string; workspaceId: string },
  capabilities: WorkspaceSourceTransitionCapabilities,
  built: BuiltWorkspaceSourceProposalInternal,
  requestKind: PreparedWorkspaceSourceTransition['requestKind']
): Promise<PreparedWorkspaceSourceTransition> {
  const {
    actor,
    base,
    effect,
    head,
    proposal,
    resolvedSourceArtifact: sourceArtifact,
    result,
    workspace,
  } = built;

  const recordedAt = asCanonicalTimestamp(built.workspaceUpdatedAt);
  const replayed = await verifyEffect(effect, {
    resolver: new InMemoryTransitionObjectResolver([base, result]),
    drivers: head.format === 'empty' ? stateImportMutationDrivers : yamlSourceMutationDrivers,
  });
  const replay = buildReplayVerificationStatement({
    effect,
    actor: REPLAY_ACTOR,
    predicate: {
      outcome: 'verified',
      result: replayed.resultDescriptor,
      tool: REPLAY_TOOL,
      run: {
        id: `workspace:${input.workspaceId}:revision:${built.workspaceRevision}:source-replay`,
        recordedAt,
      },
      environment: UNSPECIFIED_ENVIRONMENT,
    },
  });
  const observations: StatementObservation[] = [
    { statement: replay, issuerContext: { actor: REPLAY_ACTOR } },
  ];
  const bound = await bindSourceInputs(input, sourceArtifact, result, capabilities);
  let runner = runnerStatusWithoutExecution(bound);
  if (capabilities.runner !== undefined && bound.ready !== null && bound.secretValues !== null) {
    const executed = await runEsphomeRunnerStatement({
      state: result,
      sourceInputs: bound.ready,
      actor: RUNNER_ACTOR,
      run: {
        id: `workspace:${input.workspaceId}:revision:${built.workspaceRevision}:esphome`,
        recordedAt,
      },
      secretValues: bound.secretValues,
      image: capabilities.runner.image,
      executor: capabilities.runner.executor,
      tempRoot: capabilities.runner.tempRoot,
      preflightTimeoutMs: capabilities.runner.preflightTimeoutMs,
      configTimeoutMs: capabilities.runner.configTimeoutMs,
    });
    runner = runnerStatusFromResult(executed);
    if (executed.outcome === 'statement') {
      observations.push({ statement: executed.statement, issuerContext: { actor: RUNNER_ACTOR } });
    }
  }
  const statementDigests = observations
    .map((observation) => describeTransitionObject(observation.statement).digest)
    .sort(comparePortable);
  const precondition: WorkspaceSourceTransitionPrecondition = {
    workspaceRevision: built.workspaceRevision,
    refHead: head.head,
    sourceSelectorDigest: sourceArtifact.selectorDigest,
    sourceInputManifestDigest: bound.ready?.manifestResource.digest ?? null,
    effectDigest: describeTransitionObject(effect).digest,
    proposalDigest: describeTransitionObject(proposal).digest,
    statementDigests,
    policyDigest: WORKSPACE_SOURCE_POLICY.resource.digest,
  };
  const transition = projectTransitionView({
    mode: 'transition',
    effect,
    proposal,
    observations,
    observationScope: OBSERVATION_SCOPE,
    objectIntegrity: 'verified',
    capabilityContext: {
      actorContext: { actor },
      policy: WORKSPACE_SOURCE_POLICY.policy,
      policyResource: WORKSPACE_SOURCE_POLICY.resource,
    },
  });
  return {
    actor,
    base,
    effect,
    head,
    observations,
    precondition,
    projectId: input.projectId,
    proposal,
    requestKind,
    result,
    runner,
    sourceArtifact: sourceArtifact.persistedSelector,
    targetBranch: built.refName,
    transition,
    workspace,
    workspaceId: input.workspaceId,
  };
}

async function prepareWorkspaceSourceTransition(
  db: AnyDB,
  input: ReviewWorkspaceSourceTransitionInput,
  capabilities: WorkspaceSourceTransitionCapabilities,
  expectedPrecondition?: WorkspaceSourceTransitionPrecondition
): Promise<PreparedWorkspaceSourceTransition> {
  const built = await buildWorkspaceSourceProposalInternal(db, input, expectedPrecondition);
  return completeWorkspaceSourceTransition(
    input,
    capabilities,
    built,
    input.change.mode === 'import' ? 'exact_source_import' : 'exact_source_edit'
  );
}

function sameObjectDescriptor(
  left: { kind: string; schema: string; digest: string },
  right: { kind: string; schema: string; digest: string }
): boolean {
  return left.kind === right.kind && left.schema === right.schema && left.digest === right.digest;
}

async function buildWorkspaceSourceRevertProposalInternal(
  db: AnyDB,
  input: BuildWorkspaceSourceRevertProposalInput,
  expectedPrecondition?: WorkspaceSourceTransitionPrecondition
): Promise<BuiltWorkspaceSourceProposalInternal> {
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
  if (head.format !== 'transition_v2') {
    throw new WorkspaceSourceRevertUnavailableError(
      'A committed exact-source edit is required before revert can be reviewed'
    );
  }
  if (head.head !== input.commitId) throw new WorkspaceTransitionReviewStaleError();

  const graph = await getVerifiedTransitionCommitGraph(db, input.projectId, input.commitId);
  if (graph === null) {
    throw new WorkspaceSourceRevertUnavailableError(
      'The selected committed Transition could not be resolved'
    );
  }
  let operations: YamlSourceReplaceScalarOperation[];
  try {
    operations = deriveYamlSourceRevertOperations(graph.effect);
  } catch (error) {
    if (error instanceof TransitionProtocolError) {
      throw new WorkspaceSourceRevertUnavailableError(
        'Only a verified t3x.dev/yaml-source-edit@1 commit can be reverted'
      );
    }
    throw error;
  }

  const built = await buildWorkspaceSourceProposalInternal(
    db,
    {
      projectId: input.projectId,
      workspaceId: input.workspaceId,
      artifact: sourceArtifactFromWorkspace(workspace),
      change: { mode: 'edit', operations },
      why: input.why,
      expectedRevision: draft.revision,
      actor: input.actor,
    },
    expectedPrecondition
  );
  if (built.head.head !== input.commitId) throw new WorkspaceTransitionReviewStaleError();
  if (
    !sameObjectDescriptor(built.effect.base, graph.effect.result) ||
    !sameObjectDescriptor(built.effect.result, graph.effect.base)
  ) {
    throw new WorkspaceSourceRevertUnavailableError(
      'The server-derived reverse Effect does not restore the selected commit Base'
    );
  }
  return built;
}

/** Derive a reverse exact-source Proposal from the current CommitV2. */
export async function buildWorkspaceSourceRevertProposal(
  db: AnyDB,
  input: BuildWorkspaceSourceRevertProposalInput
): Promise<BuiltWorkspaceSourceProposal> {
  const built = await buildWorkspaceSourceRevertProposalInternal(db, input);
  const { head: _head, resolvedSourceArtifact: _resolved, ...safe } = built;
  return safe;
}

async function prepareWorkspaceSourceRevert(
  db: AnyDB,
  input: ReviewWorkspaceSourceRevertInput,
  capabilities: WorkspaceSourceTransitionCapabilities,
  expectedPrecondition?: WorkspaceSourceTransitionPrecondition
): Promise<PreparedWorkspaceSourceTransition> {
  const built = await buildWorkspaceSourceRevertProposalInternal(db, input, expectedPrecondition);
  return completeWorkspaceSourceTransition(input, capabilities, built, 'exact_source_revert');
}

async function materializePreparedWorkspaceSourceTransition(
  db: AnyDB,
  prepared: PreparedWorkspaceSourceTransition
): Promise<string> {
  const proposalDigest = describeTransitionObject(prepared.proposal).digest;
  const requestId = [
    'compat:workspace-source-transition-review',
    prepared.requestKind,
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
    requestKind: prepared.requestKind,
    requestFacts: {
      adapter: 'workspace_source_transition_review',
      request_kind: prepared.requestKind,
      workspace_id: prepared.workspaceId,
      workspace_revision: prepared.precondition.workspaceRevision,
      ref_name: prepared.targetBranch,
      ref_head: prepared.precondition.refHead,
      source_selector_digest: prepared.precondition.sourceSelectorDigest,
      source_input_manifest_digest: prepared.precondition.sourceInputManifestDigest,
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
    operation: 'workspace_source_transition_review_verify',
    effect_digest: prepared.precondition.effectDigest,
    statement_digests: [...statementDigests].sort(comparePortable),
  };
  for (const observation of prepared.observations) {
    const source =
      observation.issuerContext.actor.id === REPLAY_ACTOR.id
        ? 'server:workspace-source-replay'
        : 'server:workspace-esphome-runner';
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

export async function reviewWorkspaceSourceTransition(
  db: AnyDB,
  input: ReviewWorkspaceSourceTransitionInput,
  capabilities: WorkspaceSourceTransitionCapabilities = {}
): Promise<ReviewWorkspaceSourceTransitionResult> {
  const prepared = await prepareWorkspaceSourceTransition(db, input, capabilities);
  const transitionId = await materializePreparedWorkspaceSourceTransition(db, prepared);
  return {
    transitionId,
    transition: prepared.transition,
    precondition: prepared.precondition,
    runner: prepared.runner,
  };
}

export async function reviewWorkspaceSourceRevert(
  db: AnyDB,
  input: ReviewWorkspaceSourceRevertInput,
  capabilities: WorkspaceSourceTransitionCapabilities = {}
): Promise<ReviewWorkspaceSourceTransitionResult> {
  const prepared = await prepareWorkspaceSourceRevert(db, input, capabilities);
  const transitionId = await materializePreparedWorkspaceSourceTransition(db, prepared);
  return {
    transitionId,
    transition: prepared.transition,
    precondition: prepared.precondition,
    runner: prepared.runner,
  };
}

function authorityFor(prepared: PreparedWorkspaceSourceTransition): RepositoryDecisionAuthority {
  return {
    async resolve() {
      return {
        actorContext: { actor: prepared.actor },
        observationScope: OBSERVATION_SCOPE,
        policy: WORKSPACE_SOURCE_POLICY.policy,
        policyResource: WORKSPACE_SOURCE_POLICY.resource,
        statements: prepared.observations,
      };
    },
  };
}

type TxRunner = { transaction: <T>(fn: (tx: unknown) => Promise<T>) => Promise<T> };

async function decidePreparedWorkspaceSourceTransition(
  db: AnyDB,
  input: {
    projectId: string;
    workspaceId: string;
    transitionId?: string;
    outcome: 'accepted' | 'overridden' | 'rejected';
    decisionReason?: string;
    precondition: WorkspaceSourceTransitionPrecondition;
  },
  prepared: PreparedWorkspaceSourceTransition
): Promise<DecideWorkspaceSourceTransitionResult> {
  const transitionId = await materializePreparedWorkspaceSourceTransition(db, prepared);
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
      runner: prepared.runner,
      decisionDigest,
    };
  }

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
    });
    const committedWorkspace = {
      ...prepared.workspace,
      id: input.workspaceId,
      projectId: input.projectId,
      sourceArtifact: prepared.sourceArtifact,
      lastCommitHash: created.digest,
      status: 'committed',
      updatedAt: decidedAt,
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
  const transaction = db as unknown as Partial<TxRunner>;
  const committed =
    typeof transaction.transaction === 'function'
      ? await transaction.transaction((tx) => commitAndWorkspace(tx as AnyDB))
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
    runner: prepared.runner,
    decisionDigest,
    commit,
    workspace: {
      ...(committed.draft.workspace_state ?? {}),
      revision: committed.draft.revision,
    },
  };
}

export async function decideWorkspaceSourceTransition(
  db: AnyDB,
  input: DecideWorkspaceSourceTransitionInput,
  capabilities: WorkspaceSourceTransitionCapabilities = {}
): Promise<DecideWorkspaceSourceTransitionResult> {
  let prepared: PreparedWorkspaceSourceTransition;
  try {
    prepared = await prepareWorkspaceSourceTransition(
      db,
      {
        ...input,
        expectedRevision: input.precondition.workspaceRevision,
      },
      capabilities,
      input.precondition
    );
  } catch (error) {
    if (
      error instanceof WorkspaceSourceArtifactError ||
      error instanceof WorkspaceSourceInputsError ||
      error instanceof TransitionProtocolError
    ) {
      throw new WorkspaceTransitionReviewStaleError();
    }
    throw error;
  }
  if (!samePrecondition(input.precondition, prepared.precondition)) {
    throw new WorkspaceTransitionReviewStaleError();
  }
  return decidePreparedWorkspaceSourceTransition(db, input, prepared);
}

export async function decideWorkspaceSourceRevert(
  db: AnyDB,
  input: DecideWorkspaceSourceRevertInput,
  capabilities: WorkspaceSourceTransitionCapabilities = {}
): Promise<DecideWorkspaceSourceTransitionResult> {
  let prepared: PreparedWorkspaceSourceTransition;
  try {
    prepared = await prepareWorkspaceSourceRevert(
      db,
      {
        ...input,
        expectedRevision: input.precondition.workspaceRevision,
      },
      capabilities,
      input.precondition
    );
  } catch (error) {
    if (
      error instanceof ConflictError ||
      error instanceof WorkspaceSourceArtifactError ||
      error instanceof WorkspaceSourceInputsError ||
      error instanceof WorkspaceSourceRevertUnavailableError ||
      error instanceof TransitionProtocolError
    ) {
      throw new WorkspaceTransitionReviewStaleError();
    }
    throw error;
  }
  if (!samePrecondition(input.precondition, prepared.precondition)) {
    throw new WorkspaceTransitionReviewStaleError();
  }
  return decidePreparedWorkspaceSourceTransition(db, input, prepared);
}

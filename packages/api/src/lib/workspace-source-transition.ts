import { createHash } from 'node:crypto';
import {
  bindEspHomeSourceInputs,
  buildReplayVerificationStatement,
  type CommitV2,
  compileProposalDraft,
  createAcceptancePolicyResource,
  createHumanProposalDraft,
  createStateImportEffect,
  createYamlSourceEffect,
  createYamlSourceResourceDescriptor,
  createYamlSourceState,
  createYOpsState,
  deriveYamlSourceRevertOperations,
  describeTransitionObject,
  type EspHomeSourceInputIssue,
  InMemoryTransitionObjectResolver,
  type ProposalStatement,
  parseAcceptancePolicy,
  projectTransitionView,
  type ReadyEspHomeSourceInputs,
  RUNNER_VALIDATION_PREDICATE_TYPE,
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
  findMaterialsByIds,
  findWorkspaceDraft,
  getTransitionRefHead,
  getVerifiedTransitionCommitGraph,
  resolveTransitionProposalGraph,
  TransitionCommandConflictError,
  TransitionMembershipNotFoundError,
  type TransitionRefHead,
} from '@t3x-dev/storage';
import {
  type CanonicalTimestamp,
  type ProtocolValue,
  TransitionProtocolError,
  verifyEffect,
} from '@t3x-dev/transition';
import type { TransitionNativeStatementProvider } from './transition-control-plane';
import {
  commitTransition,
  decideTransition,
  TransitionDecisionDeniedError,
  TransitionReviewStaleError,
  type TransitionWorkspaceCommitProjection,
} from './transition-control-plane/lifecycle';
import {
  canonicalTransitionRequest,
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

export const WORKSPACE_SOURCE_ARTIFACT_FORMAT = 't3x.dev/workspace-source-artifact/v1' as const;

const REPLAY_ACTOR = Object.freeze({
  kind: 'service' as const,
  id: 'service:t3x-workspace-source-replay',
});
const RUNNER_ACTOR = Object.freeze({
  kind: 'service' as const,
  id: 'service:t3x-workspace-esphome-runner',
});
export const WORKSPACE_SOURCE_RUNNER_PROVIDER_SOURCE = 'provider:workspace-esphome-runner' as const;
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
  input: Pick<BuildWorkspaceSourceProposalInput, 'projectId' | 'artifact'> & {
    root?: { materialId: string; contentHash?: string };
  }
): Promise<ResolvedSourceArtifact> {
  if (input.artifact.format !== WORKSPACE_SOURCE_ARTIFACT_FORMAT) {
    throw new WorkspaceSourceArtifactError('Unsupported source-artifact selector format');
  }
  const rootPath = assertNonEmpty(input.artifact.rootPath, 'artifact.rootPath');
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
    ...(input.root !== undefined
      ? [
          {
            role: 'root' as const,
            path: rootPath,
            materialId: assertNonEmpty(input.root.materialId, 'change.root.materialId'),
            claimedHash: input.root.contentHash,
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

function sourceProviderArtifact(
  requestFacts: ProtocolValue | null
): WorkspaceSourceArtifactSelector {
  if (!isRecord(requestFacts) || !isRecord(requestFacts.artifact)) {
    throw new TypeError('Stored exact-source artifact facts are malformed');
  }
  const artifactFacts = requestFacts.artifact;
  if (
    artifactFacts.format !== WORKSPACE_SOURCE_ARTIFACT_FORMAT ||
    typeof artifactFacts.root_path !== 'string' ||
    !Array.isArray(artifactFacts.resources)
  ) {
    throw new TypeError('Stored exact-source artifact facts are malformed');
  }
  return {
    format: WORKSPACE_SOURCE_ARTIFACT_FORMAT,
    rootPath: artifactFacts.root_path,
    resources: artifactFacts.resources.map((resource) => {
      if (
        !isRecord(resource) ||
        typeof resource.path !== 'string' ||
        typeof resource.material_id !== 'string' ||
        (resource.content_hash !== undefined && typeof resource.content_hash !== 'string')
      ) {
        throw new TypeError('Stored exact-source resource facts are malformed');
      }
      return {
        path: resource.path,
        materialId: resource.material_id,
        ...(resource.content_hash === undefined ? {} : { contentHash: resource.content_hash }),
      };
    }),
  };
}

function sourceArtifactFromPreparation(preparationFacts: ProtocolValue): Record<string, unknown> {
  if (!isRecord(preparationFacts) || !isRecord(preparationFacts.artifact)) {
    throw new TypeError('Stored exact-source preparation facts are malformed');
  }
  const artifactFacts = preparationFacts.artifact;
  const selector = sourceProviderArtifact(preparationFacts);
  const root = artifactFacts.root;
  if (
    root !== undefined &&
    (!isRecord(root) ||
      typeof root.material_id !== 'string' ||
      typeof root.content_hash !== 'string')
  ) {
    throw new TypeError('Stored exact-source preparation root is malformed');
  }
  return {
    format: selector.format,
    rootPath: selector.rootPath,
    ...(root === undefined
      ? {}
      : {
          root: {
            materialId: root.material_id,
            contentHash: root.content_hash,
          },
        }),
    resources: selector.resources.map((resource) => {
      if (resource.contentHash === undefined) {
        throw new TypeError('Stored exact-source preparation resource is not content-addressed');
      }
      return {
        path: resource.path,
        materialId: resource.materialId,
        contentHash: resource.contentHash,
      };
    }),
  };
}

/**
 * Derive the canonical API's task projection from immutable server preparation.
 * Protocol Commit remains projection-agnostic; the route composes this adapter.
 */
export async function resolveCanonicalWorkspaceSourceCommitProjection(input: {
  db: AnyDB;
  projectId: string;
  transitionId: string;
}): Promise<TransitionWorkspaceCommitProjection | undefined> {
  const graph = await resolveTransitionProposalGraph(input.db, input.projectId, input.transitionId);
  if (
    graph.membership.requestKind !== 'exact_source_import' &&
    graph.membership.requestKind !== 'exact_source_edit' &&
    graph.membership.requestKind !== 'exact_source_revert'
  ) {
    return undefined;
  }
  if (graph.preparation === null) {
    throw new WorkspaceTransitionReviewStaleError();
  }
  const sourceArtifact = sourceArtifactFromPreparation(
    JSON.parse(graph.preparation.canonicalJson) as ProtocolValue
  );
  const requestFacts: ProtocolValue = {
    adapter: 'canonical_transition_exact_source',
    request_kind: graph.membership.requestKind,
    preparation_digest: graph.preparation.digest,
  };
  return {
    requestFacts,
    apply({ workspace }) {
      return { ...workspace, sourceArtifact };
    },
  };
}

function sourceProviderSelection(input: {
  requestKind: 'exact_source_import' | 'exact_source_edit';
  requestFacts: ProtocolValue;
}): Pick<BuildWorkspaceSourceProposalInput, 'artifact' | 'change'> {
  if (!isRecord(input.requestFacts)) {
    throw new TypeError('Stored exact-source request facts are malformed');
  }
  const requestFacts = input.requestFacts;
  const artifact = sourceProviderArtifact(input.requestFacts);
  if (input.requestKind === 'exact_source_import') {
    const root = requestFacts.root;
    if (
      !isRecord(root) ||
      typeof root.material_id !== 'string' ||
      (root.content_hash !== undefined && typeof root.content_hash !== 'string')
    ) {
      throw new TypeError('Stored exact-source root facts are malformed');
    }
    return {
      artifact,
      change: {
        mode: 'import',
        root: {
          materialId: root.material_id,
          ...(root.content_hash === undefined ? {} : { contentHash: root.content_hash }),
        },
      },
    };
  }
  if (!Array.isArray(requestFacts.operations)) {
    throw new TypeError('Stored exact-source edit facts are malformed');
  }
  return {
    artifact,
    change: {
      mode: 'edit',
      operations: requestFacts.operations.map((operation) => {
        if (
          !isRecord(operation) ||
          operation.op !== 'replace_scalar' ||
          !Array.isArray(operation.path) ||
          operation.path.some(
            (part) => typeof part !== 'string' && (!Number.isInteger(part) || Number(part) < 0)
          ) ||
          typeof operation.expect !== 'string' ||
          typeof operation.value !== 'string'
        ) {
          throw new TypeError('Stored exact-source edit operation facts are malformed');
        }
        return {
          op: 'replace_scalar' as const,
          path: operation.path as Array<string | number>,
          expect: operation.expect,
          value: operation.value,
        };
      }),
    },
  };
}

/** Native adapter that binds canonical exact-source requests to the ESPHome Runner profile. */
export function createWorkspaceSourceRunnerProvider(
  capabilities: WorkspaceSourceTransitionCapabilities
): TransitionNativeStatementProvider {
  return {
    source: WORKSPACE_SOURCE_RUNNER_PROVIDER_SOURCE,
    issuer: RUNNER_ACTOR,
    predicateTypes: [RUNNER_VALIDATION_PREDICATE_TYPE],
    async verify(input) {
      if (
        input.requestKind !== 'exact_source_import' &&
        input.requestKind !== 'exact_source_edit' &&
        input.requestKind !== 'exact_source_revert'
      ) {
        return { outcome: 'not_applicable' };
      }
      if (capabilities.runner === undefined) {
        return {
          outcome: 'no_statement',
          code: 'RUNNER_NOT_CONFIGURED',
          message: 'The ESPHome Runner is not configured.',
        };
      }
      const selected =
        input.requestKind === 'exact_source_revert'
          ? { artifact: sourceProviderArtifact(input.preparationFacts), change: null }
          : sourceProviderSelection({
              requestKind: input.requestKind,
              requestFacts: input.requestFacts,
            });
      const artifact = await resolveSourceArtifact(input.db, {
        projectId: input.projectId,
        artifact: selected.artifact,
        ...(selected.change?.mode === 'import' ? { root: selected.change.root } : {}),
      });
      const bound = await bindSourceInputs(input, artifact, input.result, capabilities);
      if (bound.unavailableSecrets !== null) {
        return {
          outcome: 'no_statement',
          code:
            bound.unavailableSecrets.reason === 'secret_resolver_unavailable'
              ? 'SECRET_RESOLVER_UNAVAILABLE'
              : 'SECRET_RESOLUTION_FAILED',
          message: 'The exact-source secret references could not be resolved by the server.',
        };
      }
      if (bound.ready === null || bound.secretValues === null) {
        throw new TypeError('Ready exact-source inputs are missing their transient bindings');
      }
      const executed = await runEsphomeRunnerStatement({
        state: input.result,
        sourceInputs: bound.ready,
        actor: RUNNER_ACTOR,
        run: { id: input.run.id, recordedAt: asCanonicalTimestamp(input.run.recordedAt) },
        secretValues: bound.secretValues,
        image: capabilities.runner.image,
        executor: capabilities.runner.executor,
        tempRoot: capabilities.runner.tempRoot,
        preflightTimeoutMs: capabilities.runner.preflightTimeoutMs,
        configTimeoutMs: capabilities.runner.configTimeoutMs,
      });
      if (executed.outcome === 'no_statement') {
        return {
          outcome: 'no_statement',
          code:
            executed.reason === 'environment_required'
              ? 'RUNNER_ENVIRONMENT_REQUIRED'
              : 'RUNNER_TIMED_OUT',
          message: 'The ESPHome Runner did not produce a configuration-validity conclusion.',
        };
      }
      return { outcome: 'statement', statement: executed.statement };
    },
  };
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

  if (input.change.mode === 'edit' && input.change.operations.length === 0) {
    throw new WorkspaceSourceArtifactError('Exact-source edit requires at least one operation');
  }
  const sourceArtifact = await resolveSourceArtifact(db, {
    projectId: input.projectId,
    artifact: input.artifact,
    ...(input.change.mode === 'import' ? { root: input.change.root } : {}),
  });
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

type WorkspaceSourceDecisionInput = {
  projectId: string;
  workspaceId: string;
  transitionId?: string;
  outcome: 'accepted' | 'overridden' | 'rejected';
  decisionReason?: string;
  precondition: WorkspaceSourceTransitionPrecondition;
  actor: ActorRef & { kind: 'human' };
};

function compatibilityRequestId(action: 'decide' | 'commit', facts: ProtocolValue): string {
  const digest = canonicalTransitionRequest(facts).digest.slice('sha256:'.length);
  return `workspace-source-transition:${action}:${digest}`;
}

function canonicalPrecondition(
  precondition: WorkspaceSourceTransitionPrecondition,
  refName: string
) {
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

function assertSourceMembership(
  graph: Awaited<ReturnType<typeof resolveTransitionProposalGraph>>,
  input: WorkspaceSourceDecisionInput,
  requestKind: PreparedWorkspaceSourceTransition['requestKind']
): void {
  let requestFacts: unknown;
  try {
    requestFacts = JSON.parse(graph.membership.requestCanonicalJson);
  } catch {
    throw new WorkspaceTransitionReviewStaleError();
  }
  if (
    graph.membership.workspaceId !== input.workspaceId ||
    graph.membership.requestKind !== requestKind ||
    !isRecord(requestFacts) ||
    requestFacts.request_kind !== requestKind ||
    requestFacts.source_selector_digest !== input.precondition.sourceSelectorDigest ||
    requestFacts.source_input_manifest_digest !== input.precondition.sourceInputManifestDigest
  ) {
    throw new WorkspaceTransitionReviewStaleError();
  }
}

function runnerStatusFromDurableGraph(
  graph: Awaited<ReturnType<typeof resolveTransitionProposalGraph>>,
  precondition: WorkspaceSourceTransitionPrecondition,
  capabilities: WorkspaceSourceTransitionCapabilities
): WorkspaceSourceRunnerStatus {
  const runnerObservation = graph.observations.find(
    (observation) => observation.issuerContext.actor.id === RUNNER_ACTOR.id
  );
  if (runnerObservation !== undefined) {
    const predicate: unknown = runnerObservation.statement.predicate;
    if (isRecord(predicate) && (predicate.outcome === 'passed' || predicate.outcome === 'failed')) {
      return {
        mode: 'statement',
        statementDigest: runnerObservation.membership.statementDigest,
        outcome: predicate.outcome,
      };
    }
    throw new WorkspaceTransitionReviewStaleError();
  }
  if (capabilities.runner === undefined) return { mode: 'not_configured' };
  if (precondition.sourceInputManifestDigest === null) {
    return {
      mode: 'inputs_unavailable',
      reason:
        capabilities.secretResolver === undefined
          ? 'secret_resolver_unavailable'
          : 'secret_resolution_failed',
      secretReferenceNames: [],
    };
  }
  return {
    mode: 'no_statement',
    reason: capabilities.runner.executor === undefined ? 'environment_required' : 'timed_out',
  };
}

function sourceArtifactForCommit(
  workspace: Record<string, unknown>,
  expectedSelectorDigest: string
): Record<string, unknown> {
  const value = workspace.sourceArtifact;
  if (!isRecord(value) || value.format !== WORKSPACE_SOURCE_ARTIFACT_FORMAT) {
    throw new WorkspaceTransitionReviewStaleError();
  }
  if (typeof value.rootPath !== 'string' || !Array.isArray(value.resources)) {
    throw new WorkspaceTransitionReviewStaleError();
  }
  const root = value.root;
  if (
    root !== undefined &&
    (!isRecord(root) || typeof root.materialId !== 'string' || typeof root.contentHash !== 'string')
  ) {
    throw new WorkspaceTransitionReviewStaleError();
  }
  const resources = value.resources.map((resource) => {
    if (
      !isRecord(resource) ||
      typeof resource.path !== 'string' ||
      typeof resource.materialId !== 'string' ||
      typeof resource.contentHash !== 'string'
    ) {
      throw new WorkspaceTransitionReviewStaleError();
    }
    return {
      path: resource.path,
      materialId: resource.materialId,
      contentHash: resource.contentHash,
    };
  });
  const normalized = {
    format: WORKSPACE_SOURCE_ARTIFACT_FORMAT,
    rootPath: value.rootPath,
    ...(root === undefined
      ? {}
      : { root: { materialId: root.materialId, contentHash: root.contentHash } }),
    resources,
  };
  if (sourceSelectorDigest(normalized) !== expectedSelectorDigest) {
    throw new WorkspaceTransitionReviewStaleError();
  }
  return normalized;
}

async function decidePreparedWorkspaceSourceTransition(
  db: AnyDB,
  input: WorkspaceSourceDecisionInput,
  prepared: PreparedWorkspaceSourceTransition | undefined,
  requestKind: PreparedWorkspaceSourceTransition['requestKind'],
  capabilities: WorkspaceSourceTransitionCapabilities
): Promise<DecideWorkspaceSourceTransitionResult> {
  try {
    let transitionId = input.transitionId;
    if (prepared !== undefined) {
      const materializedId = await materializePreparedWorkspaceSourceTransition(db, prepared);
      if (transitionId !== undefined && transitionId !== materializedId) {
        throw new WorkspaceTransitionReviewStaleError();
      }
      transitionId = materializedId;
    }
    if (transitionId === undefined) throw new WorkspaceTransitionReviewStaleError();

    const graph = await resolveTransitionProposalGraph(db, input.projectId, transitionId);
    assertSourceMembership(graph, input, requestKind);
    const precondition = canonicalPrecondition(input.precondition, graph.membership.refName);
    const runner =
      prepared?.runner ?? runnerStatusFromDurableGraph(graph, input.precondition, capabilities);
    const decisionFacts: ProtocolValue = {
      adapter: 'workspace_source_transition',
      operation: 'decide',
      request_kind: requestKind,
      transition_id: transitionId,
      workspace_id: input.workspaceId,
      outcome: input.outcome,
      source_selector_digest: input.precondition.sourceSelectorDigest,
      source_input_manifest_digest: input.precondition.sourceInputManifestDigest,
      ...(input.decisionReason === undefined
        ? {}
        : { decision_reason: input.decisionReason.trim() }),
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
        policyDigest: WORKSPACE_SOURCE_POLICY.resource.digest,
        authority: {
          async resolve() {
            return {
              actorContext: { actor: input.actor },
              observationScope: OBSERVATION_SCOPE,
              policy: WORKSPACE_SOURCE_POLICY.policy,
              policyResource: WORKSPACE_SOURCE_POLICY.resource,
              statements: graph.observations.map((observation) => ({
                statement: observation.statement as StatementObservation['statement'],
                issuerContext: observation.issuerContext,
              })),
            };
          },
        },
      },
    });
    if (input.outcome === 'rejected') {
      return {
        transitionId,
        transition: decided.view.transition,
        precondition: input.precondition,
        runner,
        decisionDigest: decided.decisionDigest,
      };
    }

    const projectionFacts: ProtocolValue = {
      adapter: 'workspace_source_transition',
      request_kind: requestKind,
      workspace_id: input.workspaceId,
      source_selector_digest: input.precondition.sourceSelectorDigest,
      source_input_manifest_digest: input.precondition.sourceInputManifestDigest,
    };
    const commitFacts: ProtocolValue = {
      adapter: 'workspace_source_transition',
      operation: 'commit',
      request_kind: requestKind,
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
        apply({ workspace }) {
          return {
            ...workspace,
            sourceArtifact:
              prepared?.sourceArtifact ??
              sourceArtifactForCommit(workspace, input.precondition.sourceSelectorDigest),
          };
        },
      },
    });
    if (committed.workspace === undefined) {
      throw new WorkspaceTransitionReviewStaleError();
    }
    return {
      transitionId,
      transition: committed.view,
      precondition: input.precondition,
      runner,
      decisionDigest: decided.decisionDigest,
      commit: committed.commit,
      workspace: committed.workspace,
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

function recoverablePreparationError(error: unknown): boolean {
  return (
    error instanceof ConflictError ||
    error instanceof WorkspaceSourceArtifactError ||
    error instanceof WorkspaceSourceInputsError ||
    error instanceof WorkspaceSourceRevertUnavailableError ||
    error instanceof WorkspaceTransitionReviewStaleError ||
    error instanceof TransitionProtocolError
  );
}

export async function decideWorkspaceSourceTransition(
  db: AnyDB,
  input: DecideWorkspaceSourceTransitionInput,
  capabilities: WorkspaceSourceTransitionCapabilities = {}
): Promise<DecideWorkspaceSourceTransitionResult> {
  let prepared: PreparedWorkspaceSourceTransition | undefined;
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
    if (!recoverablePreparationError(error)) throw error;
    if (input.transitionId === undefined) throw new WorkspaceTransitionReviewStaleError();
  }
  if (prepared !== undefined && !samePrecondition(input.precondition, prepared.precondition)) {
    throw new WorkspaceTransitionReviewStaleError();
  }
  return decidePreparedWorkspaceSourceTransition(
    db,
    input,
    prepared,
    input.change.mode === 'import' ? 'exact_source_import' : 'exact_source_edit',
    capabilities
  );
}

export async function decideWorkspaceSourceRevert(
  db: AnyDB,
  input: DecideWorkspaceSourceRevertInput,
  capabilities: WorkspaceSourceTransitionCapabilities = {}
): Promise<DecideWorkspaceSourceTransitionResult> {
  let prepared: PreparedWorkspaceSourceTransition | undefined;
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
    if (!recoverablePreparationError(error)) throw error;
    if (input.transitionId === undefined) throw new WorkspaceTransitionReviewStaleError();
  }
  if (prepared !== undefined && !samePrecondition(input.precondition, prepared.precondition)) {
    throw new WorkspaceTransitionReviewStaleError();
  }
  return decidePreparedWorkspaceSourceTransition(
    db,
    input,
    prepared,
    'exact_source_revert',
    capabilities
  );
}

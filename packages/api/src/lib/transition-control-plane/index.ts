import {
  type TransitionControlPlaneOptions as ApplicationTransitionControlPlaneOptions,
  type TransitionNativeStatementProvider as ApplicationTransitionNativeStatementProvider,
  attachTransitionStatementCommand,
  type BuiltTransitionProposal,
  inspectTransition as inspectTransitionQuery,
  proposeTransitionCommand,
  type TransitionActorRef,
  TransitionApplicationRequestConflictError,
  type TransitionExternalProviderResult,
  type TransitionExternalStatementDraft,
  type TransitionExternalStatementProvider,
  type TransitionInspectionPorts,
  type TransitionInspectionView,
  type TransitionNativeProviderResult,
  type TransitionOperationalResult,
  TransitionPredicateNotAllowedError,
  type TransitionProposeRequest,
  type TransitionSubjectRole,
  verifyTransitionCommand,
} from '@t3x-dev/application';
import {
  type AnyDB,
  findTransitionProposalByRequest,
  findTransitionStatementsByRequest,
  findTransitionVerificationReceipt,
  getTransitionPolicyBinding,
  recordTransitionStatementMembership,
  recordTransitionStatementMemberships,
  recordTransitionVerificationReceipt,
  resolveTransitionProposalGraph,
  type TransitionStatementMembership,
} from '@t3x-dev/storage';
import type { DecisionStatement, ProtocolValue } from '@t3x-dev/transition';
import type { ProposalGenerationModel, ProposalGenerationRequest } from '../proposal-generation';
import type { ProposalGenerationSupportVerifier } from '../proposal-generation-posture-provider';
import {
  type ProposalGenerationReviewProjection,
  projectProposalGenerationReview,
} from '../proposal-generation-projection';
import { resolveWorkspaceExtractionTransitionSource } from '../workspace-extraction-proposal';
import {
  buildWorkspaceSourceProposal,
  buildWorkspaceSourceRevertProposal,
  WORKSPACE_SOURCE_ARTIFACT_FORMAT,
} from '../workspace-source-transition';
import {
  buildWorkspaceYOpsProposal,
  WorkspaceTransitionReviewStaleError,
} from '../workspace-transition';
import { resolveApplicableTransitionPolicy } from './applicable-policy';
import { canonicalTransitionRequest, materializeTransitionProposal } from './materialize';

type ActorRef = TransitionActorRef;

export { TransitionApplicationRequestConflictError, TransitionPredicateNotAllowedError };

export type {
  TransitionExternalProviderResult,
  TransitionExternalStatementDraft,
  TransitionExternalStatementProvider,
  TransitionNativeProviderResult,
  TransitionOperationalResult,
  TransitionProposeRequest,
  TransitionSubjectRole,
};

export type TransitionNativeStatementProvider = ApplicationTransitionNativeStatementProvider<AnyDB>;

export interface TransitionControlPlaneOptions
  extends ApplicationTransitionControlPlaneOptions<AnyDB> {
  allowedExternalPredicateTypes?: readonly string[];
  proposalGeneration?: {
    resolveModel(input: {
      db: AnyDB;
      projectId: string;
      requester: ActorRef;
      request: ProposalGenerationRequest;
    }): Promise<ProposalGenerationModel>;
    supportVerifier?: ProposalGenerationSupportVerifier;
  };
}

export type TransitionControlPlaneView =
  TransitionInspectionView<ProposalGenerationReviewProjection>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
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
  const root = sourceArtifact.root;
  let normalizedRoot: ProtocolValue | undefined;
  if (root !== undefined) {
    if (
      !isRecord(root) ||
      typeof root.materialId !== 'string' ||
      typeof root.contentHash !== 'string'
    ) {
      throw new TypeError('Server-resolved exact-source root is malformed');
    }
    normalizedRoot = {
      material_id: root.materialId,
      content_hash: root.contentHash,
    };
  }
  return {
    artifact: {
      format: WORKSPACE_SOURCE_ARTIFACT_FORMAT,
      root_path: sourceArtifact.rootPath,
      ...(normalizedRoot === undefined ? {} : { root: normalizedRoot }),
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
): Promise<BuiltTransitionProposal> {
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
    const built = await buildWorkspaceSourceRevertProposal(db, {
      ...common,
      commitId: input.request.commitId,
    });
    return {
      ...built,
      preparationFacts: normalizedSourcePreparation(built.sourceArtifact),
    };
  }
  const built = await buildWorkspaceSourceProposal(db, {
    ...common,
    artifact: input.request.artifact,
    change:
      input.request.kind === 'exact_source_import'
        ? { mode: 'import', root: input.request.root }
        : { mode: 'edit', operations: input.request.operations },
  });
  return {
    ...built,
    preparationFacts: normalizedSourcePreparation(built.sourceArtifact),
  };
}

export async function proposeTransition(input: {
  db: AnyDB;
  projectId: string;
  requestId: string;
  actor: ActorRef;
  request: TransitionProposeRequest;
}): Promise<{ view: TransitionControlPlaneView; reused: boolean }> {
  return proposeTransitionCommand({
    projectId: input.projectId,
    requestId: input.requestId,
    actor: input.actor,
    request: input.request,
    ports: {
      canonicalTransitionRequest,
      findTransitionProposalByRequest: (request) =>
        findTransitionProposalByRequest(input.db, request),
      buildProposal: (request) => buildProposal(input.db, request),
      materializeTransitionProposal: (request) =>
        materializeTransitionProposal({ db: input.db, ...request }),
      inspectTransition: (request) => inspectTransition({ db: input.db, ...request }),
    },
  });
}

export async function inspectTransition(input: {
  db: AnyDB;
  projectId: string;
  transitionId: string;
  actor?: ActorRef;
  decision?: DecisionStatement;
}): Promise<TransitionControlPlaneView> {
  const ports: TransitionInspectionPorts<ProposalGenerationReviewProjection> = {
    resolveTransitionProposalGraph: ({ projectId, transitionId }) =>
      resolveTransitionProposalGraph(input.db, projectId, transitionId),
    getTransitionPolicyBinding: ({ projectId, refName }) =>
      getTransitionPolicyBinding(input.db, projectId, refName),
    resolveApplicableTransitionPolicy: ({ refPolicyBinding, requestKind, preparationFacts }) =>
      resolveApplicableTransitionPolicy({
        refPolicyBinding,
        requestKind,
        preparationFacts,
      }),
    projectProposalGenerationReview,
  };

  return inspectTransitionQuery(
    {
      projectId: input.projectId,
      transitionId: input.transitionId,
      actor: input.actor,
      decision: input.decision,
    },
    ports
  );
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
  return verifyTransitionCommand({
    projectId: input.projectId,
    transitionId: input.transitionId,
    requestId: input.requestId,
    actor: input.actor,
    options: input.options,
    ports: {
      canonicalTransitionRequest,
      findTransitionStatementsByRequest: (request) =>
        findTransitionStatementsByRequest(input.db, request),
      findTransitionVerificationReceipt: (request) =>
        findTransitionVerificationReceipt(input.db, request),
      resolveTransitionProposalGraph: (request) =>
        resolveTransitionProposalGraph(input.db, request.projectId, request.transitionId),
      recordTransitionVerification: ({ statementInputs, receipt }) =>
        input.db.transaction(async (tx) => {
          const statements = (
            await recordTransitionStatementMemberships(tx as AnyDB, statementInputs)
          ).map((item) => item.membership);
          const recordedReceipt = await recordTransitionVerificationReceipt(tx as AnyDB, receipt);
          return { statements, operationalResults: recordedReceipt.receipt.operationalResults };
        }),
      inspectTransition: (request) => inspectTransition({ db: input.db, ...request }),
      nowIso: () => new Date().toISOString(),
      nativeProviderContext: input.db,
    },
  });
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
  return attachTransitionStatementCommand({
    projectId: input.projectId,
    transitionId: input.transitionId,
    requestId: input.requestId,
    actor: input.actor,
    statement: input.statement,
    options: input.options,
    ports: {
      canonicalTransitionRequest,
      findTransitionStatementsByRequest: (request) =>
        findTransitionStatementsByRequest(input.db, request),
      resolveTransitionProposalGraph: (request) =>
        resolveTransitionProposalGraph(input.db, request.projectId, request.transitionId),
      recordTransitionStatementMembership: (request) =>
        recordTransitionStatementMembership(input.db, request),
      inspectTransition: (request) => inspectTransition({ db: input.db, ...request }),
    },
  });
}

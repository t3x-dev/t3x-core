import type { SourcedYOp, TransitionViewV1 } from '@t3x-dev/core';
import type { SchemaCompositionDraft } from './schemaModules';
import type { WorkspaceYOpsValue } from './workspaceYops';

export type WorkspaceStatus = 'draft' | 'ready_for_yops' | 'schema_review' | 'committed';

export type WorkspaceStatusFilter = 'all' | WorkspaceStatus;

export type WorkspaceSortKey = 'updated_desc' | 'title_asc';

export type SourceBundleType = 'chat' | 'document' | 'text' | 'prompt_run' | 'import';

export interface SourceBundleItem {
  id: string;
  type: SourceBundleType;
  title: string;
  description?: string;
  conversationId?: string;
  materialId?: string;
  contentHash?: string;
  tokenEstimate?: number;
  fileName?: string;
  runId?: string;
  format?: 'yaml' | 'json' | 'markdown' | 'text';
  previewTurns?: SourceConversationTurn[];
  previewText?: string;
}

export const WORKSPACE_SOURCE_ARTIFACT_FORMAT = 't3x.dev/workspace-source-artifact/v1' as const;

export interface WorkspaceSourceMaterialSelector {
  materialId: string;
  contentHash?: string;
}

export interface WorkspaceSourceResourceSelector extends WorkspaceSourceMaterialSelector {
  path: string;
}

/**
 * Application-owned source selection for the exact-source Workspace path.
 * Source bytes and secret values are deliberately absent and are re-resolved
 * by the server during Review and Decide.
 */
export interface WorkspaceSourceArtifact {
  format: typeof WORKSPACE_SOURCE_ARTIFACT_FORMAT;
  rootPath: string;
  root?: WorkspaceSourceMaterialSelector;
  resources: WorkspaceSourceResourceSelector[];
}

export interface SourceConversationTurn {
  id: string;
  role: 'user' | 'assistant';
  author: string;
  content: string;
  conversationId?: string;
  projectId?: string;
  pinnable?: boolean;
  rings?: Record<string, unknown> | null;
}

export type SchemaBindingMode = 'pinned' | 'draft_override';

export interface WorkspaceSchemaBinding {
  canonicalName?: string;
  schemaHash?: string;
  compositionId?: string;
  compositionRevision?: number;
  compositionHash?: string;
  schemaName: string;
  version: string;
  mode: SchemaBindingMode;
}

export interface WorkspaceCandidate {
  id: string;
  revision?: number;
  projectId: string;
  title: string;
  summary: string;
  status: WorkspaceStatus;
  updatedAt: string;
  baseCommitHash: string | null;
  targetBranch: string;
  sourceBundle: SourceBundleItem[];
  schemaBindings: WorkspaceSchemaBinding[];
  schemaComposition?: SchemaCompositionDraft;
  schemaCandidate: WorkspaceSchemaCandidate;
  schemaReview: WorkspaceSchemaReview;
  yopsDraft: WorkspaceYOpsDraft;
  outputTargets: WorkspaceOutputTarget[];
  sourceArtifact?: WorkspaceSourceArtifact;
  lastCommitHash?: string;
  commitOverride?: WorkspaceValidationOverride & { confirmedAt?: string };
  backendCandidateId?: string;
  extractionProposal?: WorkspaceExtractionProposal;
}

export interface WorkspaceExtractionProposal {
  schema: 't3x.dev/workspace-extraction-proposal/v1';
  sourceSelector: { type: 'conversation'; id: string; turnHashes: string[] };
  sourceSelectorDigest: string;
  baseCommitHash: string | null;
  mode: 'bootstrap' | 'incremental';
  operations: SourcedYOp[];
  actor: { kind: 'human' | 'agent' | 'service'; id: string };
  createdAt: string;
}

export interface WorkspaceValidationOverride {
  kind: 'schema_review';
  reason: string;
  blockers: string[];
}

export type WorkspaceStatusCounts = Record<WorkspaceStatusFilter, number>;

export type WorkspaceSchemaReviewVerdict = 'ready' | 'needs_review';

export interface WorkspaceSchemaReview {
  verdict: WorkspaceSchemaReviewVerdict;
  summary: string;
  gaps: string[];
}

export type WorkspaceProposalMode = 'fixture' | 'deterministic_scaffold' | 'llm';

export type WorkspaceProposalPosture = 'source_only' | 'guided' | 'recommend';

export type WorkspaceProposalOrigin = 'source_backed' | 'inferred' | 'recommended';

export interface WorkspaceProposalGenerationValue {
  path: string;
  before: { availability: 'available'; value: unknown } | { availability: 'unavailable' };
  after: { availability: 'available'; value: unknown } | { availability: 'unavailable' };
  changed: boolean;
}

export interface WorkspaceProposalGenerationGroup {
  id: string;
  origin: WorkspaceProposalOrigin;
  operationIndexes: number[];
  operations: unknown[];
  paths: string[];
  values: WorkspaceProposalGenerationValue[];
  evidence: unknown[];
  basis: unknown[];
  assumptions: string[];
  reason: string;
  challenges: Array<{
    path: string;
    before: { availability: 'available'; value: unknown } | { availability: 'unavailable' };
    after: { availability: 'available'; value: unknown } | { availability: 'unavailable' };
    priorEvidence: unknown[];
    priorEvidenceAvailability: 'unavailable';
    reason: string;
    impactPaths: string[];
  }>;
}

export interface WorkspaceProposalGenerationProjection {
  posture: WorkspaceProposalPosture;
  profileResource: { uri: string; mediaType: string; digest: string };
  requestedBy: { kind: 'human' | 'agent' | 'service'; id: string };
  generator: { kind: 'human' | 'agent' | 'service'; id: string };
  provider: string;
  model: string;
  run: { id: string; recordedAt: string };
  counts: { sourceBacked: number; inferred: number; recommended: number; challenges: number };
  groups: WorkspaceProposalGenerationGroup[];
  warnings: string[];
  verification: {
    status: 'pending' | 'passed' | 'failed';
    findings: Array<{
      severity: 'error' | 'warning' | 'info';
      code: string;
      message: string;
      path?: string;
    }>;
  };
}

export interface WorkspaceProposalGenerationView {
  transition_id: string;
  project_id: string;
  workspace_id: string;
  request_id: string;
  created_at: string;
  precondition: {
    workspace_revision: number;
    ref_name: string;
    ref_head: string | null;
    effect_digest: string;
    proposal_digest: string;
    statement_digests: string[];
    policy_digest: string | null;
  };
  transition: TransitionViewV1;
  statements: unknown[];
  generation: WorkspaceProposalGenerationProjection;
}

export type WorkspaceSchemaFieldStatus =
  | 'covered'
  | 'missing'
  | 'needs_confirmation'
  | 'type_mismatch'
  | 'extra';

export interface WorkspaceSchemaCandidateField {
  id: string;
  path: string;
  label: string;
  type: string;
  required: boolean;
  status: WorkspaceSchemaFieldStatus;
  value?: string;
  evidence?: string;
  sourceRefs?: number;
  children?: WorkspaceSchemaCandidateField[];
}

export interface WorkspaceSchemaCandidate {
  summary: string;
  proposalMode?: WorkspaceProposalMode;
  fields: WorkspaceSchemaCandidateField[];
  promptCompileInputs?: WorkspacePromptCompileInputs;
}

export interface WorkspacePromptCompileInputs {
  relations?: Array<{ type: string; from: string; to: string }>;
  variableValues?: Record<string, unknown>;
  contextContents?: Record<string, string>;
  resourceContents?: Record<string, string>;
}

export interface WorkspaceYOpsDraftOperation {
  id: string;
  op: string;
  path: string;
  summary: string;
  beforeValue?: WorkspaceYOpsValue;
  afterValue?: WorkspaceYOpsValue;
  reason?: string;
  sourceRefs?: string[];
}

export interface WorkspaceYOpsDraft {
  id: string;
  proposalMode?: WorkspaceProposalMode;
  operations: WorkspaceYOpsDraftOperation[];
}

export type WorkspaceOutputTargetType = 'document' | 'webhook' | 'export';

export type WorkspaceOutputTargetFormat = 'markdown' | 'json' | 'yaml' | 'html';

export type WorkspaceOutputTargetStatus = 'draft_target';

export type WorkspaceOutputTargetLeafType = 'document' | 'api' | 'report';

export interface WorkspaceOutputTarget {
  id: string;
  title: string;
  type: WorkspaceOutputTargetType;
  format: WorkspaceOutputTargetFormat;
  status: WorkspaceOutputTargetStatus;
  leafType?: WorkspaceOutputTargetLeafType;
  instruction?: string;
  constraints?: string[];
  sourceScope?: string;
  previewTitle?: string;
  previewBody?: string;
}

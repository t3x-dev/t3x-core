import type { WorkspaceSchemaDefinitionSnapshot } from './schema-studio';
import type { TransitionControlPlaneView, TransitionProtocolValue } from './types';
export interface WorkspaceCommitChanges {
  projectId: string;
  commitDigest: string;
  committedAt: string;
  source: 'authoring' | 'commit_diff';
  base: TransitionProtocolValue;
  current: TransitionProtocolValue;
  actions: Array<{
    action: WorkspaceAuthoringAction;
    cards: WorkspaceAuthoringCard[];
    before: TransitionProtocolValue;
    after: TransitionProtocolValue;
  }>;
  nextBeforeSequence: number | null;
  netDiff: WorkspaceAuthoringCard[];
  schemaCards: import('./assistant-schema-settings').AssistantSchemaSettingsView[];
  schemaReview: import('./schema-studio').WorkspaceFullSchemaReview | null;
}
export interface WorkspaceAuthoringActor {
  kind: 'human' | 'agent' | 'service';
  id: string;
  delegator?: { kind: string; id: string };
}
export interface WorkspaceAuthoringAction {
  actionId: string;
  sequence: number;
  channel: 'manual' | 'mcp' | 'assistant' | 'import';
  actor: WorkspaceAuthoringActor;
  publishedAt: string;
  beforeRevision: number;
  afterRevision: number;
  operations: TransitionProtocolValue[];
  reason?: string;
  affectedNodeCount?: number;
  affectedNodeIds?: string[];
  generation?: { transitionId: string; preparationDigest: string; preparation: unknown };
  deletionConfirmation?: { status: 'required' | 'confirmed'; paths: string[] };
}
export interface WorkspaceAuthoringCard {
  nodeId: string;
  path: string;
  beforePath?: string;
  afterPath?: string;
  before?: TransitionProtocolValue;
  after?: TransitionProtocolValue;
}
export interface WorkspaceAuthoringView {
  schema: 't3x.application/workspace-authoring-view/v1';
  projectionVersion: number;
  workspaceRevision: number;
  compositionRevision: number;
  basis: { refName: string; refHead: string | null; baseDigest: string };
  synchronization?: { currentRefHead: string | null; required: boolean };
  sources?: Array<{
    id: string;
    title?: string;
    type?: string;
    materialId?: string;
    conversationId?: string;
  }>;
  pendingCandidates?: Array<{
    transitionId: string;
    workspaceRevision: number;
    createdAt: string;
    status: 'candidate' | 'stale';
  }>;
  candidateWindowTruncated?: boolean;
  actions: WorkspaceAuthoringAction[];
  nextBeforeSequence: number | null;
  selected: {
    action: WorkspaceAuthoringAction;
    cards: WorkspaceAuthoringCard[];
    before?: TransitionProtocolValue;
    after?: TransitionProtocolValue;
  } | null;
  base?: TransitionProtocolValue;
  current?: TransitionProtocolValue;
  /** Exact effective binding at workspaceRevision, not the latest Studio candidate. */
  currentSchema?: WorkspaceSchemaDefinitionSnapshot;
  /** Net content or effective Schema change. Omitted when the Base contract is unknown. */
  hasChanges?: boolean;
  /** Net effective Schema change. Omitted when the Base contract is unknown. */
  schemaHasChanges?: boolean;
  netDiff: WorkspaceAuthoringCard[];
  node: {
    nodeId: string;
    path: string | null;
    state: 'present' | 'deleted' | 'unknown';
    current?: TransitionProtocolValue;
    entries: Array<{
      actionId: string;
      sequence: number;
      revision: number;
      channel: WorkspaceAuthoringAction['channel'];
      actor: WorkspaceAuthoringActor;
      publishedAt: string;
      ownerNodeId: string;
      beforePath?: string;
      afterPath?: string;
      before?: TransitionProtocolValue;
      after?: TransitionProtocolValue;
      isSelected: boolean;
    }>;
  } | null;
}
export interface WorkspaceAuthoringRead {
  action_id?: string;
  node_id?: string;
  before_sequence?: number;
  limit?: number;
}
export interface InitializeWorkspaceAuthoringInput {
  request_id: string;
  expected_workspace_revision: number;
  expected_ref_head: string | null;
  legacy_document?: TransitionProtocolValue;
}
export interface PublishWorkspaceAuthoringInput {
  request_id: string;
  expected_workspace_revision: number;
  expected_revision: number;
  expected_ref_head: string | null;
  operations: TransitionProtocolValue[];
  reason?: string;
}
export interface WorkspaceAuthoringOutcome {
  kind: 'published' | 'reused' | 'no_change';
  workspaceRevision: number;
  compositionRevision: number;
  action?: WorkspaceAuthoringAction;
  receipt?: { actionId: string; outcome: 'no_change'; message: string };
}
export interface WorkspaceAuthoringCapability {
  reconcile(
    projectId: string,
    workspaceId: string,
    input: Omit<InitializeWorkspaceAuthoringInput, 'legacy_document'>
  ): Promise<{ kind: 'reconciled' | 'reused' | 'no_change'; workspaceRevision: number }>;
  confirmDeletion(
    projectId: string,
    workspaceId: string,
    actionId: string,
    input: {
      expected_workspace_revision: number;
      expected_revision: number;
      expected_ref_head: string | null;
    }
  ): Promise<{ workspaceRevision: number }>;
  prepareReview(
    projectId: string,
    workspaceId: string,
    input: Omit<PublishWorkspaceAuthoringInput, 'operations'>
  ): Promise<{
    view: TransitionControlPlaneView;
    authoring: {
      workspaceId: string;
      compositionRevision: number;
      actionCount: number;
      preparationDigest: string;
    };
    reused: boolean;
    schemaReview?: import('./schema-studio').WorkspaceFullSchemaReview;
  }>;
  read(
    projectId: string,
    workspaceId: string,
    query?: WorkspaceAuthoringRead
  ): Promise<WorkspaceAuthoringView>;
  initialize(
    projectId: string,
    workspaceId: string,
    input: InitializeWorkspaceAuthoringInput
  ): Promise<Pick<WorkspaceAuthoringView, 'workspaceRevision' | 'compositionRevision' | 'basis'>>;
  publish(
    projectId: string,
    workspaceId: string,
    input: PublishWorkspaceAuthoringInput
  ): Promise<WorkspaceAuthoringOutcome>;
  publishCandidate(
    projectId: string,
    workspaceId: string,
    transitionId: string,
    input: { request_id: string }
  ): Promise<WorkspaceAuthoringOutcome>;
}

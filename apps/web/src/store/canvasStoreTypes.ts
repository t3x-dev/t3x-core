import type { Connection, Edge, EdgeChange, Node, NodeChange } from '@xyflow/react';
import type { ConflictReport } from '@/lib/api/commits';
import type { CommitV3, MergeState } from '../types/merge';
import type {
  CanvasNodeData,
  ConversationConstraints,
  DraftConstraintOverrides,
  LeafType,
  NodeKind,
} from '../types/nodes';

// Shared types
export type NotifyCallback = (message: string, type: 'success' | 'error' | 'warning') => void;
export type DraftBranchMode = 'force-main' | 'select' | 'branch-only' | 'blocked';
export type CommitTone = 'main-latest' | 'main-history' | 'branch-latest' | 'branch-history';
export type DeletionConfirmation = {
  nodeIds: string[];
  edgeIds: string[];
  message: string;
  onConfirm: () => void;
} | null;

// Merge slice interface
export interface MergeSlice {
  mergeState: MergeState | null;
  mergeLoading: boolean;
  mergeError: string | null;
  startMerge: (sourceHash: string, targetHash: string) => Promise<void>;
  resolveSimilarPair: (index: number, pick: 'source' | 'target') => void;
  toggleKeep: (side: 'source' | 'target', index: number) => void;
  executeMerge: (message: string) => Promise<CommitV3>;
  cancelMerge: () => void;
  clearMergeError: () => void;
}

// Leaf panel slice interface
export interface LeafPanelSlice {
  leafPanelOpen: boolean;
  leafPanelCommitId?: string;
  leafCreating: boolean;
  openLeafPanel: (commitId: string) => void;
  closeLeafPanel: () => void;
  addLeafNode: (leafType: LeafType) => Promise<string | null>;
  removeLeafFromNode: (commitNodeId: string, leafId: string) => Promise<void>;
}

// Node CRUD slice interface
export interface NodeSlice {
  loadProjectData: (projectId: string) => Promise<void>;
  refreshLeaves: (projectId: string) => Promise<void>;
  clearCanvas: () => void;
  addNode: (kind: NodeKind, position?: { x: number; y: number }) => Promise<void>;
  addDraftNode: (position?: { x: number; y: number }) => Promise<void>;
  updateNode: (id: string, patch: Partial<CanvasNodeData>) => void;
  updateNodeId: (oldId: string, newId: string) => void;
}

// Commit operations slice interface
export interface CommitSlice {
  commitPendingCommit: (id: string) => void;
  addPendingCommitFromConversation: (conversationId: string) => Promise<void>;
  addConversationFromCommit: (commitId: string) => Promise<void>;
  addPendingCommitFromCommit: (commitId: string) => void;
  addUnitFromUnit: (unitId: string) => void;
  createMergePendingCommit: (commitId: string) => Promise<string | null>;
  getPendingCommitBranchMode: (commitId: string) => DraftBranchMode;
  canCreatePendingCommitFromConversation: (conversationId: string) => boolean;
}

// Full combined canvas store state
export type CanvasState = MergeSlice &
  LeafPanelSlice &
  NodeSlice &
  CommitSlice & {
    nodes: Node<CanvasNodeData>[];
    edges: Edge[];
    hasMainCommit: boolean;
    latestMainCommitId?: string;
    // Project data loading state
    projectId: string | null;
    loading: boolean;
    loadError: Error | null;
    // Notification callback
    notifyCallback: NotifyCallback | null;
    setNotifyCallback: (cb: NotifyCallback | null) => void;
    // Node modal state
    openNodeId: string | null;
    modalViewMode: 'conversation' | 'commit' | null;
    openNodeModal: (nodeId: string, viewMode?: 'conversation' | 'commit') => void;
    closeNodeModal: () => void;
    // Deletion confirmation state
    deletionConfirmation: DeletionConfirmation;
    onNodesChange: (changes: NodeChange[]) => void;
    onEdgesChange: (changes: EdgeChange[]) => void;
    onConnect: (connection: Connection) => void;
    getCommitTone: (commitId: string) => CommitTone;
    resetToSingleConversation: () => void;
    loadDemoData: () => void;
    // Conversation constraints management
    saveConversationConstraints: (
      conversationId: string,
      constraints: ConversationConstraints
    ) => void;
    getConversationConstraints: (conversationId: string) => ConversationConstraints | undefined;
    // Pending commit constraint overrides
    updatePendingCommitConstraintOverrides: (
      commitId: string,
      overrides: Partial<DraftConstraintOverrides>
    ) => void;
    getPendingCommitEffectiveConstraints: (commitId: string) =>
      | {
          clauses: ConversationConstraints['clauses'];
          must_have: string[];
          mustnt_have: string[];
        }
      | undefined;
    // Get source conversation for a pending commit
    getSourceConversationForPendingCommit: (commitId: string) => Node<CanvasNodeData> | undefined;
    // Check if a conversation has any downstream pending commits (for locking)
    hasDownstreamPendingCommits: (conversationId: string) => boolean;
    // Deletion confirmation methods
    confirmDeletion: () => void;
    cancelDeletion: () => void;
    // Get direct upstream source nodes for a pending commit
    getUpstreamSourceNodes: (nodeId: string) => Node<CanvasNodeData>[];
    // Conflict detection state
    commitConflicts: Record<string, ConflictReport | null>;
    dismissedConflicts: Record<string, boolean>;
    showConflictPanel: string | null; // commit hash of the conflict panel being shown
    setCommitConflicts: (commitHash: string, report: ConflictReport | null) => void;
    dismissConflict: (commitHash: string) => void;
    openConflictPanel: (commitHash: string) => void;
    closeConflictPanel: () => void;
  };

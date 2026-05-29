import type { Connection, Edge, EdgeChange, Node, NodeChange } from '@xyflow/react';
import type { MergeState } from '../types/merge';
import type {
  CanvasNodeData,
  ConversationConstraints,
  DraftConstraintOverrides,
  EmbeddedLeaf,
} from '../types/nodes';
import type { NotifyCallback } from './shared';

export type { NotifyCallback };
export type DraftBranchMode = 'force-main' | 'select' | 'branch-only' | 'blocked';
export type CommitTone = 'main-latest' | 'main-history' | 'branch-latest' | 'branch-history';
export type DeletionConfirmation = {
  nodeIds: string[];
  edgeIds: string[];
  message: string;
  onConfirm: () => void;
} | null;

// Merge slice interface (passive — async I/O lives in useCanvasMergeActions)
export interface MergeSlice {
  mergeState: MergeState | null;
  mergeLoading: boolean;
  mergeError: string | null;
  setMergeLoading: (loading: boolean) => void;
  setMergeError: (error: string | null) => void;
  setMergePrepared: (mergeState: MergeState) => void;
  appendMergeCommit: (node: Node<CanvasNodeData>, edges: Edge[]) => void;
  cancelMerge: () => void;
  clearMergeError: () => void;
}

// Leaf panel slice interface (passive — async I/O lives in useCanvasLeafActions)
export interface LeafPanelSlice {
  leafPanelOpen: boolean;
  leafPanelCommitId?: string;
  leafCreating: boolean;
  openLeafPanel: (commitId: string) => void;
  closeLeafPanel: () => void;
  setLeafCreating: (leafCreating: boolean) => void;
  embedLeafInNode: (commitNodeId: string, leaf: import('../types/nodes').EmbeddedLeaf) => void;
  removeLeafFromNodeState: (commitNodeId: string, leafId: string) => void;
}

// Node slice interface (passive — async I/O lives in useCanvasNodeActions)
export interface NodeSlice {
  setLoading: (loading: boolean) => void;
  setLoadError: (loadError: Error | null) => void;
  setProjectData: (input: {
    nodes: Node<CanvasNodeData>[];
    edges: Edge[];
    hasMainCommit: boolean;
    latestMainCommitId: string | undefined;
    hasDbPositions: boolean;
  }) => void;
  mergeProjectData: (input: {
    nodes: Node<CanvasNodeData>[];
    edges: Edge[];
    hasMainCommit: boolean;
    latestMainCommitId: string | undefined;
    hasDbPositions: boolean;
  }) => void;
  setLeavesByCommit: (leavesByCommit: Map<string, EmbeddedLeaf[]>) => void;
  addToNodes: (node: Node<CanvasNodeData>) => void;
  clearCanvas: () => void;
  updateNode: (id: string, patch: Partial<CanvasNodeData>) => void;
  updateNodeId: (oldId: string, newId: string) => void;
}

// Commit operations slice interface (passive — async I/O lives in useCanvasCommitActions)
export interface CommitSlice {
  commitPendingCommit: (id: string) => void;
  addPendingCommitFromCommit: (commitId: string) => void;
  addUnitFromUnit: (unitId: string) => void;
  appendNodeAndEdge: (node: Node<CanvasNodeData>, edge: Edge) => void;
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
    // True when at least one node was loaded with a DB-saved position.
    // Used by auto-layout effect: skip ELK if user/ELK has previously set positions.
    hasDbPositions: boolean;
    // Project data loading state
    projectId: string | null;
    loading: boolean;
    loadError: Error | null;
    // Notification callback
    notifyCallback: NotifyCallback | null;
    setNotifyCallback: (cb: NotifyCallback | null) => void;
    // Side-effect callback for conversation deletion (wired by useCanvasDeletionWiring).
    // Per v2 §2.5, the store doesn't import @/queries — it emits, the hook calls.
    deleteConversationCallback: ((conversationId: string) => void) | null;
    setDeleteConversationCallback: (cb: ((conversationId: string) => void) | null) => void;
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
  };

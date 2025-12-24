/**
 * Entity types for T3X domain models
 */

/**
 * Project - Top-level container for conversations
 */
export interface Project {
  projectId: string;
  name: string;
  createdAt: Date;
  metadata?: Record<string, unknown>;
}

export interface ProjectWithStats extends Project {
  stats: {
    conversationsCount: number;
    turnsCount: number;
    commitsCount: number;
    branchesCount: number;
    draftsCount: number;
  };
}

/**
 * Conversation - A thread of turns within a project
 */
export interface Conversation {
  conversationId: string;
  projectId: string;
  title?: string;
  createdAt: Date;
  metadata?: Record<string, unknown>;
}

/**
 * Turn - A single message in a conversation
 */
export type TurnRole = 'user' | 'assistant' | 'system' | 'tool';

export interface Turn {
  turnHash: string;
  parentTurnHash?: string;
  projectId: string;
  conversationId: string;
  role: TurnRole;
  content: string;
  createdAt: Date;
  metadata?: Record<string, unknown>;
}

/**
 * Commit - A versioned snapshot of semantic state
 */
export interface Commit {
  commitHash: string;
  parentHashes: string[];
  projectId: string;
  branchId: string;
  message?: string;
  turnWindow: {
    startTurnHash: string;
    endTurnHash: string;
  };
  facetSnapshot: FacetSnapshot[];
  pipelineConfig: Record<string, unknown>;
  createdAt: Date;
}

export interface FacetSnapshot {
  facetId: string;
  value: unknown;
  confidence: number;
  sourceRefs: string[];
}

/**
 * Branch - A named reference to a commit chain
 */
export interface Branch {
  branchId: string;
  projectId: string;
  name: string;
  headCommitHash?: string;
  createdAt: Date;
}

/**
 * Draft - A work-in-progress semantic state
 */
export type DraftStatus = 'pending' | 'approved' | 'rejected';

export interface Draft {
  draftId: string;
  projectId: string;
  conversationId: string;
  status: DraftStatus;
  content: string;
  metadata?: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * MergeResult - Result of a three-way merge operation
 */
export interface MergeResult {
  mergeId: string;
  projectId: string;
  baseCommitHash: string;
  oursCommitHash: string;
  theirsCommitHash: string;
  resultCommitHash?: string;
  conflicts: MergeConflict[];
  status: 'pending' | 'resolved' | 'failed';
  createdAt: Date;
}

export interface MergeConflict {
  facetId: string;
  baseValue: unknown;
  oursValue: unknown;
  theirsValue: unknown;
  resolution?: unknown;
}

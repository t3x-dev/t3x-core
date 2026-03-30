/**
 * Merge Type Definitions for WebUI
 *
 * Tree-primary merge types. The core merge system now uses path-based
 * results (MergeResult from @t3x-dev/core). This file provides
 * WebUI-specific types that wrap and extend those.
 */

import type { MergeResult, SlotConflict } from '@t3x-dev/core';

// Re-export core merge types for consumers
export type { MergeResult, SlotConflict };

// ============================================================================
// Legacy ContentNode-based types (kept for UI component compatibility)
// These types represent the display layer for merge UI.
// ============================================================================

/** Word-level diff segment */
export interface WordDiffSegment {
  type: 'unchanged' | 'added' | 'removed';
  text: string;
}

/** A node for merge display (source tracing) */
export interface ContentNode {
  id: string;
  text: string;
  confidence?: number;
  source?: {
    conversation_id?: string;
    turn_hash?: string;
    start_char?: number;
    end_char?: number;
  };
}

/** A pair of similar nodes the user must choose between */
export interface MergeSimilarPair {
  source: ContentNode;
  target: ContentNode;
  wordDiff: WordDiffSegment[];
  resolution?: 'source' | 'target';
}

/** A unique node the user can keep or discard */
export interface MergeCandidate {
  node: ContentNode;
  keep: boolean;
}

/** Legacy merge result (node-based, used by some UI components) */
export interface Merge2WayResult {
  identical: ContentNode[];
  similarPairs: MergeSimilarPair[];
  onlyInSource: MergeCandidate[];
  onlyInTarget: MergeCandidate[];
}

/** LLM-suggested merge text */
export interface MergeSuggestion {
  text: string;
  confidence?: number;
}

// ============================================================================
// WebUI Merge Types (tree-primary)
// ============================================================================

/**
 * A merge conflict with path-based identification.
 * Wraps the core MergeResult.conflicts entries for UI consumption.
 */
export interface MergeConflictEntry {
  path: string;
  slotConflicts: SlotConflict[];
}

/**
 * Current merge operation state in canvas store (tree-primary)
 */
export interface MergeState {
  /** Source commit hash */
  sourceHash: string;

  /** Target commit hash */
  targetHash: string;

  /** Optional source branch name */
  sourceBranch?: string;

  /** Optional target branch name */
  targetBranch?: string;

  /** Prepared merge result from API */
  prepared: MergeResult;
}

// ============================================================================
// Merge Draft Types (for Merge Workspace)
// ============================================================================

export type MergeDraftStatus = 'pending' | 'committed' | 'cancelled';

/**
 * Merge draft from API
 */
export interface MergeDraft {
  draftId: string;
  projectId: string;
  sourceHash: string;
  targetHash: string;
  sourceBranch?: string | null;
  targetBranch?: string | null;
  prepared: MergeResult;
  status: MergeDraftStatus;
  message?: string | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * Turn with context highlight information
 */
export interface TurnWithContext {
  turn_hash: string;
  parent_turn_hash: string | null;
  project_id: string;
  conversation_id: string;
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string;
  language?: string | null;
  rings?: unknown;
  created_at: string;
  is_target: boolean;
  highlight?: {
    start: number;
    end: number;
  };
}

/**
 * Turn context data from API (for source tracing)
 */
export interface TurnContextData {
  target_turn: TurnWithContext;
  context: TurnWithContext[];
  conversation_id: string;
  conversation_title: string | null;
}

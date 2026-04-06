/**
 * Pipeline Orchestrator Types
 *
 * Types for the 8-step intelligence layer around the extraction pipeline.
 * Uses composition — does NOT extend or modify existing PipelineContext.
 * MeaningPipeline and its 9 agents remain completely unaware of this layer.
 */

import type { RelationType, SemanticContent } from '../semantic/types';

// ── Step 1: Session State ──

/** Pipeline decision: should we extract? */
export type PipelineDecision = 'extract' | 'wait' | 'skip';

/** Computed from yops_log + turn count — never stored separately */
export interface SessionContext {
  turnCount: number;
  extractionCount: number;
  lastExtractionTurnCount: number;
}

// ── Step 3: Drift Detection ──

export interface DriftDecision {
  choice: 'keep_old' | 'keep_new' | 'keep_both_separate' | 'keep_both_together';
  relation?: RelationType;
  newTopic?: string;
}

export interface DriftResult {
  drifted: boolean;
  relationType?: RelationType;
  newTopicName?: string;
}

// ── Step 6: Advisory Questions ──

export interface AdvisoryQuestion {
  id: string;
  type: 'vagueness' | 'structural';
  nodeId: string;
  /** @deprecated Use nodeId */
  frameId?: string;
  slotKey?: string;
  question: string;
  currentValue?: unknown;
}

// ── Step 8: Answer Applier ──

export interface UserAnswer {
  question_id: string;
  /** For drift questions: one of the 4 choices */
  drift_choice?: DriftDecision['choice'];
  /** For advisory questions: free text answer */
  answer_text?: string;
  /** For advisory questions: selected option */
  selected_value?: unknown;
}

// ── Orchestrator Context (composition, not inheritance) ──

export interface PipelineOrchestratorContext {
  projectId: string;
  conversationId: string;
  session: SessionContext;
  allTurns: Array<{ role: string; content: string; turn_hash: string }>;
  newTurns: Array<{ role: string; content: string; turn_hash: string }>;
  currentSnapshot: SemanticContent;
  driftDecision?: DriftDecision;
}

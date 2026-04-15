/**
 * Answer Applier (Step 8)
 *
 * Converts user answers (advisory question responses) into YOps operations.
 * Handles vagueness corrections and structural adjustments.
 *
 * Drift choices (2/3/4) require LLM extraction or project creation — those are
 * orchestrated by the API layer. This module handles the pure YOps generation:
 * - Drift choice 1 (keep old): no-op
 * - Drift choice 2 (keep new): generates collapse YOps for old nodes
 * - Vagueness answer: generates set YOp for slot value
 * - Structural answer: generates relate YOp
 *
 * @see docs/hlq_docs/2026-03-20-agentic-pipeline-8step-design.md §4.8
 * @see https://github.com/t3x-dev/t3x-core/issues/622
 */

import { flattenTrees } from '../semantic/tree';
import type { FlatNode, SemanticContent } from '../semantic/types';
import { validateIntegrity } from '../semantic/validate';
import { applyYOps } from '../t3x-yops/engine';
import type { YOp } from '../t3x-yops/types';
import type { UserAnswer } from './types';

// ── Result types ──

export interface AnswerApplyResult {
  applied: boolean;
  yops?: YOp[];
  snapshot?: SemanticContent;
  errors?: string[];
}

// ── Vagueness answer → set YOp ──

/**
 * Generate a set YOp from a vagueness answer.
 * Replaces a slot value with the user's precise answer.
 */
export function applyVaguenessAnswer(
  snapshot: SemanticContent,
  nodeId: string,
  slotKey: string,
  newValue: unknown
): AnswerApplyResult {
  const nodes: FlatNode[] = flattenTrees(snapshot.trees);
  const node = nodes.find((f: FlatNode) => f.id === nodeId);
  if (!node) {
    return { applied: false, errors: [`Node ${nodeId} not found`] };
  }
  if (!(slotKey in node.slots)) {
    return { applied: false, errors: [`Slot ${slotKey} not found in node ${nodeId}`] };
  }

  const resolvedValue =
    typeof newValue === 'string' || typeof newValue === 'number' ? newValue : String(newValue);

  const yops: YOp[] = [{ set: { path: `${nodeId}/${slotKey}`, value: resolvedValue } }];

  return applyAndValidate(snapshot, yops);
}

// ── Structural answer → relate YOp ──

/**
 * Generate a relate YOp from a structural answer.
 * Moves a node under a different parent by updating the relation.
 */
export function applyStructuralAnswer(
  snapshot: SemanticContent,
  nodeId: string,
  newParentId: string
): AnswerApplyResult {
  const nodes: FlatNode[] = flattenTrees(snapshot.trees);
  if (!nodes.some((f: FlatNode) => f.id === nodeId)) {
    return { applied: false, errors: [`Node ${nodeId} not found`] };
  }
  if (!nodes.some((f: FlatNode) => f.id === newParentId)) {
    return { applied: false, errors: [`Parent node ${newParentId} not found`] };
  }
  if (nodeId === newParentId) {
    return { applied: false, errors: ['Cannot set node as its own parent'] };
  }

  // Remove existing depends relations pointing TO this node, then add new one
  const relationsToRemove = snapshot.relations.filter(
    (r) => r.to === nodeId && r.type === 'depends'
  );

  const yops: YOp[] = [
    ...relationsToRemove.map((r): YOp => ({ unrelate: { from: r.from, to: r.to, type: r.type } })),
    { relate: { from: newParentId, to: nodeId, type: 'depends' } },
  ];

  return applyAndValidate(snapshot, yops);
}

// ── Drift choice 2 → collapse YOps ──

/**
 * Generate collapse YOps for drift choice 2 (keep new).
 * Drops all root trees from the snapshot.
 */
export function generateCollapseYOps(snapshot: SemanticContent): YOp[] {
  return snapshot.trees.map((tree): YOp => ({ drop: { path: tree.key } }));
}

// ── Dispatch answer ──

/**
 * Apply a single user answer to the current snapshot.
 * Routes to the appropriate handler based on answer type.
 *
 * Returns the yops + updated snapshot, or errors if invalid.
 */
export function applyAnswer(
  snapshot: SemanticContent,
  answer: UserAnswer,
  questionType?: 'vagueness' | 'structural',
  questionNodeId?: string,
  questionSlotKey?: string
): AnswerApplyResult {
  // Drift answers
  if (answer.drift_choice) {
    if (answer.drift_choice === 'keep_old') {
      return { applied: true, yops: [], snapshot };
    }
    if (answer.drift_choice === 'keep_new') {
      const yops = generateCollapseYOps(snapshot);
      return applyAndValidate(snapshot, yops);
    }
    // keep_both_separate and keep_both_together require API-layer orchestration
    // (project creation / LLM extraction) — return intent for API to handle
    return {
      applied: false,
      errors: [`Drift choice '${answer.drift_choice}' requires API-layer orchestration`],
    };
  }

  // Advisory answers
  if (questionType === 'vagueness' && questionNodeId && questionSlotKey) {
    const value = answer.selected_value ?? answer.answer_text;
    if (value === undefined || value === null) {
      return { applied: false, errors: ['No value provided for vagueness answer'] };
    }
    return applyVaguenessAnswer(snapshot, questionNodeId, questionSlotKey, value);
  }

  if (questionType === 'structural' && questionNodeId) {
    const parentId = typeof answer.selected_value === 'string' ? answer.selected_value : undefined;
    if (!parentId) {
      return { applied: false, errors: ['No parent node ID provided for structural answer'] };
    }
    return applyStructuralAnswer(snapshot, questionNodeId, parentId);
  }

  return { applied: false, errors: ['Could not determine answer type'] };
}

// ── Internal ──

function applyAndValidate(snapshot: SemanticContent, yops: YOp[]): AnswerApplyResult {
  if (yops.length === 0) {
    return { applied: true, yops, snapshot };
  }

  const result = applyYOps(snapshot, yops);
  if (!result.ok) {
    return {
      applied: false,
      errors: [`Failed to apply YOps: ${result.error?.message ?? 'unknown'}`],
    };
  }

  const newSnapshot: SemanticContent = { trees: result.trees, relations: result.relations };
  const validation = validateIntegrity(newSnapshot);
  if (!validation.valid) {
    return {
      applied: false,
      errors: validation.errors.map((e) => `${e.type}: ${e.message}`),
    };
  }

  return { applied: true, yops, snapshot: newSnapshot };
}

/**
 * Answer Applier (Step 8)
 *
 * Converts user answers (advisory question responses) into Delta operations.
 * Handles vagueness corrections and structural adjustments.
 *
 * Drift choices (2/3/4) require LLM extraction or project creation — those are
 * orchestrated by the API layer. This module handles the pure delta generation:
 * - Drift choice 1 (keep old): no-op
 * - Drift choice 2 (keep new): generates collapse delta for old nodes
 * - Vagueness answer: generates update delta for slot value
 * - Structural answer: generates relation update delta
 *
 * @see docs/hlq_docs/2026-03-20-agentic-pipeline-8step-design.md §4.8
 * @see https://github.com/t3x-dev/t3x-core/issues/622
 */

import { applyDelta } from '../semantic/delta';
import type { Delta, FlatNode, SemanticContent, TreeChange } from '../semantic/types';
import { flattenTrees } from '../semantic/tree';
import { validateIntegrity } from '../semantic/validate';
import type { UserAnswer } from './types';

// ── Result types ──

export interface AnswerApplyResult {
  applied: boolean;
  delta?: Delta;
  snapshot?: SemanticContent;
  errors?: string[];
}

// ── Vagueness answer → update delta ──

/**
 * Generate an update delta from a vagueness answer.
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

  const delta: Delta = {
    changes: [{ action: 'update', target_path: nodeId, slots: { [slotKey]: resolvedValue } }],
  };

  return applyAndValidate(snapshot, delta);
}

// ── Structural answer → relation delta ──

/**
 * Generate a relation update delta from a structural answer.
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

  // Remove existing depends relations pointing TO this node
  const relationsToRemove = snapshot.relations.filter(
    (r) => r.to === nodeId && r.type === 'depends'
  );

  const delta: Delta = {
    changes: [],
    remove_relations:
      relationsToRemove.length > 0
        ? relationsToRemove.map((r) => ({ from: r.from, to: r.to, type: r.type }))
        : undefined,
    new_relations: [{ from: newParentId, to: nodeId, type: 'depends' }],
  };

  return applyAndValidate(snapshot, delta);
}

// ── Drift choice 2 → collapse delta ──

/**
 * Generate collapse deltas for drift choice 2 (keep new).
 * Sets root node and its direct children to status: collapsed.
 *
 * Only collapses root + direct children — nested sub-nodes follow
 * their parent naturally in the UI.
 */
export function generateCollapseDelta(snapshot: SemanticContent): Delta {
  const nodes: FlatNode[] = flattenTrees(snapshot.trees);
  if (nodes.length === 0) {
    return { changes: [] };
  }

  // Find root node (first node, or node with no incoming depends)
  const childIds = new Set(
    snapshot.relations.filter((r) => r.type === 'depends').map((r) => r.to)
  );
  const rootNode = nodes.find((f: FlatNode) => !childIds.has(f.id)) ?? nodes[0];

  // Find direct children of root
  const directChildIds = new Set(
    snapshot.relations
      .filter((r) => r.from === rootNode.id && r.type === 'depends')
      .map((r) => r.to)
  );

  // Generate update deltas for root + direct children
  const nodesToCollapse: FlatNode[] = [
    rootNode,
    ...nodes.filter((f: FlatNode) => directChildIds.has(f.id)),
  ];

  const changes: TreeChange[] = nodesToCollapse.map((f: FlatNode) => ({
    action: 'update' as const,
    target_path: f.id,
    slots: { _status: 'collapsed' },
  }));

  // Note: Node status is not a slot — it's a top-level field.
  // The API layer should handle setting node status directly
  // after applying the delta. The delta here marks the intent.
  // Alternatively, we use a convention: _status slot signals collapse.
  // The API layer reads _status and sets node status, then removes _status.

  return { changes };
}

// ── Dispatch answer ──

/**
 * Apply a single user answer to the current snapshot.
 * Routes to the appropriate handler based on answer type.
 *
 * Returns the delta + updated snapshot, or errors if invalid.
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
      return { applied: true, delta: { changes: [] }, snapshot };
    }
    if (answer.drift_choice === 'keep_new') {
      const delta = generateCollapseDelta(snapshot);
      return applyAndValidate(snapshot, delta);
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

function applyAndValidate(snapshot: SemanticContent, delta: Delta): AnswerApplyResult {
  if (delta.changes.length === 0 && !delta.new_relations && !delta.remove_relations) {
    return { applied: true, delta, snapshot };
  }

  let newSnapshot: SemanticContent;
  try {
    newSnapshot = applyDelta(snapshot, delta);
  } catch (err) {
    return {
      applied: false,
      errors: [`Failed to apply delta: ${err instanceof Error ? err.message : String(err)}`],
    };
  }

  const validation = validateIntegrity(newSnapshot);
  if (!validation.valid) {
    return {
      applied: false,
      errors: validation.errors.map((e) => `${e.type}: ${e.message}`),
    };
  }

  return { applied: true, delta, snapshot: newSnapshot };
}

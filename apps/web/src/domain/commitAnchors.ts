/**
 * domain/commitAnchors — pure parsers converting snake_case API anchor
 * shapes into camelCase domain shapes.
 *
 * v2 §2.2 — pure functions, no React, no I/O. Same input always
 * produces same output. Lives in @/domain so it can be unit-tested
 * without mocking, and so canvas/store helpers can call it without
 * dragging an @/infrastructure dependency through @/queries.
 *
 * Previously lived in @/infrastructure/leaves.ts; the canvasStoreUtils
 * consumer used to reach it via @/queries/commits re-export — that path
 * was a doc §2.5 violation (store -> queries) covered only by a biome
 * exempt list. Moving here lets that exemption shrink.
 */

import type {
  ApiAnchorCandidate,
  ApiCommitAnchors,
  ApiConfirmedAnchor,
  ApiNodeWithAnchors,
} from '@/types/anchors';
// Constraint/type unions are imported in the camelCase shapes already.
import type {
  AnchorCandidate,
  AnchorConstraint,
  AnchorType,
  CommitAnchors,
  ConfirmedAnchor,
  NodeWithAnchors,
} from '@/types/nodes';

/**
 * Convert API anchor candidate (snake_case) to internal format (camelCase).
 */
export function parseApiAnchorCandidate(api: ApiAnchorCandidate): AnchorCandidate {
  return {
    text: api.text,
    type: api.type,
    startChar: api.start_char,
    endChar: api.end_char,
    source: api.source,
  };
}

/**
 * Convert array of API anchor candidates to internal format.
 */
export function parseApiAnchorCandidates(
  apis: ApiAnchorCandidate[] | undefined
): AnchorCandidate[] {
  if (!apis) return [];
  return apis.map(parseApiAnchorCandidate);
}

/**
 * Convert API confirmed anchor (snake_case) to internal format (camelCase).
 * Note: global_start/global_end are optional and typically computed in UI
 * layer, not returned from API. See NodeModal.committedAnchors for the
 * computation. Supports both snake_case (global_start) and legacy camelCase
 * (globalStart) for backward compat.
 */
export function parseApiConfirmedAnchor(api: ApiConfirmedAnchor): ConfirmedAnchor {
  // Support both snake_case (new) and camelCase (legacy) for backward compatibility
  const apiAny = api as ApiConfirmedAnchor & { globalStart?: number; globalEnd?: number };
  return {
    id: api.id,
    text: api.text,
    start: api.start,
    end: api.end,
    type: api.type as AnchorType,
    constraint: api.constraint as AnchorConstraint,
    globalStart: api.global_start ?? apiAny.globalStart,
    globalEnd: api.global_end ?? apiAny.globalEnd,
  };
}

/**
 * Convert API node with anchors (snake_case) to internal format (camelCase).
 * Computes globalStart/globalEnd for each anchor using node.start_char offset.
 * If start_char is missing/invalid, anchors will only have their original
 * positions (no global computation).
 */
export function parseApiNodeWithAnchors(api: ApiNodeWithAnchors): NodeWithAnchors {
  const nodeStartChar = api.start_char;
  const hasValidStartChar = typeof nodeStartChar === 'number' && !Number.isNaN(nodeStartChar);

  return {
    nodeId: api.node_id,
    text: api.text,
    startChar: api.start_char,
    endChar: api.end_char,
    anchors:
      api.anchors?.map((anchor) => {
        const parsed = parseApiConfirmedAnchor(anchor);
        // Compute global positions if not already present and start_char is valid.
        // If start_char is missing/corrupt, skip computation to avoid NaN positions.
        if (hasValidStartChar) {
          return {
            ...parsed,
            globalStart: parsed.globalStart ?? nodeStartChar + parsed.start,
            globalEnd: parsed.globalEnd ?? nodeStartChar + parsed.end,
          };
        }
        return parsed;
      }) ?? [],
  };
}

/**
 * Convert API commit anchors (snake_case) to internal format (camelCase).
 * Use this when you need CommitAnchors type for CanvasNodeData.anchors.
 */
export function parseApiCommitAnchors(api: ApiCommitAnchors | null): CommitAnchors | null {
  if (!api) return null;
  return {
    inputTextHash: api.input_text_hash,
    nodes: api.nodes?.map(parseApiNodeWithAnchors) ?? [],
  };
}

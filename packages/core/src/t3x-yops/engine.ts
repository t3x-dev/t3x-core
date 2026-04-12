/**
 * T3X YOps Adapter Engine
 *
 * Bridges @t3x-dev/yops (generic YAML operations) and T3X's SemanticContent
 * (TreeNode[] + Relation[]). Handles the 18 generic ops by delegating to the
 * yops engine, and handles relate/unrelate ops locally on the relations array.
 *
 * Generic ops are applied one-at-a-time so that relate/unrelate can be
 * interleaved at any position in the ops list.
 */

import { applyYOps as applyGenericYOps } from '@t3x-dev/yops';
import type { YOp as GenericYOp, YValue } from '@t3x-dev/yops';
import type { Relation, SemanticContent } from '../semantic/types';
import type { RelateOp, SourcedYOp, UnrelateOp, YOp, YOpsResult } from './types';
import { treesToYValue, yvalueToTrees } from './convert';
import { findNode } from './helpers';

// ── Op type guards ──

function isRelateOp(op: YOp): op is { relate: RelateOp } {
  return 'relate' in op;
}

function isUnrelateOp(op: YOp): op is { unrelate: UnrelateOp } {
  return 'unrelate' in op;
}

// ── Main engine ──

/**
 * Apply a sequence of YOps to SemanticContent.
 *
 * - Generic ops (define, set, drop, etc.) are delegated one-at-a-time to
 *   `@t3x-dev/yops`'s `applyYOps`.
 * - `relate` and `unrelate` ops are handled locally on the relations array.
 * - Inputs are deep-cloned; the caller's content is never mutated.
 */
export function applyYOps(content: SemanticContent, ops: YOp[]): YOpsResult {
  // Deep clone inputs for immutability
  let currentDoc: YValue = structuredClone(treesToYValue(content.trees));
  let relations: Relation[] = structuredClone(content.relations);
  let applied = 0;

  for (let i = 0; i < ops.length; i++) {
    const op = ops[i];
    if (isRelateOp(op)) {
      const result = handleRelate(op.relate, currentDoc, relations);
      if (!result.ok) {
        return {
          ok: false,
          trees: yvalueToTrees(currentDoc),
          relations,
          applied,
          error: { ...result.error, op_index: i },
        };
      }
      relations = result.relations;
      applied++;
    } else if (isUnrelateOp(op)) {
      relations = handleUnrelate(op.unrelate, relations);
      applied++;
    } else {
      // Generic op — delegate to @t3x-dev/yops one at a time
      const genericResult = applyGenericYOps(currentDoc, [op as GenericYOp]);
      if (!genericResult.ok) {
        return {
          ok: false,
          trees: yvalueToTrees(currentDoc),
          relations,
          applied,
          error: genericResult.error ? { ...genericResult.error, op_index: i } : undefined,
        };
      }
      currentDoc = genericResult.doc;

      // After a drop op, clean up any relations referencing the removed path
      if ('drop' in op) {
        const droppedPath = (op as { drop: { path: string } }).drop.path;
        relations = relations.filter(
          (r) => r.from !== droppedPath && r.to !== droppedPath
            && !r.from.startsWith(`${droppedPath}/`) && !r.to.startsWith(`${droppedPath}/`),
        );
      }

      applied++;
    }
  }

  const resultTrees = yvalueToTrees(currentDoc);

  // Overlay metadata (source, slot_quotes) from input trees onto result trees.
  // The YValue round-trip strips T3X-specific annotations, so we re-apply them
  // from the original content to any surviving nodes with matching keys.
  overlayMetadata(resultTrees, content.trees);

  return {
    ok: true,
    trees: resultTrees,
    relations,
    applied,
  };
}

// ── Relate handler ──

function handleRelate(
  op: RelateOp,
  currentDoc: YValue,
  relations: Relation[],
): { ok: true; relations: Relation[] } | { ok: false; error: { code: string; message: string } } {
  const { from, to, type } = op;

  // Reject self-relation
  if (from === to) {
    return {
      ok: false,
      error: {
        code: 'RELATE_SELF',
        message: `Cannot create self-relation: "${from}" → "${from}"`,
      },
    };
  }

  // Verify both nodes exist
  const trees = yvalueToTrees(currentDoc);

  if (!findNode(trees, from)) {
    return {
      ok: false,
      error: {
        code: 'RELATE_NOT_FOUND',
        message: `Relate source node not found: "${from}"`,
      },
    };
  }

  if (!findNode(trees, to)) {
    return {
      ok: false,
      error: {
        code: 'RELATE_NOT_FOUND',
        message: `Relate target node not found: "${to}"`,
      },
    };
  }

  // Reject duplicate
  const isDuplicate = relations.some(
    (r) => r.from === from && r.to === to && r.type === type,
  );
  if (isDuplicate) {
    return {
      ok: false,
      error: {
        code: 'RELATE_DUPLICATE',
        message: `Relation already exists: "${from}" -[${type}]→ "${to}"`,
      },
    };
  }

  return {
    ok: true,
    relations: [...relations, { from, to, type }],
  };
}

// ── Unrelate handler ──

function handleUnrelate(op: UnrelateOp, relations: Relation[]): Relation[] {
  const { from, to, type } = op;
  return relations.filter(
    (r) => !(r.from === from && r.to === to && r.type === type),
  );
}

// ── Metadata overlay ──

/**
 * Build a lookup map from key path -> TreeNode for the original input trees.
 */
function buildNodeMap(trees: import('../semantic/types').TreeNode[], prefix = ''): Map<string, import('../semantic/types').TreeNode> {
  const map = new Map<string, import('../semantic/types').TreeNode>();
  for (const node of trees) {
    const path = prefix ? `${prefix}/${node.key}` : node.key;
    map.set(path, node);
    if (node.children.length > 0) {
      for (const [k, v] of buildNodeMap(node.children, path)) {
        map.set(k, v);
      }
    }
  }
  return map;
}

/**
 * Re-apply metadata (source, slot_quotes) from input trees onto output trees.
 * The YValue round-trip strips these T3X annotations, so we copy them back
 * from matching input nodes. Mutates outputTrees in place.
 */
function overlayMetadata(
  outputTrees: import('../semantic/types').TreeNode[],
  inputTrees: import('../semantic/types').TreeNode[],
): void {
  const inputMap = buildNodeMap(inputTrees);

  function walk(nodes: import('../semantic/types').TreeNode[], prefix: string): void {
    for (const node of nodes) {
      const path = prefix ? `${prefix}/${node.key}` : node.key;
      const inputNode = inputMap.get(path);
      if (inputNode) {
        if (inputNode.source !== undefined) node.source = inputNode.source;
        if (inputNode.slot_quotes !== undefined) node.slot_quotes = inputNode.slot_quotes;
      }
      if (node.children.length > 0) {
        walk(node.children, path);
      }
    }
  }

  walk(outputTrees, '');
}

// ── Sourced entry point ──

/**
 * Apply sourced YOps, enforcing that every op carries a structurally valid
 * Source. Does NOT verify LLMSource quotes against turns — that's
 * `validateSource`'s responsibility (runs in the extraction retry loop before
 * ops reach the engine). Engine enforces structure only.
 */
export function applySourcedYOps(content: SemanticContent, ops: SourcedYOp[]): YOpsResult {
  for (let i = 0; i < ops.length; i++) {
    const op = ops[i] as { source?: unknown };
    if (!op.source || typeof op.source !== 'object') {
      return {
        ok: false,
        trees: content.trees,
        relations: content.relations,
        applied: 0,
        error: { code: 'MISSING_SOURCE', message: `Op at index ${i} has no source`, op_index: i },
      };
    }
    const s = op.source as { type?: string; author?: string };
    if (s.type !== 'llm' && s.type !== 'human') {
      return {
        ok: false,
        trees: content.trees,
        relations: content.relations,
        applied: 0,
        error: { code: 'INVALID_SOURCE_TYPE', message: `Op at index ${i} has invalid source.type`, op_index: i },
      };
    }
    if (s.type === 'human' && (!s.author || s.author.trim() === '')) {
      return {
        ok: false,
        trees: content.trees,
        relations: content.relations,
        applied: 0,
        error: { code: 'MISSING_AUTHOR', message: `Human op at index ${i} missing author`, op_index: i },
      };
    }
  }
  // Strip source before passing to generic engine (it doesn't know about source)
  const stripped = ops.map((o) => {
    const { source: _unused, ...rest } = o as SourcedYOp & { source: unknown };
    return rest as YOp;
  });
  return applyYOps(content, stripped);
}

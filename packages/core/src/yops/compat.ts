/**
 * YOps Compatibility — Bridge from legacy TreeChangeBatch to YOp[].
 *
 * Converts the 3-action TreeChange format to the 13-operation YOp format.
 * Used at the boundary where legacy code enters the YOps pipeline.
 */

import type { RelationType, SlotValue, TreeNode } from '../semantic/types';
import type { YOp } from './types';

/** Legacy TreeChange format — kept only for bridge conversion. */
type TreeChange =
  | { action: 'add'; parent_path: string; node: TreeNode; slot_quotes?: Record<string, string> }
  | { action: 'update'; target_path: string; slots: Record<string, SlotValue | null>; slot_quotes?: Record<string, string> }
  | { action: 'remove'; target_path: string; reason?: string };

/** Legacy TreeChangeBatch — kept only for bridge conversion. */
export interface TreeChangeBatch {
  changes: TreeChange[];
  new_relations?: Array<{ from: string; to: string; type: string }>;
  remove_relations?: Array<{ from: string; to: string; type: string }>;
}

/**
 * Convert a TreeChangeBatch to YOp[].
 *
 * Mapping:
 *   add    → {add: {parent, node, source, from: 'manual'}}
 *   update → {set: {...}} per non-null slot, {unset: {...}} per null slot
 *   remove → {drop: {path, reason?}}
 *
 * Also converts new_relations → relate ops, remove_relations → unrelate ops.
 */
export function treeChangesToYOps(batch: TreeChangeBatch): YOp[] {
  const ops: YOp[] = [];

  for (const change of batch.changes) {
    switch (change.action) {
      case 'add': {
        const nodeMap: Record<string, unknown> = {};
        const slotsObj: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(change.node.slots)) {
          slotsObj[k] = v;
        }
        nodeMap[change.node.key] = slotsObj;

        const source: Record<string, string> = {};
        if (change.slot_quotes) {
          for (const [k, v] of Object.entries(change.slot_quotes)) {
            source[k] = v;
          }
        }

        ops.push({
          add: {
            parent: change.parent_path,
            node: nodeMap,
            source,
            from: 'manual',
          },
        });
        break;
      }
      case 'update': {
        for (const [key, value] of Object.entries(change.slots)) {
          if (value === null) {
            ops.push({ unset: { path: `${change.target_path}/${key}` } });
          } else {
            let source = String(value);
            if (change.slot_quotes) {
              const dotKey = `${change.target_path}.${key}`;
              source = change.slot_quotes[dotKey] ?? change.slot_quotes[key] ?? String(value);
            }
            ops.push({
              set: {
                path: `${change.target_path}/${key}`,
                value: value as SlotValue,
                source,
                from: 'manual',
              },
            });
          }
        }
        break;
      }
      case 'remove': {
        const dropOp: { path: string; reason?: string } = { path: change.target_path };
        if (change.reason) dropOp.reason = change.reason;
        ops.push({ drop: dropOp });
        break;
      }
    }
  }

  if (batch.new_relations) {
    for (const rel of batch.new_relations) {
      ops.push({
        relate: {
          from: rel.from,
          to: rel.to,
          type: rel.type as RelationType,
        },
      });
    }
  }
  if (batch.remove_relations) {
    for (const rel of batch.remove_relations) {
      ops.push({
        unrelate: {
          from: rel.from,
          to: rel.to,
          type: rel.type as RelationType,
        },
      });
    }
  }

  return ops;
}

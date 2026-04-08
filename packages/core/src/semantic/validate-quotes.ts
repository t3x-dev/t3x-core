import type { TreeNode } from './types';

export interface QuoteValidationResult {
  /** Total slot count across all trees */
  total: number;
  /** Slots that have a corresponding slot_quotes entry */
  quoted: number;
  /** Dot-paths of slots without quotes (e.g., "trip.budget.food") */
  missing: string[];
  /** quoted / total (1 when total is 0) */
  coverage: number;
}

export function validateSlotQuotes(trees: TreeNode[]): QuoteValidationResult {
  const missing: string[] = [];
  let total = 0;
  let quoted = 0;

  function walk(node: TreeNode, prefix: string): void {
    const path = prefix ? `${prefix}.${node.key}` : node.key;
    const quotes = node.slot_quotes ?? {};

    for (const slotKey of Object.keys(node.slots)) {
      total++;
      if (slotKey in quotes) {
        quoted++;
      } else {
        missing.push(`${path}.${slotKey}`);
      }
    }

    for (const child of node.children ?? []) {
      walk(child, path);
    }
  }

  for (const tree of trees) {
    walk(tree, '');
  }

  return {
    total,
    quoted,
    missing,
    coverage: total === 0 ? 1 : quoted / total,
  };
}

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

export interface MetadataValidationResult {
  ok: boolean;
  /** Slots missing quotes, with their values for LLM context (path.slot → value) */
  missingQuotes: Array<{ path: string; slotKey: string; value: string }>;
  /** Nodes missing source tags (path) */
  missingSources: string[];
  /** Quotes that don't actually appear in any turn (path.slot → { quote, value }) */
  unverifiedQuotes: Array<{ path: string; slotKey: string; quote: string; value: string }>;
}

/**
 * Full metadata validation: every slot has a verifiable quote, every node has a source.
 * A quote is verifiable if it appears as a substring of any conversation turn.
 */
export function validateMetadata(
  trees: TreeNode[],
  turns: Array<{ content: string }>
): MetadataValidationResult {
  const missingQuotes: Array<{ path: string; slotKey: string; value: string }> = [];
  const missingSources: string[] = [];
  const unverifiedQuotes: Array<{ path: string; slotKey: string; quote: string; value: string }> = [];

  const turnsLower = turns.map((t) => t.content.toLowerCase());

  function walk(node: TreeNode, prefix: string): void {
    const path = prefix ? `${prefix}.${node.key}` : node.key;
    const quotes = node.slot_quotes ?? {};

    if (!node.source) missingSources.push(path);

    for (const [slotKey, val] of Object.entries(node.slots)) {
      const value = typeof val === 'string' ? val : JSON.stringify(val);
      const quote = quotes[slotKey];
      if (!quote) {
        missingQuotes.push({ path, slotKey, value });
      } else {
        const quoteLower = quote.toLowerCase();
        const found = turnsLower.some((t) => t.includes(quoteLower));
        if (!found) {
          unverifiedQuotes.push({ path, slotKey, quote, value });
        }
      }
    }

    for (const child of node.children ?? []) walk(child, path);
  }

  for (const tree of trees) walk(tree, '');

  return {
    ok: missingQuotes.length === 0 && missingSources.length === 0 && unverifiedQuotes.length === 0,
    missingQuotes,
    missingSources,
    unverifiedQuotes,
  };
}

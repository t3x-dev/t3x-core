/**
 * Source Gate (G2)
 *
 * Validates that YOp source quotes and turn references are valid.
 * Extracted from: fuzzyQuoteValidator + sourceTraceValidator agents.
 *
 * Pre-apply gate: operates on raw YOp[] before they're applied to the tree.
 */

import type { YOp } from '../../t3x-yops/types';
import type { GateResult, GateViolation } from './types';

const TOKEN_OVERLAP_THRESHOLD = 0.5;

function tokenize(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .split(/\W+/)
      .filter((w) => w.length >= 2)
  );
}

function quoteMatchesTurns(quote: string, turnContents: string[]): boolean {
  const lowerQuote = quote.toLowerCase();
  for (const content of turnContents) {
    if (content.toLowerCase().includes(lowerQuote)) return true;
  }
  const quoteTokens = tokenize(quote);
  if (quoteTokens.size < 2) return true; // too short to validate
  for (const content of turnContents) {
    const contentTokens = tokenize(content);
    let overlap = 0;
    for (const token of quoteTokens) {
      if (contentTokens.has(token)) overlap++;
    }
    if (overlap / quoteTokens.size >= TOKEN_OVERLAP_THRESHOLD) return true;
  }
  return false;
}

/** Extract source and from fields from a YOp (if present).
 *  Since the migration to @t3x-dev/yops generic types, ops no longer carry
 *  source/from metadata — so this always returns null. Gate is kept for
 *  backward compatibility but is effectively a no-op. */
function getSourceFields(
  _op: YOp
): { source?: string | Record<string, string>; from?: string } | null {
  return null;
}

export function validateSources(
  yops: YOp[],
  turns: Array<{ role: string; content: string }>
): GateResult {
  const violations: GateViolation[] = [];
  const turnContents = turns.map((t) => t.content);
  const maxTurnIndex = turns.length;

  for (let i = 0; i < yops.length; i++) {
    const fields = getSourceFields(yops[i]);
    if (!fields) continue;

    // Validate turn reference
    if (fields.from) {
      const match = fields.from.match(/^T(\d+)/);
      if (!match || Number(match[1]) < 1 || Number(match[1]) > maxTurnIndex) {
        violations.push({
          gate: 'source',
          severity: 'error',
          opIndex: i,
          message: `YOp[${i}]: turn reference "${fields.from}" does not match any turn (valid: T1-T${maxTurnIndex})`,
        });
        continue;
      }
    }

    // Validate source quotes
    if (fields.source) {
      const quotes: string[] =
        typeof fields.source === 'string' ? [fields.source] : Object.values(fields.source);

      for (const quote of quotes) {
        if (quote.length > 0 && !quoteMatchesTurns(quote, turnContents)) {
          violations.push({
            gate: 'source',
            severity: 'warning',
            opIndex: i,
            message: `YOp[${i}]: source quote "${quote.slice(0, 50)}${quote.length > 50 ? '...' : ''}" not found in any turn`,
          });
        }
      }
    }
  }

  const hasErrors = violations.some((v) => v.severity === 'error');
  return { gate: 'source', passed: !hasErrors, violations };
}

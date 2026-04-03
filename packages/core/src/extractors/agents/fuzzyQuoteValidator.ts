/**
 * Fuzzy Quote Validator Agent — CODE
 *
 * ONE job: validate that each tree's source quotes actually appear in the conversation.
 * Uses case-insensitive substring matching with token overlap fallback.
 *
 * - If quote matches a turn: keep original confidence
 * - If no match found: reduce confidence to 0.3 (low but not removed)
 *
 * Runs early in the pipeline — before dedup and other agents.
 */

import type { TreeNode } from '../../semantic/types';
import type { MeaningAgent, PipelineContext } from '../meaningPipeline';

const LOW_CONFIDENCE = 0.3;
const TOKEN_OVERLAP_THRESHOLD = 0.5;

/** Tokenize a string into lowercase words */
function tokenize(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .split(/\W+/)
      .filter((w) => w.length >= 2)
  );
}

/** Check if quote appears in any turn (substring or token overlap) */
function quoteMatchesTurns(quote: string, turnContents: string[]): boolean {
  const lowerQuote = quote.toLowerCase();

  // 1. Exact substring match (case-insensitive)
  for (const content of turnContents) {
    if (content.toLowerCase().includes(lowerQuote)) return true;
  }

  // 2. Token overlap fallback (for paraphrased quotes)
  const quoteTokens = tokenize(quote);
  if (quoteTokens.size < 2) return false;

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

/** Validate quotes for a tree and adjust confidence */
function validateTree(node: TreeNode, turnContents: string[]): TreeNode {
  if (!node.slot_quotes || Object.keys(node.slot_quotes).length === 0) {
    return {
      ...node,
      children: node.children.map((c) => validateTree(c, turnContents)),
    };
  }

  // Proportional confidence: matched/total ratio instead of all-or-nothing
  let total = 0;
  let matched = 0;
  for (const quote of Object.values(node.slot_quotes)) {
    if (typeof quote === 'string' && quote.length > 0) {
      total++;
      if (quoteMatchesTurns(quote, turnContents)) {
        matched++;
      }
    }
  }

  // Scale confidence by match ratio: all matched = keep original, none matched = LOW_CONFIDENCE
  const baseConfidence = node.confidence ?? 0.8;
  const matchRatio = total > 0 ? matched / total : 1;
  const adjustedConfidence =
    total > 0 ? LOW_CONFIDENCE + (baseConfidence - LOW_CONFIDENCE) * matchRatio : baseConfidence;

  return {
    ...node,
    confidence: adjustedConfidence,
    children: node.children.map((c) => validateTree(c, turnContents)),
  };
}

export const fuzzyQuoteValidatorAgent: MeaningAgent = {
  name: 'fuzzy_quote_validator',
  description: 'Validate source quotes via fuzzy matching, adjust confidence for unmatched',
  usesLLM: false,

  shouldRun(ctx: PipelineContext): boolean {
    return ctx.content.trees.length > 0;
  },

  async run(ctx: PipelineContext): Promise<PipelineContext> {
    const turnContents = ctx.turns.map((t) => t.content);

    ctx.content = {
      trees: ctx.content.trees.map((t) => validateTree(t, turnContents)),
      relations: ctx.content.relations,
    };

    return ctx;
  },
};

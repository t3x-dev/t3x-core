/**
 * Drift Pre-Filter (Step 3, Level 1)
 *
 * Fast, code-only check to decide whether LLM drift detection is needed.
 * Compares keywords from new turn content against existing frame types + slot values.
 * If recall overlap is high, the turn is related to existing content → skip LLM.
 *
 * Pure CODE, zero LLM, ~1ms.
 *
 * @see docs/hlq_docs/2026-03-20-agentic-pipeline-8step-design.md §4.3.1
 * @see https://github.com/t3x-dev/t3x-core/issues/617
 */

/** Threshold: overlap below this triggers LLM drift detection */
const DRIFT_OVERLAP_THRESHOLD = 0.3;

/** Common stop words to exclude from overlap calculation */
const STOP_WORDS = new Set([
  'the', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
  'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would',
  'could', 'should', 'may', 'might', 'shall', 'can',
  'at', 'by', 'for', 'in', 'of', 'on', 'to', 'with', 'from',
  'an', 'and', 'or', 'but', 'not', 'no', 'nor', 'so', 'if',
  'it', 'its', 'my', 'we', 'our', 'you', 'your', 'they', 'them', 'their',
  'this', 'that', 'these', 'those', 'what', 'which', 'who', 'whom',
  'how', 'when', 'where', 'why', 'any', 'some', 'all', 'each', 'every',
  'about', 'also', 'just', 'than', 'then', 'very', 'too', 'most',
  'there', 'here', 'more', 'much', 'many', 'other', 'into', 'over',
  'good', 'best', 'new', 'old', 'want', 'like', 'need', 'get',
  '的', '了', '是', '在', '有', '和', '就', '不', '人', '都',
  '我', '他', '她', '你', '们', '这', '那', '什', '么', '吗',
  '呢', '吧', '啊', '哦', '嗯', '很', '也', '还', '又', '只',
]);

export interface PreFilterResult {
  needsLLM: boolean;
  overlapScore: number;
}

/**
 * Tokenize text into keyword set.
 * - Latin text: split on whitespace/punctuation, lowercase, filter short words
 * - CJK text: split into individual characters (each char carries meaning)
 * - Numbers preserved as-is
 */
function tokenize(text: string): Set<string> {
  const tokens = new Set<string>();
  // Extract CJK characters individually, filter stop words
  const cjkMatches = text.match(/[\u4e00-\u9fff\u3400-\u4dbf]/g);
  if (cjkMatches) {
    for (const ch of cjkMatches) {
      if (!STOP_WORDS.has(ch)) {
        tokens.add(ch);
      }
    }
  }
  // Extract Latin words + numbers, filter stop words
  const wordMatches = text.match(/[a-zA-Z]{2,}|\d+/g);
  if (wordMatches) {
    for (const w of wordMatches) {
      const lower = w.toLowerCase();
      if (!STOP_WORDS.has(lower)) {
        tokens.add(lower);
      }
    }
  }
  return tokens;
}

/**
 * Compute overlap as recall from turn tokens into existing tokens.
 * = |turnTokens ∩ existingTokens| / |turnTokens|
 *
 * This measures "how much of the new content is already covered by existing frames."
 * Using recall (not Jaccard) because turn content has many noise words that
 * would dilute Jaccard, while we only care whether the substantive words hit.
 */
function overlapRecall(turnTokens: Set<string>, existingTokens: Set<string>): number {
  if (turnTokens.size === 0) return 1;
  let hits = 0;
  for (const token of turnTokens) {
    if (existingTokens.has(token)) hits++;
  }
  return hits / turnTokens.size;
}

/**
 * Pre-filter drift detection.
 *
 * @param newTurnContent - Content of the new turn(s)
 * @param existingFrameTypes - Type names of existing frames (e.g., ['travel_plan', 'budget'])
 * @param existingSlotValues - String slot values from existing frames
 * @returns needsLLM: true if overlap is low enough to warrant LLM check
 */
export function preFilterDrift(
  newTurnContent: string,
  existingFrameTypes: string[],
  existingSlotValues: string[]
): PreFilterResult {
  // No existing frames → first extraction, no drift possible
  if (existingFrameTypes.length === 0) {
    return { needsLLM: false, overlapScore: 1 };
  }

  const turnTokens = tokenize(newTurnContent);
  if (turnTokens.size === 0) {
    return { needsLLM: false, overlapScore: 1 };
  }

  // Build existing content token set from frame types + slot values
  const existingTokens = new Set<string>();
  for (const frameType of existingFrameTypes) {
    // snake_case type → split into words
    for (const part of frameType.split('_')) {
      if (part.length >= 2) existingTokens.add(part.toLowerCase());
    }
    // Also tokenize the full type for CJK
    for (const t of tokenize(frameType)) existingTokens.add(t);
  }
  for (const val of existingSlotValues) {
    for (const t of tokenize(val)) existingTokens.add(t);
  }

  const overlapScore = overlapRecall(turnTokens, existingTokens);

  return {
    needsLLM: overlapScore < DRIFT_OVERLAP_THRESHOLD,
    overlapScore,
  };
}

/**
 * Readiness Gate (Step 2)
 *
 * Fast rejection of conversations too thin for extraction.
 * Pure code, zero LLM, ~1ms.
 *
 * Runs after SessionStateManager (Step 1) decides 'extract'.
 * Checks whether the actual turn content is substantive enough.
 *
 * @see docs/hlq_docs/2026-03-20-agentic-pipeline-8step-design.md §4.2
 * @see https://github.com/t3x-dev/t3x-core/issues/616
 */

export type ReadinessBlockReason = 'empty' | 'too_short' | 'cold_start' | 'only_greetings';

export interface ReadinessResult {
  pass: boolean;
  reason?: ReadinessBlockReason;
}

/**
 * Greeting patterns — only match when the ENTIRE content is a greeting.
 * "你好，我想去杭州旅游" will NOT match (anchored with $).
 */
const GREETING_PATTERNS = [
  /^(hi|hello|hey|yo|sup|howdy|greetings)\s*[!.?]*$/i,
  /^(你好|嗨|哈喽|早上好|晚上好|下午好|早|晚上好呀)\s*[!！。.?？~～]*$/,
  /^(thanks|thank you|谢谢|好的|ok|okay|好|嗯|对)\s*[!！。.?？~～]*$/i,
];

function isGreeting(text: string): boolean {
  const trimmed = text.trim();
  return GREETING_PATTERNS.some((p) => p.test(trimmed));
}

const MIN_USER_CHARS = 20;

/**
 * Check whether the conversation content is ready for extraction.
 *
 * Rules (evaluated in order):
 * 1. turns.length === 0                          → block(empty)
 * 2. total user turn chars < 20                  → block(too_short)
 * 3. first extraction + turns.length < 2         → block(cold_start)
 * 4. all user turns are pure greetings           → block(only_greetings)
 * 5. otherwise                                   → pass
 */
export function checkReadiness(
  turns: Array<{ role: string; content: string }>,
  isFirstExtraction: boolean
): ReadinessResult {
  // Rule 1: no turns at all
  if (turns.length === 0) {
    return { pass: false, reason: 'empty' };
  }

  // Rule 2: user content too short
  const userTurns = turns.filter((t) => t.role === 'user');
  const totalUserChars = userTurns.reduce((sum, t) => sum + t.content.trim().length, 0);
  if (totalUserChars < MIN_USER_CHARS) {
    return { pass: false, reason: 'too_short' };
  }

  // Rule 3: first extraction needs ≥ 2 turns
  if (isFirstExtraction && turns.length < 2) {
    return { pass: false, reason: 'cold_start' };
  }

  // Rule 4: all user turns are greetings
  if (userTurns.length > 0 && userTurns.every((t) => isGreeting(t.content))) {
    return { pass: false, reason: 'only_greetings' };
  }

  return { pass: true };
}

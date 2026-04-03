/**
 * Deterministic Confidence Scoring
 *
 * Replaces LLM self-scoring with evidence-based computation.
 * Score = baseline + source quality + role bonus + confirmation - contradiction
 */

import { fuzzyLocate } from './fuzzyLocate';

export interface ConfidenceInput {
  source: string; // quoted text from the YOp
  from: string; // turn reference (e.g., "T1")
  turns: Array<{ hash: string; role: 'user' | 'assistant'; content: string }>;
  isConfirmed?: boolean; // user confirmed this fact
  hasContradiction?: boolean; // contradicts existing tree
}

export function computeConfidence(input: ConfidenceInput): number {
  const { source, from, turns, isConfirmed, hasContradiction } = input;

  // Resolve turn by reference (e.g., "T1" -> turns[0], "T2" -> turns[1])
  const turnIndex = parseTurnRef(from);
  const turn = turnIndex !== null && turnIndex < turns.length ? turns[turnIndex] : null;

  let score = 0.5; // baseline

  // Source quality: fuzzyLocate score * 0.3
  if (turn && source) {
    const match = fuzzyLocate(turn.content, source);
    if (match) {
      score += match.score * 0.3;
    }
  }

  // Role bonus: user statements weighted higher than assistant
  if (turn?.role === 'user') {
    score += 0.15;
  }

  // Confirmation signal
  if (isConfirmed) {
    score += 0.1;
  }

  // Contradiction penalty
  if (hasContradiction) {
    score -= 0.2;
  }

  return Math.max(0, Math.min(1, score));
}

/** Parse "T1" -> 0, "T2" -> 1, etc. Returns null on invalid input. */
function parseTurnRef(ref: string): number | null {
  const m = /^T(\d+)$/i.exec(ref);
  if (!m) return null;
  const idx = Number.parseInt(m[1], 10) - 1;
  return idx >= 0 ? idx : null;
}

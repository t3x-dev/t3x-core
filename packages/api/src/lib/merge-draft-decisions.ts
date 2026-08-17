import type { MergeDecision, MergeResult } from '@t3x-dev/core';
import { FrameMergeDecisionSchema } from '../schemas/merge';

interface StoredMergeDraftDecision {
  preparedJson: string;
  decisionJson: string | null;
}

export class MergeDraftDecisionIntegrityError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MergeDraftDecisionIntegrityError';
  }
}

/**
 * Read the canonical decision column, with a read-only compatibility path for
 * drafts written before decisions were separated from merge preparation.
 */
export function readMergeDraftDecision(draft: StoredMergeDraftDecision): MergeDecision | null {
  let raw: unknown;
  try {
    if (draft.decisionJson !== null) {
      raw = JSON.parse(draft.decisionJson);
    } else {
      const legacyPrepared = JSON.parse(draft.preparedJson) as MergeResult & {
        decisions?: unknown;
      };
      raw = legacyPrepared.decisions;
    }
  } catch (cause) {
    throw new MergeDraftDecisionIntegrityError(
      `Stored merge decision is not valid JSON: ${cause instanceof Error ? cause.message : String(cause)}`
    );
  }

  if (raw === undefined) return null;
  const parsed = FrameMergeDecisionSchema.safeParse(raw);
  if (!parsed.success) {
    throw new MergeDraftDecisionIntegrityError('Stored merge decision does not match the contract');
  }
  return parsed.data as MergeDecision;
}

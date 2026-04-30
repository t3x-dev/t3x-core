import type { SourcedYOp, ValidationTurn } from '@t3x-dev/core';

export type ExtractionPreset = 'concise' | 'balanced' | 'detailed';
export type ExtractionVariants = Partial<Record<ExtractionPreset, SourcedYOp[]>>;

export interface ExtractionLLMResult {
  ops: SourcedYOp[];
  variants?: ExtractionVariants;
}

export type ExtractionFailureReason =
  | 'missing_source'
  | 'invalid_source_type'
  | 'unknown_turn_hash'
  | 'unverifiable_quote'
  | 'missing_author'
  | 'invalid_structure';

export interface RetryFailingOp {
  op: SourcedYOp;
  opIndex: number;
  reason: ExtractionFailureReason;
  detail?: string;
}

export interface LLMCallInput {
  turns: ValidationTurn[];
  failingOps?: RetryFailingOp[];
}

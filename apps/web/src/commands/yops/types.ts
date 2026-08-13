import type {
  DroppedExtractionItem,
  ExtractionWarning,
  SourcedYOp,
  ValidationTurn,
} from '@t3x-dev/core';

export type ExtractionPreset = 'concise' | 'balanced' | 'detailed';
export type ExtractionVariants = Partial<Record<ExtractionPreset, SourcedYOp[]>>;

export type ExtractionLLMOutcome =
  | {
      kind: 'ok';
      warnings: ExtractionWarning[];
    }
  | {
      kind: 'partial';
      warnings: ExtractionWarning[];
      dropped: DroppedExtractionItem[];
      reason: string;
      message: string;
      details?: Record<string, unknown>;
    };

export interface ExtractionLLMResult {
  ops: SourcedYOp[];
  variants?: ExtractionVariants;
  outcome?: ExtractionLLMOutcome;
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

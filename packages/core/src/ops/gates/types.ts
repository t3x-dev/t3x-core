/**
 * Gate Types
 *
 * Pure validation gates for the extraction pipeline.
 * Gates run after YAML parse, before MeaningPipeline.
 */

/** A single gate violation */
export interface GateViolation {
  /** Which gate produced this */
  gate: 'source' | 'dedup';
  /** Severity: 'error' = reject the op, 'warning' = advisory */
  severity: 'error' | 'warning';
  /** YOp index that failed (-1 for post-apply checks) */
  opIndex: number;
  /** Human-readable message */
  message: string;
}

/** Result from a single gate */
export interface GateResult {
  gate: string;
  passed: boolean;
  violations: GateViolation[];
}

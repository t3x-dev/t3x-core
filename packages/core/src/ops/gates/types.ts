/**
 * Gate Types
 *
 * Pure validation gates for the extraction pipeline.
 * Gates run after YAML parse, before MeaningPipeline.
 */

/** A single gate violation */
export interface GateViolation {
	/** Which gate produced this */
	gate: 'source' | 'dedup' | 'structure';
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

/** Aggregated report from all gates */
export interface GateReport {
	source: GateResult;
	dedup: GateResult;
	structure: GateResult;
	/** Indices of YOps that should be rejected (severity === 'error') */
	rejectedOpIndices: number[];
	/** All violations for LLM feedback */
	allViolations: GateViolation[];
}

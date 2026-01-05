import { z } from 'zod';

/**
 * CheckResult - Result of a single rule check
 *
 * Contains the outcome of evaluating one rule against the RunRecord.
 */
export const CheckResultSchema = z.object({
  rule_id: z.string(),
  passed: z.boolean(),
  score: z.number().min(0).max(1), // 0 if failed, weight if passed

  actual: z.unknown(), // Actual value found
  expected: z.unknown(), // Expected value
  message: z.string(), // Human-readable result description
});

export type CheckResult = z.infer<typeof CheckResultSchema>;

/**
 * Violation - A rule violation for LLM assertion generation
 *
 * Represents a failed check that should be reported to the LLM Asserter.
 */
export const ViolationSchema = z.object({
  rule_id: z.string(),
  severity: z.enum(['error', 'warning']),
  message: z.string(),
  step_id: z.string().optional(), // Which step caused the violation
});

export type Violation = z.infer<typeof ViolationSchema>;

/**
 * EvalResult - Complete evaluation result
 *
 * The deterministic output of the Evaluator. Contains pass/fail judgment,
 * weighted score, and violations for LLM assertion generation.
 */
export const EvalResultSchema = z.object({
  run_id: z.string(),
  rules_version: z.string(), // Version of eval rules used
  evaluated_at: z.string().datetime(),

  // Deterministic judgment
  passed: z.boolean(),
  score: z.number().min(0).max(1), // Weighted score

  // Individual check results
  checks: z.array(CheckResultSchema),

  // Violations (for LLM Asserter)
  violations: z.array(ViolationSchema),
});

export type EvalResult = z.infer<typeof EvalResultSchema>;

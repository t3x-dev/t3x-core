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
  skipped: z.boolean().optional(), // true if rule was skipped (v2.0)

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
 * DimensionScores - Scores by evaluation dimension (v2.0)
 */
export const DimensionScoresSchema = z.object({
  task_completion: z.number().min(0).max(1), // Task completion score
  tool_use: z.number().min(0).max(1), // Tool usage correctness
  trajectory_efficiency: z.number().min(0).max(1), // Path efficiency
  cost_efficiency: z.number().min(0).max(1), // Token/cost efficiency
  latency: z.number().min(0).max(1), // Performance score
});

export type DimensionScores = z.infer<typeof DimensionScoresSchema>;

/**
 * TrajectorySummary - Execution path statistics (v2.0)
 */
export const TrajectorySummarySchema = z.object({
  total_steps: z.number(),
  llm_calls: z.number(),
  tool_calls: z.number(),
  retrieval_calls: z.number(),
  failed_steps: z.number(),
  backtrack_count: z.number(), // Number of retries/backtracks
});

export type TrajectorySummary = z.infer<typeof TrajectorySummarySchema>;

/**
 * TokenStats - Token usage statistics (v2.0)
 */
export const TokenStatsSchema = z.object({
  prompt_tokens: z.number(),
  completion_tokens: z.number(),
  total_tokens: z.number(),
  cost_usd: z.number().optional(), // Estimated cost in USD
});

export type TokenStats = z.infer<typeof TokenStatsSchema>;

/**
 * EvalResult - Complete evaluation result
 *
 * The deterministic output of the Evaluator. Contains pass/fail judgment,
 * weighted score, and violations for LLM assertion generation.
 *
 * v2.0 enhancements:
 * - Added dimension_scores for multi-dimension evaluation
 * - Added trajectory_summary for execution path analysis
 * - Added token_stats for cost tracking
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

  // Dimension scores (v2.0)
  dimension_scores: DimensionScoresSchema.optional(),

  // Trajectory summary (v2.0)
  trajectory_summary: TrajectorySummarySchema.optional(),

  // Token statistics (v2.0)
  token_stats: TokenStatsSchema.optional(),
});

export type EvalResult = z.infer<typeof EvalResultSchema>;

import { z } from 'zod';

/**
 * Rule operators (v1.0 basic + v2.0 agent-specific)
 */
export const RuleOperatorSchema = z.enum([
  // Basic operators (v1.0)
  'exists', // Field exists
  'not_empty', // Field is not empty
  'equals', // Field equals value
  'not_equals', // Field does not equal value
  'contains', // Field contains value
  'not_contains', // Field does not contain value
  'regex', // Field matches regex pattern
  'range', // Number is within range
  'some', // At least one item in array matches condition
  'all', // All items in array match condition
  'none', // No items in array match condition
  // Agent-specific operators (v2.0)
  'expected_tools', // Check if expected tools were used
  'no_unknown_tools', // Check no unknown tools were called
  'step_count', // Check total step count
  'no_repeated_steps', // Check no repeated tool calls
  'total_tokens', // Check total token usage
  'total_latency_ms', // Check total latency
]);

export type RuleOperator = z.infer<typeof RuleOperatorSchema>;

/**
 * Rule type - Used for dimension scoring (v2.0)
 */
export const RuleTypeSchema = z.enum([
  'basic', // Basic output/status checks
  'tool_use', // Tool usage correctness
  'trajectory', // Execution path efficiency
  'cost', // Token/API cost
  'performance', // Latency/speed
]);

export type RuleType = z.infer<typeof RuleTypeSchema>;

/**
 * Rule - A single evaluation rule
 *
 * Defines a check to perform on a RunRecord.
 *
 * v2.0 enhancements:
 * - Added type for dimension scoring
 * - Added expected for tool list checks
 * - Added skip_if_empty for conditional execution
 */
export const RuleSchema = z.object({
  id: z.string(),
  name: z.string().optional(),

  // Rule type for dimension scoring (v2.0)
  type: RuleTypeSchema.optional().default('basic'),

  // What to check
  target: z.string(), // "output", "steps", or JSON path like "output.result"

  // How to check
  check: RuleOperatorSchema,

  // Check parameters (depend on operator)
  value: z.unknown().optional(), // for equals, contains
  pattern: z.string().optional(), // for regex
  min: z.number().optional(), // for range
  max: z.number().optional(), // for range
  condition: z.record(z.string(), z.unknown()).optional(), // for some/all/none

  // Agent-specific parameters (v2.0)
  expected: z.array(z.string()).optional(), // for expected_tools, no_unknown_tools
  skip_if_empty: z.boolean().optional(), // skip rule if target data is empty

  // Scoring
  weight: z.number().min(0).max(1),
  severity: z.enum(['error', 'warning']).default('error'),
});

export type Rule = z.infer<typeof RuleSchema>;

/**
 * EvalRules - Complete evaluation rules configuration
 *
 * Loaded from a YAML file, defines all rules for evaluating a run.
 */
export const EvalRulesSchema = z.object({
  version: z.string(),
  name: z.string().optional(),
  description: z.string().optional(),

  // Rules list
  rules: z.array(RuleSchema).min(1),

  // Pass threshold (0-1)
  pass_threshold: z.number().min(0).max(1),
});

export type EvalRules = z.infer<typeof EvalRulesSchema>;

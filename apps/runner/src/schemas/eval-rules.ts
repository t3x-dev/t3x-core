import { z } from 'zod';

/**
 * Rule operators
 */
export const RuleOperatorSchema = z.enum([
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
]);

export type RuleOperator = z.infer<typeof RuleOperatorSchema>;

/**
 * Rule - A single evaluation rule
 *
 * Defines a check to perform on a RunRecord.
 */
export const RuleSchema = z.object({
  id: z.string(),
  name: z.string().optional(),

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

import { z } from 'zod';
import { RunTraceSchema } from './trace.js';
import { TestStepSchema, TestResultSchema } from './test-step.js';

/**
 * Eval request
 */
export const EvalRequestSchema = z.object({
  run_id: z.string().optional(),
  trace: RunTraceSchema.optional(),
  test_steps: z.array(TestStepSchema),
  options: z
    .object({
      stop_on_first_failure: z.boolean().default(false),
      generate_suggestions: z.boolean().default(true),
    })
    .optional(),
});

export type EvalRequest = z.infer<typeof EvalRequestSchema>;

/**
 * Eval response
 */
export const EvalResponseSchema = z.object({
  run_id: z.string(),
  passed: z.boolean(),
  total_steps: z.number(),
  passed_steps: z.number(),
  failed_steps: z.number(),
  results: z.array(TestResultSchema),
  suggestions: z
    .array(
      z.object({
        type: z.enum(['prompt_change', 'config_change', 'tool_fix', 'other']),
        description: z.string(),
        confidence: z.number(),
        diff: z.string().optional(),
      })
    )
    .optional(),
  t3x_commit_id: z.string().optional(),
});

export type EvalResponse = z.infer<typeof EvalResponseSchema>;

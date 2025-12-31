import { z } from 'zod';

/**
 * Step Record - A single execution step in a run
 *
 * Represents one node/step in the workflow execution (e.g., an n8n node).
 */
export const StepRecordSchema = z.object({
  step_id: z.string(),
  step_index: z.number(), // Execution order (0-based)

  // Step identification
  name: z.string(), // Step name, e.g., "AI Agent", "HTTP Request"
  type: z.string(), // Step type, e.g., "webhook", "ai_agent", "http_request"

  // Input/Output
  input: z.unknown(),
  output: z.unknown(),

  // Performance
  latency_ms: z.number(),

  // LLM-specific (only for LLM call steps)
  tokens: z
    .object({
      in: z.number(),
      out: z.number(),
    })
    .optional(),

  // Status
  status: z.enum(['ok', 'error']),
  error: z.string().optional(),
});

export type StepRecord = z.infer<typeof StepRecordSchema>;

/**
 * Run Record - Complete execution record for a single run
 *
 * Contains all information about a workflow execution, including
 * inputs, outputs, execution steps (trace), and timing.
 */
export const RunRecordSchema = z.object({
  run_id: z.string(),
  status: z.enum(['pending', 'running', 'completed', 'failed']),

  // Input/Output
  inputs: z.record(z.string(), z.unknown()),
  output: z.unknown().optional(),

  // Execution steps (trace)
  steps: z.array(StepRecordSchema),

  // Timing
  timing: z.object({
    started_at: z.string().datetime(),
    ended_at: z.string().datetime().optional(),
    total_ms: z.number().optional(),
  }),

  // Error (if failed)
  error: z
    .object({
      code: z.string(),
      message: z.string(),
      step_id: z.string().optional(), // Which step caused the error
    })
    .optional(),

  // Source metadata
  source: z
    .object({
      system: z.enum(['n8n', 'langchain', 'custom']),
      execution_id: z.string().optional(), // e.g., n8n execution ID
    })
    .optional(),
});

export type RunRecord = z.infer<typeof RunRecordSchema>;

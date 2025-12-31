import { z } from 'zod';

/**
 * Captured I/O trace event
 */
export const TraceEventSchema = z.object({
  id: z.string(),
  timestamp: z.string().datetime(),
  type: z.enum(['llm_call', 'tool_call', 'agent_input', 'agent_output', 'error']),
  data: z.object({
    input: z.unknown().optional(),
    output: z.unknown().optional(),
    model: z.string().optional(),
    tool_name: z.string().optional(),
    latency_ms: z.number().optional(),
    error: z.string().optional(),
  }),
});

export type TraceEvent = z.infer<typeof TraceEventSchema>;

/**
 * Full run trace
 */
export const RunTraceSchema = z.object({
  run_id: z.string(),
  agent_id: z.string(),
  started_at: z.string().datetime(),
  completed_at: z.string().datetime().optional(),
  status: z.enum(['running', 'completed', 'failed', 'timeout']),
  input: z.record(z.string(), z.unknown()),
  output: z.unknown().optional(),
  events: z.array(TraceEventSchema),
  metrics: z
    .object({
      total_latency_ms: z.number().optional(),
      llm_calls: z.number().default(0),
      tool_calls: z.number().default(0),
      tokens_used: z.number().optional(),
    })
    .optional(),
});

export type RunTrace = z.infer<typeof RunTraceSchema>;

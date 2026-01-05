import { z } from 'zod';

/**
 * Engine -> Runner run request
 */
export const EngineRunRequestSchema = z.object({
  run_id: z.string(),
  commit_ref: z.string().optional(),
  leaf: z
    .object({
      id: z.string(),
      type: z.enum(['deploy', 'eval']),
      content: z.string().optional(),
    })
    .optional(),
  inputs: z.record(z.string(), z.unknown()).optional(),
  callback_url: z.string(), // Runner's callback URL for n8n
  engine_callback_url: z.string(), // Engine's ingest URL
  workflow: z
    .object({
      type: z.string(),
      webhook_id: z.string().optional(),
    })
    .optional(),
});

export type EngineRunRequest = z.infer<typeof EngineRunRequestSchema>;

/**
 * n8n -> Runner callback
 */
export const N8nCallbackSchema = z.object({
  runner_run_id: z.string(),
  run_id: z.string(),
  execution_id: z.string().optional(), // n8n execution ID for trace collection
  output: z.record(z.string(), z.unknown()).optional(),
  meta: z
    .object({
      latency_ms: z.number().optional(),
      tokens: z.number().optional(),
    })
    .optional(),
  error: z.string().nullable().optional(),
});

export type N8nCallback = z.infer<typeof N8nCallbackSchema>;

/**
 * Runner -> Engine ingest
 */
export const RunIngestSchema = z.object({
  run_id: z.string(),
  commit_ref: z.string().optional(),
  runner_run_id: z.string(),
  status: z.enum(['completed', 'failed']),
  run_report: z.record(z.string(), z.unknown()).optional(),
  assertions: z.array(z.unknown()).optional(),
  evidence_pack: z.record(z.string(), z.unknown()).optional(),
});

export type RunIngest = z.infer<typeof RunIngestSchema>;

/**
 * Pending run info (stored in memory for callback handling)
 */
export interface PendingRun {
  run_id: string;
  engine_callback_url: string;
  started_at: string;
  inputs?: Record<string, unknown>;
  leaf?: { id: string; type: 'deploy' | 'eval'; content?: string };
}

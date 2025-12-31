import { z } from 'zod';

/**
 * Agent registration config
 */
export const AgentConfigSchema = z.object({
  id: z.string(),
  name: z.string(),
  endpoint: z.string().url(),
  type: z.enum(['http', 'websocket', 'subprocess']).default('http'),
  auth: z
    .object({
      type: z.enum(['none', 'bearer', 'api_key', 'basic']).default('none'),
      token: z.string().optional(),
      header: z.string().optional(),
    })
    .optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export type AgentConfig = z.infer<typeof AgentConfigSchema>;

/**
 * Agent run request
 */
export const AgentInputSchema = z.object({
  agent_id: z.string(),
  input: z.record(z.string(), z.unknown()),
  config: z
    .object({
      timeout_ms: z.number().default(30000),
      capture_llm_calls: z.boolean().default(true),
      capture_tool_calls: z.boolean().default(true),
    })
    .optional(),
});

export type AgentInput = z.infer<typeof AgentInputSchema>;

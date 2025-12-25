import { z } from 'zod';

// Agent run request
export const AgentInputSchema = z.object({
  agent_id: z.string(),
  input: z.record(z.unknown()),
  config: z.object({
    timeout_ms: z.number().default(30000),
    capture_llm_calls: z.boolean().default(true),
    capture_tool_calls: z.boolean().default(true),
  }).optional(),
});

export type AgentInput = z.infer<typeof AgentInputSchema>;

// Captured I/O trace
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

// Full run trace
export const RunTraceSchema = z.object({
  run_id: z.string(),
  agent_id: z.string(),
  started_at: z.string().datetime(),
  completed_at: z.string().datetime().optional(),
  status: z.enum(['running', 'completed', 'failed', 'timeout']),
  input: z.record(z.unknown()),
  output: z.unknown().optional(),
  events: z.array(TraceEventSchema),
  metrics: z.object({
    total_latency_ms: z.number().optional(),
    llm_calls: z.number().default(0),
    tool_calls: z.number().default(0),
    tokens_used: z.number().optional(),
  }).optional(),
});

export type RunTrace = z.infer<typeof RunTraceSchema>;

// Test step definition
export const TestStepSchema = z.object({
  id: z.string(),
  name: z.string(),
  type: z.enum([
    'contains',
    'not_contains',
    'regex',
    'json_path',
    'semantic',
    'custom',
    // New assertion types for agent eval
    'json_schema',      // Validate output structure
    'trace_must_call',  // Tool must be called
    'trace_order',      // Tool A before Tool B
  ]),
  target: z.enum(['input', 'output', 'llm_call', 'tool_call', 'trace']),
  assertion: z.object({
    value: z.string().optional(),
    pattern: z.string().optional(),
    path: z.string().optional(),
    threshold: z.number().optional(),
    fn: z.string().optional(), // for custom assertions
    // New fields for agent assertions
    schema: z.record(z.unknown()).optional(),  // JSON schema for json_schema
    tool: z.string().optional(),               // Tool name for trace_must_call
    before: z.string().optional(),             // For trace_order
    after: z.string().optional(),              // For trace_order
  }),
  severity: z.enum(['error', 'warning', 'info']).default('error'),
});

export type TestStep = z.infer<typeof TestStepSchema>;

// Eval request
export const EvalRequestSchema = z.object({
  run_id: z.string().optional(),
  trace: RunTraceSchema.optional(),
  test_steps: z.array(TestStepSchema),
  options: z.object({
    stop_on_first_failure: z.boolean().default(false),
    generate_suggestions: z.boolean().default(true),
  }).optional(),
});

export type EvalRequest = z.infer<typeof EvalRequestSchema>;

// Test result
export const TestResultSchema = z.object({
  step_id: z.string(),
  step_name: z.string(),
  passed: z.boolean(),
  severity: z.enum(['error', 'warning', 'info']),
  message: z.string().optional(),
  expected: z.unknown().optional(),
  actual: z.unknown().optional(),
  suggestion: z.string().optional(),
});

export type TestResult = z.infer<typeof TestResultSchema>;

// Eval response
export const EvalResponseSchema = z.object({
  run_id: z.string(),
  passed: z.boolean(),
  total_steps: z.number(),
  passed_steps: z.number(),
  failed_steps: z.number(),
  results: z.array(TestResultSchema),
  suggestions: z.array(z.object({
    type: z.enum(['prompt_change', 'config_change', 'tool_fix', 'other']),
    description: z.string(),
    confidence: z.number(),
    diff: z.string().optional(),
  })).optional(),
  t3x_commit_id: z.string().optional(),
});

export type EvalResponse = z.infer<typeof EvalResponseSchema>;

// Agent registration
export const AgentConfigSchema = z.object({
  id: z.string(),
  name: z.string(),
  endpoint: z.string().url(),
  type: z.enum(['http', 'websocket', 'subprocess']).default('http'),
  auth: z.object({
    type: z.enum(['none', 'bearer', 'api_key', 'basic']).default('none'),
    token: z.string().optional(),
    header: z.string().optional(),
  }).optional(),
  metadata: z.record(z.unknown()).optional(),
});

export type AgentConfig = z.infer<typeof AgentConfigSchema>;

import { z } from 'zod';

/**
 * Test step definition
 */
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
    // Agent eval assertion types
    'json_schema', // Validate output structure
    'trace_must_call', // Tool must be called
    'trace_order', // Tool A before Tool B
  ]),
  target: z.enum(['input', 'output', 'llm_call', 'tool_call', 'trace']),
  assertion: z.object({
    value: z.string().optional(),
    pattern: z.string().optional(),
    path: z.string().optional(),
    threshold: z.number().optional(),
    fn: z.string().optional(), // for custom assertions
    // Agent assertion fields
    schema: z.record(z.string(), z.unknown()).optional(), // JSON schema for json_schema
    tool: z.string().optional(), // Tool name for trace_must_call
    before: z.string().optional(), // For trace_order
    after: z.string().optional(), // For trace_order
  }),
  severity: z.enum(['error', 'warning', 'info']).default('error'),
});

export type TestStep = z.infer<typeof TestStepSchema>;

/**
 * Test result
 */
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

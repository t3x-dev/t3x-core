import { z } from 'zod';

/**
 * SpanKind - Step type classification
 *
 * Inspired by Arize Phoenix span design:
 * - chain: General flow node (default)
 * - llm: LLM call node
 * - tool: Tool invocation node
 * - retriever: Retrieval node (RAG)
 * - workflow: Workflow container node
 */
export const SpanKindSchema = z.enum(['chain', 'llm', 'tool', 'retriever', 'workflow']);
export type SpanKind = z.infer<typeof SpanKindSchema>;

/**
 * LLM Data - Details for LLM call steps (span_kind='llm')
 */
export const LLMDataSchema = z.object({
  model: z.string(),
  provider: z.string().optional(),
  messages: z.array(z.object({
    role: z.string(),
    content: z.string(),
  })).optional(),
  tokens: z.object({
    prompt: z.number(),
    completion: z.number(),
    total: z.number(),
  }),
  temperature: z.number().optional(),
  max_tokens: z.number().optional(),
});
export type LLMData = z.infer<typeof LLMDataSchema>;

/**
 * Tool Data - Details for tool call steps (span_kind='tool')
 */
export const ToolDataSchema = z.object({
  tool_name: z.string(),
  tool_input: z.unknown(),
  tool_output: z.unknown(),
  was_expected: z.boolean().optional(),
});
export type ToolData = z.infer<typeof ToolDataSchema>;

/**
 * Retrieved Document - A single document from retrieval
 */
export const RetrievedDocumentSchema = z.object({
  content: z.string(),
  score: z.number().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});
export type RetrievedDocument = z.infer<typeof RetrievedDocumentSchema>;

/**
 * Retrieval Data - Details for retrieval steps (span_kind='retriever')
 */
export const RetrievalDataSchema = z.object({
  query: z.string(),
  documents: z.array(RetrievedDocumentSchema),
  top_k: z.number().optional(),
});
export type RetrievalData = z.infer<typeof RetrievalDataSchema>;

/**
 * Step Record - A single execution step in a run
 *
 * Represents one node/step in the workflow execution (e.g., an n8n node).
 *
 * v2.0 enhancements:
 * - Added span_kind for step type classification
 * - Added parent_step_id for nested span support
 * - Added llm/tool/retrieval fields (conditionally populated based on span_kind)
 */
export const StepRecordSchema = z.object({
  step_id: z.string(),
  step_index: z.number(), // Execution order (0-based)

  // Step identification
  name: z.string(), // Step name, e.g., "AI Agent", "HTTP Request"
  type: z.string(), // Step type, e.g., "webhook", "ai_agent", "http_request"

  // Span hierarchy (v2.0)
  parent_step_id: z.string().optional(),
  span_kind: SpanKindSchema.optional().default('chain'),

  // Input/Output
  input: z.unknown(),
  output: z.unknown(),

  // Performance
  latency_ms: z.number(),

  // Legacy tokens field (kept for backward compatibility)
  tokens: z
    .object({
      in: z.number(),
      out: z.number(),
    })
    .optional(),

  // LLM-specific (v2.0, populated when span_kind='llm')
  llm: LLMDataSchema.optional(),

  // Tool-specific (v2.0, populated when span_kind='tool')
  tool: ToolDataSchema.optional(),

  // Retrieval-specific (v2.0, populated when span_kind='retriever')
  retrieval: RetrievalDataSchema.optional(),

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

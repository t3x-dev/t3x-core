/**
 * n8n Execution to RunRecord Mapper
 *
 * Converts n8n execution data to standardized RunRecord format.
 *
 * v2.0 enhancements:
 * - Added span_kind inference based on node type
 * - Added LLM/Tool/Retrieval data extraction
 */

import { logger } from '../lib/logger.js';
import type {
  LLMData,
  RetrievalData,
  RunRecord,
  SpanKind,
  StepRecord,
  ToolData,
} from '../schemas/run-record.js';
import type { N8nExecution, N8nNodeRun, N8nRunData } from './types.js';

/**
 * Mapping options
 */
export interface MapperOptions {
  /** Custom run_id to use (otherwise uses n8n execution id) */
  runId?: string;
  /** Include full input/output data (may be large). Default: true */
  includeFullData?: boolean;
  /** Maximum size of input/output to include (bytes). Default: 100KB */
  maxDataSize?: number;
}

const DEFAULT_OPTIONS: Required<MapperOptions> = {
  runId: '',
  includeFullData: true,
  maxDataSize: 100 * 1024, // 100KB
};

/**
 * Map n8n node type to standardized step type
 */
function mapNodeType(nodeName: string, nodeType?: string): string {
  // Use node type if available from workflow data
  const typeToCheck = nodeType || nodeName;

  // Normalize: remove prefixes and convert to lowercase
  const normalized = typeToCheck
    .replace('n8n-nodes-base.', '')
    .replace('@n8n/n8n-nodes-langchain.', 'langchain.')
    .toLowerCase();

  // Map common node types to standard names
  const typeMap: Record<string, string> = {
    webhook: 'webhook',
    respondtowebhook: 'webhook_response',
    httprequest: 'http_request',
    set: 'transform',
    if: 'condition',
    switch: 'condition',
    code: 'code',
    function: 'code',
    'langchain.agent': 'ai_agent',
    'langchain.lmchatopenai': 'llm_call',
    'langchain.lmchatanthropic': 'llm_call',
    'langchain.lmchatollama': 'llm_call',
    'langchain.tool': 'tool_call',
    'langchain.memorybufferwindow': 'memory',
    'langchain.chainllm': 'llm_call',
    openai: 'llm_call',
    anthropic: 'llm_call',
  };

  // Check for partial matches
  for (const [key, value] of Object.entries(typeMap)) {
    if (normalized.includes(key)) {
      return value;
    }
  }

  // Fallback to the normalized name
  return normalized.replace(/\s+/g, '_');
}

/**
 * Infer span_kind from step type (v2.0)
 *
 * Note: LangChain tools are detected via ai_tool data in mapNodeRunsToSteps(),
 * so we don't include http_request as 'tool' here to avoid false positives
 * (e.g., Callback Runner HTTP requests should not be counted as AI tools).
 */
function inferSpanKind(stepType: string): SpanKind {
  // LLM-related types
  if (['llm_call', 'ai_agent'].includes(stepType)) {
    return 'llm';
  }

  // Tool-related types (only explicit tool_call, not http_request)
  // LangChain tools are detected via ai_tool data separately
  if (stepType === 'tool_call') {
    return 'tool';
  }

  // Retrieval-related types
  if (stepType.includes('retriev') || stepType.includes('vector')) {
    return 'retriever';
  }

  // Workflow containers
  if (stepType === 'webhook' || stepType === 'webhook_response') {
    return 'workflow';
  }

  // Default to chain (includes http_request, transform, etc.)
  return 'chain';
}

/**
 * Extract LLM data from node output (v2.0)
 *
 * n8n stores LLM data in different locations:
 * - Token usage: nodeRun.data.ai_languageModel[0][0].json.tokenUsageEstimate
 * - Model info: nodeRun.inputOverride.ai_languageModel[0][0].json.options.model
 */
function extractLLMData(nodeRun: N8nNodeRun, output: unknown): LLMData | undefined {
  // Try to extract from n8n's ai_languageModel data first (preferred)
  // n8n stores LLM data in nodeRun.data.ai_languageModel (not in data.main)
  const nodeData = nodeRun.data as unknown as Record<string, unknown> | undefined;
  const aiLmData = nodeData?.ai_languageModel as unknown[][][] | undefined;
  const nodeRunAny = nodeRun as unknown as Record<string, unknown>;
  const aiLmInput = nodeRunAny.inputOverride as Record<string, unknown> | undefined;
  const aiLmInputData = aiLmInput?.ai_languageModel as unknown[][][] | undefined;

  // Extract token usage from ai_languageModel output
  let promptTokens = 0;
  let completionTokens = 0;
  let totalTokens = 0;
  let model = 'unknown';

  if (aiLmData?.[0]?.[0]) {
    const lmOutput = (Array.isArray(aiLmData[0][0]) ? null : aiLmData[0][0]) as Record<
      string,
      unknown
    > | null;
    const json = lmOutput?.json as Record<string, unknown> | undefined;

    // n8n uses tokenUsage (not tokenUsageEstimate)
    const tokenUsage = (json?.tokenUsage || json?.tokenUsageEstimate) as
      | Record<string, number>
      | undefined;
    if (tokenUsage) {
      promptTokens = tokenUsage.promptTokens || 0;
      completionTokens = tokenUsage.completionTokens || 0;
      totalTokens = tokenUsage.totalTokens || 0;
    }
  }

  // Extract model from inputOverride
  if (aiLmInputData?.[0]?.[0]) {
    const lmInput = (Array.isArray(aiLmInputData[0][0]) ? null : aiLmInputData[0][0]) as Record<
      string,
      unknown
    > | null;
    const json = lmInput?.json as Record<string, unknown> | undefined;
    const options = json?.options as Record<string, unknown> | undefined;
    if (options?.model) {
      model = options.model as string;
    }
  }

  // Fallback: Try to extract from output object (for non-n8n sources)
  if (totalTokens === 0) {
    const outputObj = output as Record<string, unknown> | undefined;
    if (outputObj) {
      const usage = outputObj.usage as Record<string, number> | undefined;
      const tokenUsage = outputObj.tokenUsage as Record<string, number> | undefined;
      const tokens = usage || tokenUsage;
      if (tokens) {
        promptTokens = tokens.prompt_tokens || tokens.promptTokens || 0;
        completionTokens = tokens.completion_tokens || tokens.completionTokens || 0;
        totalTokens = tokens.total_tokens || tokens.totalTokens || 0;
      }
      if (model === 'unknown') {
        model = (outputObj.model as string) || (outputObj.modelId as string) || 'unknown';
      }
    }
  }

  return {
    model,
    provider: extractProvider(model),
    tokens: {
      prompt: promptTokens,
      completion: completionTokens,
      total: totalTokens,
    },
  };
}

/**
 * Extract provider from model name
 */
function extractProvider(model: string): string {
  const modelLower = model.toLowerCase();
  if (modelLower.includes('gpt') || modelLower.includes('openai')) return 'openai';
  if (modelLower.includes('claude') || modelLower.includes('anthropic')) return 'anthropic';
  if (modelLower.includes('llama') || modelLower.includes('ollama')) return 'ollama';
  if (modelLower.includes('gemini') || modelLower.includes('google')) return 'google';
  return 'unknown';
}

/**
 * Extract Tool data from node (v2.0)
 */
function extractToolData(
  nodeName: string,
  _nodeRun: N8nNodeRun,
  input: unknown,
  output: unknown
): ToolData | undefined {
  return {
    tool_name: nodeName,
    tool_input: input,
    tool_output: output,
  };
}

/**
 * Extract Retrieval data from node (v2.0)
 */
function extractRetrievalData(
  _nodeRun: N8nNodeRun,
  input: unknown,
  output: unknown
): RetrievalData | undefined {
  const inputObj = input as Record<string, unknown> | undefined;
  const outputObj = output as Record<string, unknown> | undefined;

  // Try to extract query
  const query = (inputObj?.query as string) || (inputObj?.search as string) || '';

  // Try to extract documents from output
  const docs =
    (outputObj?.documents as Array<Record<string, unknown>>) ||
    (outputObj?.results as Array<Record<string, unknown>>) ||
    [];

  return {
    query,
    documents: docs.map((doc) => ({
      content: (doc.content as string) || (doc.text as string) || JSON.stringify(doc),
      score: doc.score as number | undefined,
      metadata: doc.metadata as Record<string, unknown> | undefined,
    })),
  };
}

/**
 * Extract input from node run data
 */
function extractInput(nodeRun: N8nNodeRun): unknown {
  // For most nodes, input comes from source nodes
  // We can't directly get input from n8n API, so we return the source info
  if (nodeRun.source && nodeRun.source.length > 0) {
    return { from_nodes: nodeRun.source.map((s) => s.previousNode) };
  }
  return undefined;
}

/**
 * Extract output from node run data
 */
function extractOutput(nodeRun: N8nNodeRun, options: Required<MapperOptions>): unknown {
  const mainOutput = nodeRun.data?.main?.[0];
  if (!mainOutput || mainOutput.length === 0) {
    return undefined;
  }

  // Get JSON data from all items
  const output = mainOutput.map((item) => item.json);

  // If single item, unwrap
  const result = output.length === 1 ? output[0] : output;

  if (!options.includeFullData) {
    return { _data_omitted: true };
  }

  // Truncate if too large
  if (options.maxDataSize > 0) {
    const jsonStr = JSON.stringify(result);
    if (jsonStr.length > options.maxDataSize) {
      return {
        _truncated: true,
        _original_size: jsonStr.length,
        _preview: jsonStr.slice(0, 1000) + '...',
      };
    }
  }

  return result;
}

/**
 * Extract output from ai_tool data (for LangChain tool nodes)
 *
 * n8n stores LangChain tool output in nodeRun.data.ai_tool
 * Format: [[{json: {response: "..."}}]]
 */
function extractAiToolOutput(nodeData: Record<string, unknown>): unknown {
  const aiToolData = nodeData.ai_tool;
  if (!aiToolData || !Array.isArray(aiToolData)) {
    return undefined;
  }

  // Navigate: aiToolData[0][0]
  const firstLevel = aiToolData[0];
  if (!firstLevel || !Array.isArray(firstLevel)) {
    return undefined;
  }

  const firstItem = firstLevel[0] as unknown;
  if (!firstItem || typeof firstItem !== 'object') {
    return firstItem;
  }

  const itemObj = firstItem as Record<string, unknown>;
  if (!itemObj.json) {
    return firstItem;
  }

  // Return the json content (which may contain the tool response)
  return itemObj.json;
}

/**
 * Estimate token count from output (rough approximation)
 */
function estimateTokens(data: unknown): { in: number; out: number } | undefined {
  if (!data) return undefined;

  try {
    const jsonStr = JSON.stringify(data);
    // Rough approximation: 1 token ~= 4 characters
    const tokens = Math.ceil(jsonStr.length / 4);

    // We can't distinguish input/output tokens without more context
    return { in: 0, out: tokens };
  } catch {
    return undefined;
  }
}

/**
 * Convert node runs to step records
 */
function mapNodeRunsToSteps(
  runData: N8nRunData,
  options: Required<MapperOptions>,
  workflowNodes?: Map<string, string>
): StepRecord[] {
  const steps: StepRecord[] = [];

  // Sort nodes by startTime to get execution order
  const nodeEntries = Object.entries(runData)
    .flatMap(([nodeName, runs]) =>
      runs.map((run, runIndex) => ({
        nodeName,
        run,
        runIndex,
        startTime: run.startTime,
      }))
    )
    .sort((a, b) => a.startTime - b.startTime);

  nodeEntries.forEach((entry, index) => {
    const { nodeName, run, runIndex } = entry;

    // Get node type from workflow data if available
    const nodeType = workflowNodes?.get(nodeName);
    const stepType = mapNodeType(nodeName, nodeType);

    // Check if this is a LangChain tool node (has ai_tool data)
    const runAny = run as unknown as Record<string, unknown>;
    const nodeData = runAny.data as Record<string, unknown> | undefined;
    const hasAiToolData = nodeData && 'ai_tool' in nodeData;

    // Infer span_kind from step type (v2.0)
    // Override to 'tool' if ai_tool data is present (LangChain tool nodes)
    const spanKind: SpanKind = hasAiToolData ? 'tool' : inferSpanKind(stepType);

    // Extract input/output
    const input = extractInput(run);
    // For tool nodes with ai_tool data, extract from ai_tool instead of main
    const output = hasAiToolData ? extractAiToolOutput(nodeData) : extractOutput(run, options);

    const step: StepRecord = {
      step_id: `step_${nodeName.toLowerCase().replace(/\s+/g, '_')}_${runIndex}`,
      step_index: index,
      name: nodeName,
      type: stepType,
      span_kind: spanKind,
      input,
      output,
      latency_ms: run.executionTime,
      status: run.error ? 'error' : 'ok',
      error: run.error?.message,
    };

    // Add legacy token estimate for backward compatibility
    if (stepType === 'llm_call' || stepType === 'ai_agent') {
      step.tokens = estimateTokens(step.output);
    }

    // Add span-specific data based on span_kind (v2.0)
    if (spanKind === 'llm') {
      step.llm = extractLLMData(run, output);
    } else if (spanKind === 'tool') {
      step.tool = extractToolData(nodeName, run, input, output);
    } else if (spanKind === 'retriever') {
      step.retrieval = extractRetrievalData(run, input, output);
    }

    steps.push(step);
  });

  return steps;
}

/**
 * Map n8n execution status to RunRecord status
 */
function mapStatus(execution: N8nExecution): 'pending' | 'running' | 'completed' | 'failed' {
  switch (execution.status) {
    case 'new':
      return 'pending';
    case 'running':
    case 'waiting':
      return 'running';
    case 'success':
      return 'completed';
    case 'error':
    case 'canceled':
    case 'crashed':
      return 'failed';
    default:
      return execution.finished ? 'completed' : 'running';
  }
}

/**
 * Extract error information from execution
 */
function extractError(
  execution: N8nExecution
): { code: string; message: string; step_id?: string } | undefined {
  const resultError = execution.data?.resultData?.error;
  if (!resultError) {
    return undefined;
  }

  return {
    code: 'N8N_EXECUTION_ERROR',
    message: resultError.message,
    step_id: resultError.node
      ? `step_${resultError.node.toLowerCase().replace(/\s+/g, '_')}_0`
      : undefined,
  };
}

/**
 * Extract final output from execution
 */
function extractFinalOutput(execution: N8nExecution): unknown {
  const runData = execution.data?.resultData?.runData;
  const lastNode = execution.data?.resultData?.lastNodeExecuted;

  if (!runData || !lastNode) {
    return undefined;
  }

  const lastNodeRuns = runData[lastNode];
  if (!lastNodeRuns || lastNodeRuns.length === 0) {
    return undefined;
  }

  const lastRun = lastNodeRuns[lastNodeRuns.length - 1];
  const mainOutput = lastRun.data?.main?.[0];

  if (!mainOutput || mainOutput.length === 0) {
    return undefined;
  }

  // Return all JSON outputs from last node
  const outputs = mainOutput.map((item) => item.json);
  return outputs.length === 1 ? outputs[0] : outputs;
}

/**
 * Extract inputs from webhook node (if present)
 */
function extractInputs(execution: N8nExecution): Record<string, unknown> {
  const runData = execution.data?.resultData?.runData;
  if (!runData) {
    return {};
  }

  // Look for Webhook node input
  const webhookNode = Object.keys(runData).find((name) => name.toLowerCase().includes('webhook'));

  if (!webhookNode || !runData[webhookNode]?.[0]) {
    return {};
  }

  const webhookRun = runData[webhookNode][0];
  const mainOutput = webhookRun.data?.main?.[0];

  if (!mainOutput || mainOutput.length === 0) {
    return {};
  }

  // Return first webhook output as inputs
  return (mainOutput[0]?.json as Record<string, unknown>) || {};
}

/**
 * Build a map of node names to node types from workflow data
 */
function buildNodeTypeMap(execution: N8nExecution): Map<string, string> {
  const map = new Map<string, string>();

  if (execution.workflowData?.nodes) {
    for (const node of execution.workflowData.nodes) {
      map.set(node.name, node.type);
    }
  }

  return map;
}

/**
 * Map n8n execution to RunRecord
 *
 * @param execution - n8n execution data
 * @param options - Mapping options
 * @returns Standardized RunRecord
 */
export function mapN8nExecutionToRunRecord(
  execution: N8nExecution,
  options?: MapperOptions
): RunRecord {
  const opts: Required<MapperOptions> = { ...DEFAULT_OPTIONS, ...options };
  const runId = opts.runId || `n8n_${execution.id}`;

  logger.debug({ execution_id: execution.id, run_id: runId }, 'Mapping n8n execution to RunRecord');

  // Calculate timing
  const startedAt = execution.startedAt;
  const endedAt = execution.stoppedAt;
  const totalMs = endedAt ? new Date(endedAt).getTime() - new Date(startedAt).getTime() : undefined;

  // Build node type map from workflow data
  const nodeTypeMap = buildNodeTypeMap(execution);

  // Map node runs to steps
  const steps = execution.data?.resultData?.runData
    ? mapNodeRunsToSteps(execution.data.resultData.runData, opts, nodeTypeMap)
    : [];

  const runRecord: RunRecord = {
    run_id: runId,
    status: mapStatus(execution),
    inputs: extractInputs(execution),
    output: extractFinalOutput(execution),
    steps,
    timing: {
      started_at: startedAt,
      ended_at: endedAt,
      total_ms: totalMs,
    },
    error: extractError(execution),
    source: {
      system: 'n8n',
      execution_id: execution.id,
    },
  };

  logger.info(
    {
      run_id: runId,
      execution_id: execution.id,
      status: runRecord.status,
      steps_count: steps.length,
      total_ms: totalMs,
    },
    'n8n execution mapped to RunRecord'
  );

  return runRecord;
}

/**
 * Map multiple n8n executions to RunRecords
 */
export function mapN8nExecutionsToRunRecords(
  executions: N8nExecution[],
  options?: MapperOptions
): RunRecord[] {
  return executions.map((execution) => mapN8nExecutionToRunRecord(execution, options));
}

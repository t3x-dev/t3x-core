/**
 * Runner API + Engine Runs + A/B Test + Saved Comparisons
 */

import {
  API_V1,
  ApiError,
  buildQueryString,
  fetchWithTimeout,
  handleResponse,
  safeJsonParse,
} from './core';
import type { ApiResponse } from './types';

const RUNNER_URL = process.env.NEXT_PUBLIC_RUNNER_API_URL || 'http://localhost:8080';

// ============================================================================
// Runner Types
// ============================================================================

// Agent configuration
export interface AgentConfig {
  id: string;
  name: string;
  endpoint: string;
  type: 'http' | 'websocket' | 'subprocess';
  auth?: {
    type: 'none' | 'bearer' | 'api_key' | 'basic';
    token?: string;
    header?: string;
  };
  metadata?: Record<string, unknown>;
}

// Run trace
export interface RunTrace {
  run_id: string;
  agent_id: string;
  started_at: string;
  completed_at?: string;
  status: 'running' | 'completed' | 'failed' | 'timeout';
  input: Record<string, unknown>;
  output?: unknown;
  events: Array<{
    id: string;
    timestamp: string;
    type: 'llm_call' | 'tool_call' | 'agent_input' | 'agent_output' | 'error';
    data: {
      input?: unknown;
      output?: unknown;
      model?: string;
      tool_name?: string;
      latency_ms?: number;
      error?: string;
    };
  }>;
  metrics?: {
    total_latency_ms?: number;
    llm_calls: number;
    tool_calls: number;
    tokens_used?: number;
  };
}

export interface RunAgentResult {
  run_id: string;
  output?: unknown;
  trace: RunTrace;
  error?: {
    code: string;
    message: string;
  };
}

// Test step
export interface TestStep {
  id: string;
  name: string;
  type: 'contains' | 'not_contains' | 'regex' | 'json_path' | 'semantic' | 'custom';
  target: 'input' | 'output' | 'llm_call' | 'tool_call' | 'trace';
  assertion: {
    value?: string;
    pattern?: string;
    path?: string;
    threshold?: number;
    fn?: string;
  };
  severity: 'error' | 'warning' | 'info';
}

// Test result
export interface TestResult {
  step_id: string;
  step_name: string;
  passed: boolean;
  severity: 'error' | 'warning' | 'info';
  message?: string;
  expected?: unknown;
  actual?: unknown;
  suggestion?: string;
}

// Eval response
export interface EvalResponse {
  run_id: string;
  passed: boolean;
  total_steps: number;
  passed_steps: number;
  failed_steps: number;
  results: TestResult[];
  suggestions?: Array<{
    type: 'prompt_change' | 'config_change' | 'tool_fix' | 'other';
    description: string;
    confidence: number;
    diff?: string;
  }>;
  t3x_commit_id?: string;
}

// ============================================================================
// Runner API Functions
// ============================================================================

/**
 * Check runner health
 */
export async function checkRunnerHealth(): Promise<{ status: string; service: string }> {
  const res = await fetchWithTimeout(`${RUNNER_URL}/health`, undefined, 5000);
  return handleResponse(res);
}

/**
 * Register an agent with the runner
 */
export async function registerAgent(config: AgentConfig): Promise<{ agent_id: string }> {
  const res = await fetchWithTimeout(`${RUNNER_URL}/agents`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(config),
  });
  return handleResponse(res);
}

/**
 * Get agent configuration
 */
export async function getAgent(agentId: string): Promise<AgentConfig> {
  const res = await fetchWithTimeout(`${RUNNER_URL}/agents/${encodeURIComponent(agentId)}`);
  return handleResponse(res);
}

/**
 * Run an agent
 */
export async function runAgent(
  agentId: string,
  input: Record<string, unknown>,
  config?: { timeout_ms?: number }
): Promise<RunAgentResult> {
  const res = await fetchWithTimeout(
    `${RUNNER_URL}/run`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        agent_id: agentId,
        input,
        config,
      }),
    },
    config?.timeout_ms ?? 60000
  );

  const json = (await res.json().catch(() => ({
    success: false,
    error: { code: 'PARSE_ERROR', message: 'Failed to parse response' },
  }))) as ApiResponse<{ run_id: string; output?: unknown; trace: RunTrace }>;

  if (res.ok && json.success) {
    return json.data as RunAgentResult;
  }

  if (json.data?.run_id && json.data?.trace) {
    return {
      ...(json.data as { run_id: string; output?: unknown; trace: RunTrace }),
      error: json.error || { code: 'RUN_FAILED', message: `HTTP ${res.status}` },
    };
  }

  throw new ApiError(json.error?.code || 'RUN_FAILED', json.error?.message || `HTTP ${res.status}`);
}

/**
 * Get run trace
 */
export async function getRunTrace(runId: string): Promise<RunTrace> {
  const res = await fetchWithTimeout(`${RUNNER_URL}/run/${encodeURIComponent(runId)}`);
  return handleResponse(res);
}

/**
 * List runs
 */
export async function listRuns(agentId?: string): Promise<{ runs: RunTrace[] }> {
  const query = agentId ? `?agent_id=${encodeURIComponent(agentId)}` : '';
  const res = await fetchWithTimeout(`${RUNNER_URL}/runs${query}`);
  return handleResponse(res);
}

/**
 * Run evaluation
 */
export async function runEval(
  runId: string,
  testSteps: TestStep[],
  options?: { stop_on_first_failure?: boolean; generate_suggestions?: boolean }
): Promise<EvalResponse> {
  const res = await fetchWithTimeout(`${RUNNER_URL}/eval`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      run_id: runId,
      test_steps: testSteps,
      options,
    }),
  });
  return handleResponse(res);
}

/**
 * Run agent with auto-eval (webhook mode)
 */
export async function runAgentWithEval(
  agentId: string,
  input: Record<string, unknown>,
  testSteps: TestStep[]
): Promise<{
  run_id: string;
  output: unknown;
  trace: RunTrace;
  eval_result: EvalResponse | null;
}> {
  const res = await fetchWithTimeout(
    `${RUNNER_URL}/webhook/run`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        agent_id: agentId,
        input,
        auto_eval: true,
        test_steps: testSteps,
      }),
    },
    120000
  ); // 2 minute timeout for run + eval
  return handleResponse(res);
}

// NOTE: createCommitFromEval was removed in Runner cleanup v0.2.0
// The /commit endpoint was deprecated as part of the unified RunRecord architecture.
// See RUNNER_CLEANUP_PLAN.md for details.

// ============================================================================
// Engine Run API (Engine -> Runner -> n8n flow)
// ============================================================================

// Run record from Engine
export interface EngineRun {
  run_id: string;
  project_id: string | null;
  runner_run_id: string | null;
  commit_ref: string | null;
  leaf: {
    id: string;
    type: 'deploy_agent' | 'eval'; // Runner execution type (not LeafType)
    content?: string;
    title?: string;
  } | null;
  inputs: Record<string, unknown> | null;
  workflow: {
    type: string;
    webhook_id?: string;
  } | null;
  status: 'queued' | 'running' | 'completed' | 'failed';
  result: {
    run_report?: Record<string, unknown>;
    assertions?: unknown[];
    evidence_pack?: Record<string, unknown>;
    // Add trace_summary to result for backwards compatibility
    trace_summary?: {
      trajectory?: {
        total_steps: number;
        llm_calls: number;
        tool_calls: number;
        retrieval_calls: number;
        failed_steps: number;
      };
      tokens?: {
        prompt_tokens: number;
        completion_tokens: number;
        total_tokens: number;
      };
      latency_ms?: number;
    };
  } | null;
  // v2.1: Metadata for A/B test filtering
  metadata: {
    model?: string;
    prompt_version?: string;
    workflow_id?: string;
    test_case?: string;
  } | null;
  // v2.3: Report asset fields
  title: string | null;
  description: string | null;
  tags: string[];
  created_at: string;
  updated_at: string;
}

export interface CreateEngineRunInput {
  project_id?: string;
  commit_ref?: string;
  leaf_id?: string; // Reference to an existing Leaf -- API resolves its output as prompt
  leaf?: {
    id: string;
    type: 'deploy_agent' | 'eval'; // Runner execution type (not LeafType)
    content?: string;
    rules_ref?: string;
  };
  inputs?: Record<string, unknown>;
  workflow?: {
    type: string;
    webhook_id?: string;
  };
  // v2.1: Metadata for A/B test filtering
  metadata?: {
    model?: string;
    prompt_version?: string;
    workflow_id?: string;
    test_case?: string;
  };
}

export interface EngineRunListData {
  runs: EngineRun[];
  limit: number;
  offset: number;
}

/**
 * Create a run via Engine (triggers Runner -> n8n flow)
 */
export async function createEngineRun(input: CreateEngineRunInput): Promise<{
  run_id: string;
  status: string;
  runner_run_id?: string;
  warning?: string;
}> {
  const res = await fetchWithTimeout(`${API_V1}/runs`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  // handleResponse already extracts .data from ApiResponse
  return handleResponse<{
    run_id: string;
    status: string;
    runner_run_id?: string;
    warning?: string;
  }>(res);
}

// Raw run from Engine API (camelCase with JSON strings)
interface EngineRunRaw {
  runId: string;
  projectId: string | null;
  runnerRunId: string | null;
  commitRef: string | null;
  leafJson: string | null;
  inputsJson: string | null;
  workflowJson: string | null;
  status: 'queued' | 'running' | 'completed' | 'failed';
  resultJson: string | null;
  // Trace data
  traceSummaryJson: string | null;
  fullTraceJson: string | null;
  // v2.1: Metadata for A/B test filtering
  metadataJson: string | null;
  // v2.3: Report asset fields
  title: string | null;
  description: string | null;
  tags: string[] | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * Parse raw Engine run (camelCase + JSON strings) to frontend format (snake_case + parsed)
 */
function parseEngineRun(raw: EngineRunRaw): EngineRun {
  const result = safeJsonParse(raw.resultJson, null) as Record<string, unknown> | null;
  const traceSummary = safeJsonParse(raw.traceSummaryJson, null);

  // Merge trace_summary into result for UI compatibility
  const mergedResult = result
    ? {
        ...result,
        trace_summary: traceSummary,
      }
    : null;

  return {
    run_id: raw.runId,
    project_id: raw.projectId,
    runner_run_id: raw.runnerRunId,
    commit_ref: raw.commitRef,
    leaf: safeJsonParse(raw.leafJson, null),
    inputs: safeJsonParse(raw.inputsJson, null),
    workflow: safeJsonParse(raw.workflowJson, null),
    status: raw.status,
    result: mergedResult as EngineRun['result'],
    metadata: safeJsonParse(raw.metadataJson, null),
    title: raw.title ?? null,
    description: raw.description ?? null,
    tags: raw.tags ?? [],
    created_at: raw.createdAt,
    updated_at: raw.updatedAt,
  };
}

/**
 * Get a run by ID from Engine
 */
export async function getEngineRun(runId: string): Promise<EngineRun> {
  const res = await fetchWithTimeout(`${API_V1}/runs/${encodeURIComponent(runId)}`);
  const data = await handleResponse<EngineRunRaw>(res);
  return parseEngineRun(data);
}

/**
 * Update run metadata (title, description, tags)
 *
 * v2.3: Report asset -- partial update for run metadata.
 */
export async function updateEngineRun(
  runId: string,
  patch: { title?: string; description?: string; tags?: string[] }
): Promise<EngineRun> {
  const res = await fetchWithTimeout(`${API_V1}/runs/${encodeURIComponent(runId)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(patch),
  });
  const data = await handleResponse<EngineRunRaw>(res);
  return parseEngineRun(data);
}

/**
 * List runs from Engine
 *
 * v2.1: Added model and prompt_version filters for A/B test comparison
 */
export async function listEngineRuns(options?: {
  project_id?: string;
  status?: 'queued' | 'running' | 'completed' | 'failed';
  // v2.1: Metadata filters for A/B test
  model?: string;
  prompt_version?: string;
  limit?: number;
  offset?: number;
}): Promise<EngineRunListData> {
  const query = buildQueryString({
    project_id: options?.project_id,
    status: options?.status,
    model: options?.model,
    prompt_version: options?.prompt_version,
    limit: options?.limit ?? 50,
    offset: options?.offset ?? 0,
  });
  const res = await fetchWithTimeout(`${API_V1}/runs?${query}`);
  const data = await handleResponse<{ runs: EngineRunRaw[]; limit: number; offset: number }>(res);
  return {
    runs: data.runs.map(parseEngineRun),
    limit: data.limit,
    offset: data.offset,
  };
}

/**
 * Get filter options for runs (unique models and prompt_versions)
 *
 * v2.1: Returns distinct values for populating filter dropdowns in the UI.
 */
export async function getRunFilterOptions(): Promise<{
  models: string[];
  prompt_versions: string[];
}> {
  const res = await fetchWithTimeout(`${API_V1}/runs/filters`);
  const data = await handleResponse<{
    models: string[];
    prompt_versions: string[];
  }>(res);
  return data;
}

// ============================================================================
// A/B Test Comparison API (v2.2)
// ============================================================================

/**
 * Configuration stats grouped by model + prompt_version
 */
export interface ConfigurationStats {
  model: string;
  prompt_version: string;
  run_count: number;
  pass_count: number;
  pass_rate: number;
  avg_score: number;
  avg_latency_ms: number;
  avg_tokens: number;
}

/**
 * Result of statistical test (z-test or t-test)
 */
export interface ABTestResult {
  controlMean: number;
  treatmentMean: number;
  delta: number;
  deltaPercent: number;
  pValue: number;
  confidenceInterval: [number, number];
  isSignificant: boolean;
  sampleSizeAdequate: boolean;
}

/**
 * Simple delta result without statistical test
 */
export interface SimpleDeltaResult {
  controlMean: number;
  treatmentMean: number;
  delta: number;
  deltaPercent: number;
}

/**
 * Complete comparison result between two configurations
 */
export interface ComparisonResult {
  control: ConfigurationStats;
  treatment: ConfigurationStats;
  comparison: {
    pass_rate: ABTestResult;
    avg_score: ABTestResult;
    avg_latency: SimpleDeltaResult;
    avg_tokens: SimpleDeltaResult;
  };
}

/**
 * Get aggregated stats for all configurations (model + prompt_version combinations)
 *
 * v2.2: Used for selecting which configurations to compare in A/B test
 */
export async function getConfigurations(projectId?: string): Promise<ConfigurationStats[]> {
  const query = projectId ? buildQueryString({ project_id: projectId }) : '';
  const res = await fetchWithTimeout(`${API_V1}/runs/configurations${query ? `?${query}` : ''}`);
  const data = await handleResponse<{ configurations: ConfigurationStats[] }>(res);
  return data.configurations;
}

/**
 * Compare two configurations with statistical significance tests
 *
 * v2.2: Performs z-test for pass_rate and t-test for avg_score
 *
 * @param control - Control configuration (A)
 * @param treatment - Treatment configuration (B)
 * @param projectId - Optional project ID filter
 */
export async function compareConfigurations(
  control: { model: string; prompt_version: string },
  treatment: { model: string; prompt_version: string },
  projectId?: string
): Promise<ComparisonResult> {
  const res = await fetchWithTimeout(`${API_V1}/runs/compare`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      control,
      treatment,
      project_id: projectId,
    }),
  });
  return handleResponse<ComparisonResult>(res);
}

// ============================================================================
// Saved Comparisons (A/B comparison snapshots)
// ============================================================================

export interface SavedComparison {
  comparison_id: string;
  project_id: string | null;
  title: string;
  control_config: { model: string; prompt_version: string };
  treatment_config: { model: string; prompt_version: string };
  control_run_ids: string[];
  treatment_run_ids: string[];
  result_snapshot: Record<string, unknown>;
  created_at: string;
}

export async function createSavedComparison(input: {
  project_id?: string | null;
  title: string;
  control_config: { model: string; prompt_version: string };
  treatment_config: { model: string; prompt_version: string };
  control_run_ids: string[];
  treatment_run_ids: string[];
  result_snapshot: Record<string, unknown>;
}): Promise<SavedComparison> {
  const res = await fetchWithTimeout(`${API_V1}/comparisons`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  return handleResponse<SavedComparison>(res);
}

export async function listSavedComparisons(projectId?: string): Promise<SavedComparison[]> {
  const params = projectId ? `?${buildQueryString({ project_id: projectId })}` : '';
  const res = await fetchWithTimeout(`${API_V1}/comparisons${params}`);
  return handleResponse<SavedComparison[]>(res);
}

export async function getSavedComparison(comparisonId: string): Promise<SavedComparison> {
  const res = await fetchWithTimeout(`${API_V1}/comparisons/${comparisonId}`);
  return handleResponse<SavedComparison>(res);
}

export async function deleteSavedComparison(comparisonId: string): Promise<void> {
  const res = await fetchWithTimeout(`${API_V1}/comparisons/${comparisonId}`, {
    method: 'DELETE',
  });
  await handleResponse(res);
}

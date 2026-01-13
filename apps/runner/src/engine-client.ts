/**
 * Engine Client
 *
 * HTTP client for communicating with t3x-api (Engine).
 * Used by Runner to fetch run details and submit results.
 *
 * This enables Runner to be stateless - all persistent data
 * is stored in Engine's PostgreSQL database.
 */

import pino from 'pino';
import { fetchWithRetry } from './utils/retry.js';

const logger = pino({
  transport: {
    target: 'pino-pretty',
    options: { colorize: true },
  },
});

// Engine API URL (support both T3X_ENGINE_URL and T3X_API_URL for compatibility)
const T3X_ENGINE_URL = process.env.T3X_ENGINE_URL || process.env.T3X_API_URL || 'http://localhost:8000';

// Default callback URL for Runner → Engine ingest
const ENGINE_CALLBACK_URL = process.env.ENGINE_CALLBACK_URL || `${T3X_ENGINE_URL}/api/v1/runs/ingest`;

/**
 * Run data from Engine (matches @t3x/storage Run type)
 */
export interface EngineRun {
  runId: string;
  projectId: string | null;
  runnerRunId: string | null;
  commitRef: string | null;
  leafJson: string | null;
  inputsJson: string | null;
  workflowJson: string | null;
  status: string;
  resultJson: string | null;
  traceSummaryJson: string | null;
  tracePolicy: string | null;
  fullTraceJson: string | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * Parsed run data for Runner use
 */
export interface ParsedRun {
  run_id: string;
  project_id: string | null;
  runner_run_id: string | null;
  commit_ref: string | null;
  leaf: { id: string; type: 'deploy' | 'eval'; content?: string; rules_ref?: string } | null;
  inputs: Record<string, unknown>;
  workflow: { type: string; webhook_id?: string } | null;
  status: string;
}

/**
 * Engine API response wrapper
 */
interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: { code: string; message: string };
}

/**
 * Get run by runner_run_id from Engine
 *
 * @param runnerRunId - The runner_run_id to look up
 * @returns Parsed run data or null if not found
 */
export async function getRunByRunnerRunId(runnerRunId: string): Promise<ParsedRun | null> {
  const url = `${T3X_ENGINE_URL}/api/v1/runs/by-runner-id/${runnerRunId}`;

  logger.debug({ url, runnerRunId }, 'Fetching run from Engine');

  try {
    const response = await fetchWithRetry(
      url,
      {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
        signal: AbortSignal.timeout(10000),
      },
      { maxRetries: 3, operationName: 'getRunByRunnerRunId' }
    );

    if (!response.ok) {
      if (response.status === 404) {
        logger.warn({ runnerRunId }, 'Run not found in Engine');
        return null;
      }
      const errorText = await response.text();
      logger.error({ status: response.status, error: errorText }, 'Engine API error');
      throw new Error(`Engine API error: ${response.status} ${errorText}`);
    }

    const result = (await response.json()) as ApiResponse<EngineRun>;

    if (!result.success || !result.data) {
      logger.error({ result }, 'Engine returned unsuccessful response');
      return null;
    }

    // Parse JSON fields
    const run = result.data;
    const parsed: ParsedRun = {
      run_id: run.runId,
      project_id: run.projectId,
      runner_run_id: run.runnerRunId,
      commit_ref: run.commitRef,
      leaf: run.leafJson ? JSON.parse(run.leafJson) : null,
      inputs: run.inputsJson ? JSON.parse(run.inputsJson) : {},
      workflow: run.workflowJson ? JSON.parse(run.workflowJson) : null,
      status: run.status,
    };

    logger.info({ runnerRunId, run_id: parsed.run_id }, 'Run fetched from Engine');
    return parsed;
  } catch (error) {
    logger.error({ runnerRunId, error: String(error) }, 'Failed to fetch run from Engine');
    throw error;
  }
}

/**
 * Get the Engine callback URL for ingest
 *
 * Returns the URL that Runner should call to submit run results.
 * This is configured via ENGINE_CALLBACK_URL environment variable.
 */
export function getEngineCallbackUrl(): string {
  return ENGINE_CALLBACK_URL;
}

/**
 * Get the Engine base URL
 */
export function getEngineUrl(): string {
  return T3X_ENGINE_URL;
}

/**
 * n8n Execution API Client
 *
 * Fetches execution details from n8n REST API.
 * Reference: https://docs.n8n.io/api/api-reference/
 */

import { logger } from '../lib/logger.js';
import type { N8nApiError, N8nClientConfig, N8nExecution } from './types.js';

/**
 * Custom error class for n8n API errors
 */
export class N8nClientError extends Error {
  constructor(
    message: string,
    public readonly statusCode?: number,
    public readonly apiError?: N8nApiError
  ) {
    super(message);
    this.name = 'N8nClientError';
  }
}

/**
 * n8n Execution API Client
 */
export class N8nClient {
  private readonly apiUrl: string;
  private readonly apiKey: string;
  private readonly timeout: number;

  constructor(config?: Partial<N8nClientConfig>) {
    // Load from env or config
    this.apiUrl = config?.apiUrl || process.env.N8N_API_URL || 'http://n8n:5678';
    this.apiKey = config?.apiKey || process.env.N8N_API_KEY || '';
    this.timeout = config?.timeout || 30000;

    if (!this.apiKey) {
      logger.warn('N8N_API_KEY not set, n8n trace collection will fail');
    }
  }

  /**
   * Get execution details by ID
   *
   * @param executionId - The n8n execution ID
   * @returns The full execution details including all node run data
   */
  async getExecution(executionId: string): Promise<N8nExecution> {
    // Remove trailing /api/v1 if present to avoid duplication, then add includeData=true
    const baseUrl = this.apiUrl.replace(/\/api\/v1\/?$/, '');
    const url = `${baseUrl}/api/v1/executions/${executionId}?includeData=true`;

    logger.debug({ execution_id: executionId, url }, 'Fetching n8n execution');

    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          Accept: 'application/json',
          'X-N8N-API-KEY': this.apiKey,
        },
        signal: AbortSignal.timeout(this.timeout),
      });

      if (!response.ok) {
        const errorBody = await response.text();
        let apiError: N8nApiError | undefined;
        try {
          apiError = JSON.parse(errorBody) as N8nApiError;
        } catch {
          // Not JSON, use raw text
        }

        logger.error(
          { execution_id: executionId, status: response.status, error: errorBody },
          'n8n API request failed'
        );

        throw new N8nClientError(
          `n8n API error: ${response.status} ${response.statusText}`,
          response.status,
          apiError
        );
      }

      const execution = (await response.json()) as N8nExecution;

      logger.info(
        {
          execution_id: executionId,
          status: execution.status,
          finished: execution.finished,
          nodes_count: execution.data?.resultData?.runData
            ? Object.keys(execution.data.resultData.runData).length
            : 0,
        },
        'n8n execution fetched'
      );

      return execution;
    } catch (error) {
      if (error instanceof N8nClientError) {
        throw error;
      }

      const errorMsg = error instanceof Error ? error.message : String(error);
      logger.error({ execution_id: executionId, error: errorMsg }, 'Failed to fetch n8n execution');

      throw new N8nClientError(`Failed to fetch n8n execution: ${errorMsg}`);
    }
  }

  /**
   * Get execution with retry (for async fetching after workflow completes)
   *
   * @param executionId - The n8n execution ID
   * @param maxRetries - Maximum retry attempts
   * @param retryDelayMs - Base delay between retries (with exponential backoff)
   * @returns The full execution details
   */
  async getExecutionWithRetry(
    executionId: string,
    maxRetries: number = 5,
    retryDelayMs: number = 1000
  ): Promise<N8nExecution> {
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      if (attempt === 0) {
        const baseUrl = this.apiUrl.replace(/\/api\/v1\/?$/, '');
        logger.info(
          {
            execution_id: executionId,
            api_url: `${baseUrl}/api/v1/executions/${executionId}`,
            has_api_key: !!this.apiKey,
            api_key_prefix: this.apiKey ? `${this.apiKey.slice(0, 4)}...` : '(none)',
          },
          'n8n API: first fetch attempt'
        );
      }
      try {
        const execution = await this.getExecution(executionId);

        // If execution is finished, return it
        if (execution.finished) {
          return execution;
        }

        // If not finished and we have retries left, wait and retry
        if (attempt < maxRetries) {
          const delay = retryDelayMs * 1.5 ** attempt;
          logger.info(
            { execution_id: executionId, attempt: attempt + 1, maxRetries, delay_ms: delay },
            'Execution not finished, waiting before retry...'
          );
          await this.sleep(delay);
        }
      } catch (error) {
        // On last attempt, throw the error
        if (attempt >= maxRetries) {
          throw error;
        }
        // Otherwise, log and retry
        logger.warn(
          { execution_id: executionId, attempt: attempt + 1, error: String(error) },
          'Fetch failed, retrying...'
        );
        await this.sleep(retryDelayMs * 1.5 ** attempt);
      }
    }

    throw new N8nClientError(`Execution ${executionId} not finished after ${maxRetries} retries`);
  }

  /**
   * Check if execution exists and is complete
   *
   * @param executionId - The n8n execution ID
   * @returns true if execution exists and is finished
   */
  async isExecutionComplete(executionId: string): Promise<boolean> {
    try {
      const execution = await this.getExecution(executionId);
      return execution.finished;
    } catch {
      return false;
    }
  }

  /**
   * Wait for execution to complete with polling
   *
   * @param executionId - The n8n execution ID
   * @param maxWaitMs - Maximum time to wait (default: 60000ms)
   * @param pollIntervalMs - Polling interval (default: 1000ms)
   * @returns The completed execution
   */
  async waitForExecution(
    executionId: string,
    maxWaitMs: number = 60000,
    pollIntervalMs: number = 1000
  ): Promise<N8nExecution> {
    const startTime = Date.now();

    while (Date.now() - startTime < maxWaitMs) {
      const execution = await this.getExecution(executionId);

      if (execution.finished) {
        return execution;
      }

      logger.debug(
        { execution_id: executionId, status: execution.status },
        'Execution not complete, waiting...'
      );

      await this.sleep(pollIntervalMs);
    }

    throw new N8nClientError(`Execution ${executionId} did not complete within ${maxWaitMs}ms`);
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

// Default singleton instance
export const n8nClient = new N8nClient();

/**
 * n8n Execution API Client
 *
 * Fetches execution details from n8n REST API.
 * Reference: https://docs.n8n.io/api/api-reference/
 */

import pino from 'pino';
import type { N8nExecution, N8nClientConfig, N8nApiError } from './types.js';

const logger = pino({
  transport: {
    target: 'pino-pretty',
    options: { colorize: true },
  },
});

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
    const url = `${this.apiUrl}/api/v1/executions/${executionId}`;

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
        'n8n execution fetched successfully'
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

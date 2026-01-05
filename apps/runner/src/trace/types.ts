/**
 * n8n Execution API Types
 *
 * Types for n8n REST API v1 execution endpoints.
 * Reference: https://docs.n8n.io/api/api-reference/
 */

/**
 * Node execution data item
 */
export interface N8nNodeDataItem {
  json: Record<string, unknown>;
  binary?: Record<string, unknown>;
  pairedItem?: {
    item: number;
    input?: number;
  };
}

/**
 * Node execution output
 */
export interface N8nNodeOutput {
  main: N8nNodeDataItem[][];
}

/**
 * Single node execution run
 */
export interface N8nNodeRun {
  startTime: number; // Unix timestamp (ms)
  executionTime: number; // Duration in ms
  data: N8nNodeOutput;
  source?: Array<{ previousNode: string }>;
  error?: {
    message: string;
    description?: string;
    stack?: string;
  };
}

/**
 * Run data for all nodes
 */
export type N8nRunData = Record<string, N8nNodeRun[]>;

/**
 * Result data containing execution results
 */
export interface N8nResultData {
  runData: N8nRunData;
  lastNodeExecuted?: string;
  error?: {
    message: string;
    description?: string;
    node?: string;
  };
}

/**
 * Execution data wrapper
 */
export interface N8nExecutionData {
  resultData: N8nResultData;
  executionData?: {
    contextData?: Record<string, unknown>;
    nodeExecutionStack?: unknown[];
    metadata?: Record<string, unknown>;
    waitingExecution?: Record<string, unknown>;
    waitingExecutionSource?: Record<string, unknown>;
  };
}

/**
 * Full execution response from n8n API
 * GET /api/v1/executions/{id}
 */
export interface N8nExecution {
  id: string;
  finished: boolean;
  mode: 'manual' | 'webhook' | 'trigger' | 'integrated' | 'retry';
  retryOf?: string;
  retrySuccessId?: string;
  startedAt: string; // ISO8601 timestamp
  stoppedAt?: string; // ISO8601 timestamp
  workflowId?: string;
  workflowData?: {
    id?: string;
    name?: string;
    nodes?: Array<{
      id: string;
      name: string;
      type: string;
      parameters?: Record<string, unknown>;
      position?: [number, number];
    }>;
    connections?: Record<string, unknown>;
  };
  data?: N8nExecutionData;
  status: 'new' | 'running' | 'waiting' | 'success' | 'error' | 'canceled' | 'crashed';
}

/**
 * Error response from n8n API
 */
export interface N8nApiError {
  code?: number;
  message: string;
  hint?: string;
}

/**
 * n8n Client configuration
 */
export interface N8nClientConfig {
  apiUrl: string; // e.g., "http://n8n:5678"
  apiKey: string; // n8n API key
  timeout?: number; // Request timeout in ms (default: 30000)
}

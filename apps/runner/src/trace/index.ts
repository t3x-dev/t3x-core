/**
 * T3X Runner Trace Collection
 *
 * Provides trace collection from various workflow systems (n8n, etc.)
 * and mapping to standardized RunRecord format.
 */

// n8n client
export { N8nClient, N8nClientError, n8nClient } from './n8n-client.js';

// n8n mapper
export {
  type MapperOptions,
  mapN8nExecutionsToRunRecords,
  mapN8nExecutionToRunRecord,
} from './n8n-mapper.js';
// Trace storage policy (v2.0)
export {
  shouldStoreFullTrace,
  type TracePolicy,
} from './storage-policy.js';

// Trace summary builder (v2.0)
export {
  buildTraceSummary,
  type TokenStats,
  type TraceSummary,
  type TrajectorySummary,
} from './trace-summary.js';
// n8n types
export type {
  N8nApiError,
  N8nClientConfig,
  N8nExecution,
  N8nExecutionData,
  N8nNodeDataItem,
  N8nNodeOutput,
  N8nNodeRun,
  N8nResultData,
  N8nRunData,
} from './types.js';

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
  mapN8nExecutionToRunRecord,
  mapN8nExecutionsToRunRecords,
  type MapperOptions,
} from './n8n-mapper.js';

// n8n types
export type {
  N8nExecution,
  N8nExecutionData,
  N8nResultData,
  N8nRunData,
  N8nNodeRun,
  N8nNodeOutput,
  N8nNodeDataItem,
  N8nClientConfig,
  N8nApiError,
} from './types.js';

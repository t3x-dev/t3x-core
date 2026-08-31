/**
 * @t3x-dev/api-client
 *
 * TypeScript client for the T3X API.
 */

export type { T3xClientConfig, T3xRequestOptions } from './client.js';
export { createClient, T3xApiError, T3xClient } from './client.js';
export * from './collaboration.js';
export {
  type AccountOperation,
  AccountOperationSchema,
  type AuthOperation,
  AuthOperationSchema,
  DEPLOYMENT_CAPABILITIES_VERSION,
  type DeploymentCapabilities,
  DeploymentCapabilitiesSchema,
  SELF_HOSTED_DEPLOYMENT_CAPABILITIES,
  UNAVAILABLE_DEPLOYMENT_CAPABILITIES,
} from './deployment-capabilities.js';
export type * from './types.js';

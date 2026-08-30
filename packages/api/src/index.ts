/**
 * @t3x-dev/api — Barrel export
 *
 * Re-exports the createApp factory and all public types/utilities
 * so consumers (apps/api thin launcher, t3x_cloud) can import from '@t3x-dev/api'.
 */

// Standalone runtime database maintenance.
export { cleanupExpiredRateLimitBuckets, cleanupOldEvents } from '@t3x-dev/storage';
export type { CreateAppOptions } from './app';
export { createApp } from './app';
// Database
export { closeDB, getDB, getRuntimePostgresClient } from './lib/db';
// Error utilities
export { createError, errorResponse, zodErrorHook } from './lib/errors';
export {
  allowAllInferenceAdmissionPolicy,
  createInferenceRuntime,
  directInferenceGateway,
  INFERENCE_CONTRACT_VERSION,
  type InferenceActor,
  type InferenceAdmission,
  type InferenceAdmissionDecision,
  InferenceAdmissionDeniedError,
  type InferenceAdmissionPolicy,
  type InferenceAttempt,
  type InferenceExecution,
  InferenceExecutionError,
  type InferenceExecutionInput,
  type InferenceExecutionResult,
  type InferenceFinishStatus,
  type InferenceGateway,
  type InferenceGatewayStream,
  type InferenceProviderCost,
  type InferenceReceipt,
  type InferenceRuntime,
  type InferenceRuntimeOptions,
  type InferenceScope,
  type InferenceStream,
  type InferenceTerminal,
  type InferenceUsage,
} from './lib/inference';
// Background tasks
export {
  defaultFetchEventById,
  startRealtimeListener,
  stopRealtimeListener,
} from './lib/realtime-listener';
export { startTimeoutChecker, stopTimeoutChecker } from './lib/timeout-checker';
export type {
  TransitionControlPlaneOptions,
  TransitionExternalProviderResult,
  TransitionExternalStatementProvider,
  TransitionNativeProviderResult,
  TransitionNativeStatementProvider,
} from './lib/transition-control-plane';
export type {
  WorkspaceSourceRunnerCapability,
  WorkspaceSourceSecretResolver,
  WorkspaceSourceTransitionCapabilities,
} from './lib/workspace-source-transition';
export {
  createWorkspaceSourceRunnerProvider,
  WORKSPACE_SOURCE_RUNNER_PROVIDER_SOURCE,
} from './lib/workspace-source-transition';
export type { BearerTokenPrincipal, BearerTokenVerifier } from './middleware/auth';
// Logger
export { pinoLogger } from './middleware/logger';
export {
  applyRateLimitHeaders,
  consumeRateLimit,
  createDatabaseRateLimitStore,
  createRateLimitL1,
  createRateLimitL2,
  databaseRateLimitStore,
  getClientIp,
  getRequestRateLimitStore,
  hashRateLimitIdentity,
  RATE_LIMIT_POLICIES,
  type RateLimitPolicy,
  type RateLimitStore,
  resolveIpRateLimitPolicy,
} from './middleware/rate-limit';

// Common OpenAPI schemas
export { ErrorResponseSchema, SuccessResponseSchema } from './schemas/common';
// Type definitions
export type { AppEnv } from './types';

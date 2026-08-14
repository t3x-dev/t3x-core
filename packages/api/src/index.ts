/**
 * @t3x-dev/api — Barrel export
 *
 * Re-exports the createApp factory and all public types/utilities
 * so consumers (apps/api thin launcher, t3x_cloud) can import from '@t3x-dev/api'.
 */

// Standalone runtime database maintenance.
export { cleanupOldEvents } from '@t3x-dev/storage';
export type { CreateAppOptions } from './app';
export { createApp } from './app';
// Database
export { closeDB, getDB, getRuntimePostgresClient } from './lib/db';
// Error utilities
export { createError, errorResponse, zodErrorHook } from './lib/errors';
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
// Logger
export { pinoLogger } from './middleware/logger';

// Common OpenAPI schemas
export { ErrorResponseSchema, SuccessResponseSchema } from './schemas/common';
// Type definitions
export type { AppEnv } from './types';

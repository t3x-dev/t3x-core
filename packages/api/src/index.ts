/**
 * @t3x-dev/api — Barrel export
 *
 * Re-exports the createApp factory and all public types/utilities
 * so consumers (apps/api thin launcher, t3x_cloud) can import from '@t3x-dev/api'.
 */

export { createApp } from './app';
export type { CreateAppOptions } from './app';

// Database
export { closeDB, getDB } from './lib/db';
// Error utilities
export { createError, errorResponse, zodErrorHook } from './lib/errors';

// Background tasks
export { startTimeoutChecker, stopTimeoutChecker } from './lib/timeout-checker';
// Logger
export { pinoLogger } from './middleware/logger';

// Common OpenAPI schemas
export { ErrorResponseSchema, SuccessResponseSchema } from './schemas/common';
// Type definitions
export type { AppEnv } from './types';

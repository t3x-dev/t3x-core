/**
 * Standardized Error Handling
 *
 * Provides consistent error response format across all endpoints.
 *
 * Error Format:
 * {
 *   "success": false,
 *   "error": {
 *     "code": "ERROR_CODE",
 *     "message": "Human-readable message",
 *     "details": {}
 *   }
 * }
 *
 * Convention:
 * - Use SCREAMING_SNAKE_CASE for error codes
 * - Be specific about the error type
 * - Include entity name when relevant (e.g., PROJECT_NOT_FOUND, not just NOT_FOUND)
 */

import type { Context } from 'hono';

/**
 * Standardized error codes
 */
export const ErrorCodes = {
  // Version errors
  COMMIT_VERSION_UNSUPPORTED: 'COMMIT_VERSION_UNSUPPORTED',

  // Validation errors
  INVALID_REQUEST: 'INVALID_REQUEST',
  VALIDATION_FAILED: 'VALIDATION_FAILED',
  MISSING_PROJECT_FOR_ALIAS: 'MISSING_PROJECT_FOR_ALIAS',

  // Reference errors
  PARENT_NOT_FOUND: 'PARENT_NOT_FOUND',
  REFERENCE_NOT_FOUND: 'REFERENCE_NOT_FOUND',

  // Not found errors
  NOT_FOUND: 'NOT_FOUND',
  PROJECT_NOT_FOUND: 'PROJECT_NOT_FOUND',
  COMMIT_NOT_FOUND: 'COMMIT_NOT_FOUND',
  LEAF_NOT_FOUND: 'LEAF_NOT_FOUND',
  PIN_NOT_FOUND: 'PIN_NOT_FOUND',
  CONVERSATION_NOT_FOUND: 'CONVERSATION_NOT_FOUND',
  HISTORY_NOT_FOUND: 'HISTORY_NOT_FOUND',

  // Mismatch errors
  HISTORY_MISMATCH: 'HISTORY_MISMATCH',

  // Conflict errors
  DUPLICATE_PIN: 'DUPLICATE_PIN',
  HASH_CONFLICT: 'HASH_CONFLICT',
  BRANCH_ROOT_EXISTS: 'BRANCH_ROOT_EXISTS',
  BRANCH_NOT_HEAD: 'BRANCH_NOT_HEAD',
  ALIAS_TAKEN: 'ALIAS_TAKEN',

  // Operation errors
  CREATE_FAILED: 'CREATE_FAILED',
  UPDATE_FAILED: 'UPDATE_FAILED',
  DELETE_FAILED: 'DELETE_FAILED',
  GET_FAILED: 'GET_FAILED',
  LIST_FAILED: 'LIST_FAILED',
  NOT_IMPLEMENTED: 'NOT_IMPLEMENTED',

  // Server errors
  INTERNAL_ERROR: 'INTERNAL_ERROR',
  DATABASE_ERROR: 'DATABASE_ERROR',

  // Generation errors
  GENERATION_NOT_CONFIGURED: 'GENERATION_NOT_CONFIGURED',
  GENERATION_FAILED: 'GENERATION_FAILED',
  RATE_LIMITED: 'RATE_LIMITED',
  AUTH_ERROR: 'AUTH_ERROR',

  // Authentication errors
  UNAUTHORIZED: 'UNAUTHORIZED',
  FORBIDDEN: 'FORBIDDEN',
  API_KEY_NOT_FOUND: 'API_KEY_NOT_FOUND',
  API_KEY_REVOKED: 'API_KEY_REVOKED',

  // Share errors
  SHARE_TOKEN_NOT_FOUND: 'SHARE_TOKEN_NOT_FOUND',
  SHARE_ENTITY_NOT_FOUND: 'SHARE_ENTITY_NOT_FOUND',

  // Webhook errors
  WEBHOOK_NOT_FOUND: 'WEBHOOK_NOT_FOUND',

  // Draft errors
  DRAFT_NOT_FOUND: 'DRAFT_NOT_FOUND',
  CONFLICT: 'CONFLICT',
  TOO_MANY_REQUESTS: 'TOO_MANY_REQUESTS',

  // Validation errors (VAL-2)
  NO_OUTPUT: 'NO_OUTPUT',
  SEMANTIC_NOT_SUPPORTED: 'SEMANTIC_NOT_SUPPORTED',
  SEMANTIC_NOT_CONFIGURED: 'SEMANTIC_NOT_CONFIGURED',

  // Search errors
  SEARCH_FAILED: 'SEARCH_FAILED',

  // Operation-specific errors
  HISTORY_FAILED: 'HISTORY_FAILED',
  SUGGEST_FAILED: 'SUGGEST_FAILED',
  SUGGESTIONS_NOT_IMPLEMENTED: 'SUGGESTIONS_NOT_IMPLEMENTED',
  PROMOTE_FAILED: 'PROMOTE_FAILED',
  REVIEW_ACTION_FAILED: 'REVIEW_ACTION_FAILED',
  RESTORE_FAILED: 'RESTORE_FAILED',
  COMPARE_FAILED: 'COMPARE_FAILED',
  MERGE_FAILED: 'MERGE_FAILED',
  LEARN_FAILED: 'LEARN_FAILED',
  EXTRACTION_FAILED: 'EXTRACTION_FAILED',

  // Extraction transport/config codes — reserved for genuine
  // upstream/configuration failures so domain-level extraction outcomes
  // (compile, unverifiable_quote, ...) can travel as `kind:'failed'`
  // inside a 200 ExtractionOutcome envelope without being conflated
  // with infrastructure problems.
  PROVIDER_KEY_MISSING: 'PROVIDER_KEY_MISSING',
  PROVIDER_UNAVAILABLE: 'PROVIDER_UNAVAILABLE',

  // Verification / merge state errors
  VERIFY_FAILED: 'VERIFY_FAILED',
  INVALID_STATUS: 'INVALID_STATUS',
  UNRESOLVED_PAIRS: 'UNRESOLVED_PAIRS',
  LLM_NOT_CONFIGURED: 'LLM_NOT_CONFIGURED',

  // Knowledge Graph errors
  GRAPH_BUILD_NOT_IMPLEMENTED: 'GRAPH_BUILD_NOT_IMPLEMENTED',
  GRAPH_NODE_NOT_FOUND: 'GRAPH_NODE_NOT_FOUND',
  GRAPH_NOT_BUILT: 'GRAPH_NOT_BUILT',

  // Autopilot errors
  AUTOPILOT_CONFIG_INVALID: 'AUTOPILOT_CONFIG_INVALID',
  ALREADY_COMMITTED: 'ALREADY_COMMITTED',

  // Deprecation / migration
  DEPRECATED: 'DEPRECATED',
  CHECK_FAILED: 'CHECK_FAILED',
  COMMIT_FAILED: 'COMMIT_FAILED',

  // Source provenance errors
  MISSING_SOURCE: 'MISSING_SOURCE',
  MISSING_AUTHOR: 'MISSING_AUTHOR',

  // YOps support
  UNSUPPORTED_OP: 'UNSUPPORTED_OP',

  // Suggestion-vs-baseline: a commit caller passed yops_log_ids that
  // were superseded by a concurrent re-extract between the caller's
  // snapshot and the commit insert. Retryable: re-fetch the active
  // draft id set and try again.
  YOPS_LOG_SUPERSEDED: 'YOPS_LOG_SUPERSEDED',
} as const;

export type ErrorCode = keyof typeof ErrorCodes;

/**
 * Standardized API error response structure
 */
export interface ApiError {
  success: false;
  error: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
  };
}

/**
 * HTTP status codes for each error type
 */
export const ErrorStatusCodes: Record<ErrorCode, number> = {
  // 400 Bad Request
  COMMIT_VERSION_UNSUPPORTED: 400,
  INVALID_REQUEST: 400,
  UNSUPPORTED_OP: 400,
  VALIDATION_FAILED: 400,
  MISSING_PROJECT_FOR_ALIAS: 400,
  PARENT_NOT_FOUND: 400,
  REFERENCE_NOT_FOUND: 400,

  // 404 Not Found
  NOT_FOUND: 404,
  PROJECT_NOT_FOUND: 404,
  COMMIT_NOT_FOUND: 404,
  LEAF_NOT_FOUND: 404,
  PIN_NOT_FOUND: 404,
  CONVERSATION_NOT_FOUND: 404,
  HISTORY_NOT_FOUND: 404,

  // 400 Bad Request (Mismatch)
  HISTORY_MISMATCH: 400,

  // 409 Conflict
  DUPLICATE_PIN: 409,
  HASH_CONFLICT: 409,
  BRANCH_ROOT_EXISTS: 409,
  BRANCH_NOT_HEAD: 409,
  ALIAS_TAKEN: 409,
  YOPS_LOG_SUPERSEDED: 409,

  // 500 Server Error
  CREATE_FAILED: 500,
  UPDATE_FAILED: 500,
  DELETE_FAILED: 500,
  GET_FAILED: 500,
  LIST_FAILED: 500,
  NOT_IMPLEMENTED: 501,
  INTERNAL_ERROR: 500,
  DATABASE_ERROR: 500,

  // Generation errors
  GENERATION_NOT_CONFIGURED: 400,
  GENERATION_FAILED: 500,
  RATE_LIMITED: 429,
  AUTH_ERROR: 401,

  // Authentication errors
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  API_KEY_NOT_FOUND: 404,
  API_KEY_REVOKED: 400,

  // Share errors
  SHARE_TOKEN_NOT_FOUND: 404,
  SHARE_ENTITY_NOT_FOUND: 404,

  // Webhook errors
  WEBHOOK_NOT_FOUND: 404,

  // Draft errors
  DRAFT_NOT_FOUND: 404,
  CONFLICT: 409,
  TOO_MANY_REQUESTS: 429,

  // Validation errors (VAL-2)
  NO_OUTPUT: 400,
  SEMANTIC_NOT_SUPPORTED: 400,
  SEMANTIC_NOT_CONFIGURED: 400,

  // Search errors
  SEARCH_FAILED: 500,

  // Operation-specific errors
  HISTORY_FAILED: 500,
  SUGGEST_FAILED: 500,
  SUGGESTIONS_NOT_IMPLEMENTED: 501,
  PROMOTE_FAILED: 500,
  REVIEW_ACTION_FAILED: 500,
  RESTORE_FAILED: 500,
  COMPARE_FAILED: 500,
  MERGE_FAILED: 500,
  LEARN_FAILED: 500,
  EXTRACTION_FAILED: 500,
  PROVIDER_KEY_MISSING: 400,
  PROVIDER_UNAVAILABLE: 502,

  // Verification / merge state errors
  VERIFY_FAILED: 500,
  INVALID_STATUS: 400,
  UNRESOLVED_PAIRS: 400,
  LLM_NOT_CONFIGURED: 400,

  // Knowledge Graph errors
  GRAPH_BUILD_NOT_IMPLEMENTED: 501,
  GRAPH_NODE_NOT_FOUND: 404,
  GRAPH_NOT_BUILT: 400,

  // Autopilot errors
  AUTOPILOT_CONFIG_INVALID: 400,
  ALREADY_COMMITTED: 409,

  // Deprecation / migration
  DEPRECATED: 400,
  CHECK_FAILED: 500,
  COMMIT_FAILED: 500,

  // Source provenance errors
  MISSING_SOURCE: 400,
  MISSING_AUTHOR: 400,
};

/**
 * Create a standardized error response object
 *
 * @param code - Machine-readable error code from ErrorCodes
 * @param message - Human-readable error message
 * @param details - Optional additional context (field errors, etc.)
 * @returns Standardized error response object
 *
 * @example
 * return c.json(createError('INVALID_REQUEST', 'Missing required field: nodes'), 400);
 */
export function createError(
  code: ErrorCode,
  message: string,
  details?: Record<string, unknown>
): ApiError {
  return {
    success: false as const,
    error: {
      code: ErrorCodes[code],
      message,
      ...(details && { details }),
    },
  };
}

/**
 * Helper to return error response with correct status code
 *
 * @param c - Hono context
 * @param code - Machine-readable error code from ErrorCodes
 * @param message - Human-readable error message
 * @param details - Optional additional context
 * @returns JSON response with appropriate status code
 *
 * @example
 * return errorResponse(c, 'PROJECT_NOT_FOUND', `Project not found: ${projectId}`);
 */
export function errorResponse(
  c: Context,
  code: ErrorCode,
  message: string,
  details?: Record<string, unknown>
  // biome-ignore lint/suspicious/noExplicitAny: generic error handler
): any {
  const statusCode = ErrorStatusCodes[code];
  return c.json(
    createError(code, message, details),
    statusCode as 400 | 401 | 403 | 404 | 409 | 429 | 500 | 501
  );
}

/**
 * Create a validation error response from Zod issues
 *
 * @param issues - Array of Zod validation issues
 * @returns Formatted error message string
 */
export function formatZodErrors(
  issues: Array<{ path: (string | number)[]; message: string }>
): string {
  return issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
}

/**
 * Default hook for OpenAPIHono to handle Zod validation errors
 *
 * @example
 * const app = new OpenAPIHono({ defaultHook: zodErrorHook });
 */
/**
 * Type-safe success response for OpenAPI route handlers.
 * Returns `as any` to satisfy strict TypedResponse matching.
 */
// biome-ignore lint/suspicious/noExplicitAny: generic error handler
export function successJson<T>(c: Context, data: T, status: 200 | 201 = 200): any {
  return c.json({ success: true as const, data }, status);
}

/**
 * Type-safe error response for OpenAPI route handlers.
 * Returns `as any` to satisfy strict TypedResponse matching.
 */
export function errorJson(
  c: Context,
  code: ErrorCode,
  message: string,
  status?: 400 | 401 | 403 | 404 | 409 | 429 | 500 | 501,
  details?: Record<string, unknown>
  // biome-ignore lint/suspicious/noExplicitAny: generic error handler
): any {
  const statusCode = status ?? ErrorStatusCodes[code];
  return c.json(
    createError(code, message, details),
    statusCode as 400 | 401 | 403 | 404 | 409 | 429 | 500 | 501
  );
}

// biome-ignore lint/suspicious/noExplicitAny: generic error handler
export const zodErrorHook: any = (
  result: {
    success: boolean;
    error?: { issues: Array<{ path: (string | number)[]; message: string }> };
  },
  c: Context
) => {
  if (!result.success && result.error) {
    return c.json(createError('INVALID_REQUEST', formatZodErrors(result.error.issues)), 400);
  }
};

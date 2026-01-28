/**
 * Standardized Error Handling for V4 API
 *
 * Provides consistent error response format across all V4 endpoints.
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
 * Standardized error codes for V4 API
 */
export const ErrorCodes = {
  // Version errors
  COMMIT_VERSION_UNSUPPORTED: 'COMMIT_VERSION_UNSUPPORTED',

  // Validation errors
  INVALID_REQUEST: 'INVALID_REQUEST',
  VALIDATION_FAILED: 'VALIDATION_FAILED',

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

  // Operation errors
  CREATE_FAILED: 'CREATE_FAILED',
  UPDATE_FAILED: 'UPDATE_FAILED',
  DELETE_FAILED: 'DELETE_FAILED',
  GET_FAILED: 'GET_FAILED',
  LIST_FAILED: 'LIST_FAILED',

  // Server errors
  INTERNAL_ERROR: 'INTERNAL_ERROR',
  DATABASE_ERROR: 'DATABASE_ERROR',

  // Generation errors
  GENERATION_NOT_CONFIGURED: 'GENERATION_NOT_CONFIGURED',
  GENERATION_FAILED: 'GENERATION_FAILED',
  RATE_LIMITED: 'RATE_LIMITED',
  AUTH_ERROR: 'AUTH_ERROR',

  // Validation errors (VAL-2)
  NO_OUTPUT: 'NO_OUTPUT',
  SEMANTIC_NOT_SUPPORTED: 'SEMANTIC_NOT_SUPPORTED',
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
  VALIDATION_FAILED: 400,
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

  // 500 Server Error
  CREATE_FAILED: 500,
  UPDATE_FAILED: 500,
  DELETE_FAILED: 500,
  GET_FAILED: 500,
  LIST_FAILED: 500,
  INTERNAL_ERROR: 500,
  DATABASE_ERROR: 500,

  // Generation errors
  GENERATION_NOT_CONFIGURED: 400,
  GENERATION_FAILED: 500,
  RATE_LIMITED: 429,
  AUTH_ERROR: 401,

  // Validation errors (VAL-2)
  NO_OUTPUT: 400,
  SEMANTIC_NOT_SUPPORTED: 400,
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
 * return c.json(createError('INVALID_REQUEST', 'Missing required field: sentences'), 400);
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
) {
  const statusCode = ErrorStatusCodes[code];
  return c.json(createError(code, message, details), statusCode as 400 | 404 | 409 | 500);
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
export function zodErrorHook(
  result: {
    success: boolean;
    error?: { issues: Array<{ path: (string | number)[]; message: string }> };
  },
  c: Context
) {
  if (!result.success && result.error) {
    return c.json(createError('INVALID_REQUEST', formatZodErrors(result.error.issues)), 400);
  }
}

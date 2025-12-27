/**
 * Shared API response helpers
 */
import type { Context } from 'hono';

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
  };
}

export function successResponse<T>(data: T): ApiResponse<T> {
  return { success: true, data };
}

export function errorResponse(code: string, message: string): ApiResponse<never> {
  return { success: false, error: { code, message } };
}

/**
 * JSON response with success wrapper
 */
export function jsonSuccess<T>(c: Context, data: T, status: 200 | 201 = 200) {
  return c.json(successResponse(data), status);
}

/**
 * JSON error response
 */
export function jsonError(
  c: Context,
  code: string,
  message: string,
  status: 400 | 401 | 403 | 404 | 500 = 500
) {
  return c.json(errorResponse(code, message), status);
}

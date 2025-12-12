/**
 * Server Type Definitions
 */

import type { IncomingMessage, ServerResponse } from "node:http";
import type { EmbeddingProviderType, NLPProviderType, LanguageSetting } from "../core/config";

/**
 * API response wrapper (matches Python core_api format)
 */
export interface APIResponse<T = unknown> {
  status: "ok" | "error";
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
  };
}

/**
 * Request context passed to route handlers
 */
export interface RequestContext {
  /** Parsed URL path */
  path: string;
  /** HTTP method */
  method: string;
  /** Query parameters */
  query: URLSearchParams;
  /** Parsed JSON body (for POST/PUT) */
  body: unknown;
  /** Request headers */
  headers: Record<string, string | string[] | undefined>;
}

/**
 * Route handler function
 */
export type RouteHandler = (
  ctx: RequestContext,
  req: IncomingMessage,
  res: ServerResponse
) => Promise<void>;

/**
 * Route definition
 */
export interface Route {
  method: "GET" | "POST" | "PUT" | "DELETE" | "PATCH";
  path: string | RegExp;
  handler: RouteHandler;
}

/**
 * Provider configuration
 */
export interface ProviderConfig {
  /** Embedding provider type */
  embeddingProvider: EmbeddingProviderType;
  /** NLP provider type */
  nlpProvider: NLPProviderType;
  /** Google AI Studio API key (for Gemini Embedding) */
  googleAIStudioKey?: string;
  /** Google Cloud NLP API key */
  googleCloudNLPKey?: string;
  /** Anthropic API key (for Claude LLM) */
  anthropicApiKey?: string;
  /** Default language for NLP */
  defaultLanguage: LanguageSetting;
}

/**
 * Server configuration
 */
export interface ServerConfig {
  /** Port to listen on */
  port: number;
  /** Host to bind to */
  host?: string;
  /** Provider configuration */
  providers: ProviderConfig;
  /** Project's .t3x directory path */
  t3xDir: string;
}

/**
 * Create success response (matches Python core_api format)
 */
export function successResponse<T>(data: T): APIResponse<T> {
  return { status: "ok", data };
}

/**
 * Create error response (matches Python core_api format)
 */
export function errorResponse(code: string, message: string, details?: Record<string, unknown>): APIResponse {
  return { status: "error", error: { code, message, details } };
}

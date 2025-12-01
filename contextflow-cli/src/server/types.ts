/**
 * Server Type Definitions
 */

import type { IncomingMessage, ServerResponse } from "node:http";
import type { EmbeddingProviderType, NLPProviderType, LanguageSetting } from "../core/config";

/**
 * API response wrapper
 */
export interface APIResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
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
  method: "GET" | "POST" | "PUT" | "DELETE";
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
  /** Project's .contextflow directory path */
  contextflowDir: string;
}

/**
 * Create success response
 */
export function successResponse<T>(data: T): APIResponse<T> {
  return { success: true, data };
}

/**
 * Create error response
 */
export function errorResponse(code: string, message: string): APIResponse {
  return { success: false, error: { code, message } };
}

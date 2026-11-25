import type { T3xApiError } from '@t3x-dev/api-client';

/**
 * Shared types for all MCP tool definitions and handlers.
 */

export interface ToolDef {
  name: string;
  description: string;
  inputSchema: {
    type: 'object';
    properties: Record<string, unknown>;
    required?: string[];
  };
  annotations?: {
    readOnlyHint?: boolean;
    destructiveHint?: boolean;
    idempotentHint?: boolean;
  };
}

export interface ToolResult {
  content: Array<{ type: 'text'; text: string }>;
  isError?: boolean;
}

export type ToolHandler = (
  args: Record<string, unknown>,
  options?: { skipMainBranchInitialization?: true }
) => Promise<ToolResult>;

/** Return a successful JSON result. */
export function ok(data: unknown): ToolResult {
  return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
}

/** Return an error result with a plain-text message. */
export function fail(message: string): ToolResult {
  return { content: [{ type: 'text', text: message }], isError: true };
}

export function toolError(code: string, message: string): ToolResult {
  return fail(JSON.stringify({ error: { code, message } }));
}

export function apiToolError(error: T3xApiError): ToolResult {
  const { code, status, details, requestId } = error;
  const protocolCode = details?.protocol_code;
  const transitionId = details?.transition_id;
  const safeDetails = {
    ...(typeof protocolCode === 'string' && /^[A-Z][A-Z0-9_]{0,95}$/.test(protocolCode)
      ? { protocol_code: protocolCode }
      : {}),
    ...(code.startsWith('REVIEW_SNAPSHOT_') && typeof transitionId === 'string'
      ? { transition_id: transitionId }
      : {}),
    ...(code === 'REVIEW_SNAPSHOT_POLICY_REQUIRED' &&
    details?.checks &&
    typeof details.checks === 'object'
      ? { checks: details.checks }
      : {}),
  };
  return fail(
    JSON.stringify({
      error: {
        code,
        status,
        message: status >= 500 ? 'The API could not complete the operation.' : error.message,
        ...(requestId && /^[A-Za-z0-9_-]{1,100}$/.test(requestId)
          ? { http_request_id: requestId }
          : {}),
        ...(Object.keys(safeDetails).length > 0 ? { details: safeDetails } : {}),
      },
    })
  );
}

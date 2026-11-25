import { AsyncLocalStorage } from 'node:async_hooks';
import { randomUUID } from 'node:crypto';
import type { ToolDef, ToolResult } from './tools/types.js';

export interface McpDiagnostic {
  event: 'tool.finished' | 'api.finished';
  call_id: string;
  tool: string;
  action?: string;
  duration_ms: number;
  outcome: 'success' | 'error';
  error_code?: string;
  http_request_id?: string;
  http_status?: number;
}

interface ToolErrorText {
  error: { code: string; message: string; call_id?: string };
}

const calls = new AsyncLocalStorage<
  (event: Omit<McpDiagnostic, 'call_id' | 'tool' | 'action'>) => void
>();

function readError(result: ToolResult): ToolErrorText | undefined {
  try {
    const payload = JSON.parse(result.content[0]?.text ?? '') as ToolErrorText;
    if (typeof payload.error?.code === 'string' && typeof payload.error.message === 'string')
      return payload;
  } catch {
    // Legacy tools can return plain text.
  }
}

export async function trackToolCall(
  tool: ToolDef,
  args: Record<string, unknown>,
  diagnostic: (event: McpDiagnostic) => void,
  execute: () => Promise<ToolResult>
): Promise<ToolResult> {
  const call_id = randomUUID();
  const start = performance.now();
  const action = ['action', 'target', 'mode', 'outcome']
    .map((key) => {
      const property = tool.inputSchema.properties[key] as { enum?: unknown[] } | undefined;
      const value = args[key];
      return typeof value === 'string' && property?.enum?.includes(value) ? value : undefined;
    })
    .find((value) => value !== undefined);
  return calls.run(
    (event) => diagnostic({ ...event, call_id, tool: tool.name, action }),
    async () => {
      const result = await execute();
      const payload = result.isError ? readError(result) : undefined;
      const code = payload?.error.code;
      diagnostic({
        event: 'tool.finished',
        call_id,
        tool: tool.name,
        action,
        duration_ms: Math.round(performance.now() - start),
        outcome: result.isError ? 'error' : 'success',
        ...(code && /^[A-Z][A-Z0-9_]{0,95}$/.test(code) ? { error_code: code } : {}),
      });
      if (!payload) return result;
      payload.error.call_id = call_id;
      return {
        ...result,
        content: [
          { type: 'text', text: JSON.stringify(payload, null, 2) },
          ...result.content.slice(1),
        ],
      };
    }
  );
}

export const mcpFetch: typeof fetch = async (input, init) => {
  const diagnostic = calls.getStore();
  if (!diagnostic) return fetch(input, init);
  const http_request_id = randomUUID();
  const headers = new Headers(init?.headers);
  headers.set('X-Request-Id', http_request_id);
  const start = performance.now();
  try {
    const response = await fetch(input, { ...init, headers });
    diagnostic({
      event: 'api.finished',
      http_request_id,
      http_status: response.status,
      duration_ms: Math.round(performance.now() - start),
      outcome: response.ok ? 'success' : 'error',
    });
    return response;
  } catch (error) {
    diagnostic({
      event: 'api.finished',
      http_request_id,
      duration_ms: Math.round(performance.now() - start),
      outcome: 'error',
    });
    throw error;
  }
};

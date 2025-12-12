/**
 * Chat API Routes
 *
 * POST /api/v1/chat - Non-streaming chat
 * POST /api/v1/chat/stream - Streaming chat with SSE
 * GET /api/v1/chat/providers - List available providers
 *
 * Compatible with Python core_api/routes/chat.py response format.
 * SSE event format: data: {"type": "token"|"done"|"error", "content"?: string, ...}
 */

import type { ServerResponse } from "node:http";
// eslint-disable-next-line @typescript-eslint/no-require-imports
const undici = require("undici");
import type { Router } from "../router";
import { sendJson } from "../router";
import { successResponse, errorResponse, ProviderConfig } from "../types";

// ============================================================================
// Proxy Helper
// ============================================================================

/**
 * Get proxy URL from environment variables
 */
function getProxyUrl(): string | undefined {
  return (
    process.env.HTTPS_PROXY ||
    process.env.https_proxy ||
    process.env.HTTP_PROXY ||
    process.env.http_proxy
  );
}

// ============================================================================
// Types
// ============================================================================

interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

interface ChatRequest {
  messages: ChatMessage[];
  provider?: string;
  model?: string;
  temperature?: number;
  max_tokens?: number;
}

interface ChatResponse {
  content: string;
  model: string;
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
  };
  finish_reason?: string;
}

// ============================================================================
// Helpers
// ============================================================================

const PROVIDER_DEFAULTS: Record<string, { model: string; envKey: string }> = {
  claude: { model: "claude-sonnet-4-5-20250929", envKey: "ANTHROPIC_API_KEY" },
  anthropic: { model: "claude-sonnet-4-5-20250929", envKey: "ANTHROPIC_API_KEY" },
  openai: { model: "gpt-4o-mini", envKey: "OPENAI_API_KEY" },
  gpt: { model: "gpt-4o-mini", envKey: "OPENAI_API_KEY" },
};

function inferProviderFromModel(model: string): string {
  const modelLower = model.toLowerCase();
  if (modelLower.startsWith("claude") || modelLower.includes("anthropic")) {
    return "claude";
  }
  if (modelLower.startsWith("gpt") || modelLower.startsWith("o1") || modelLower.includes("openai")) {
    return "openai";
  }
  return "claude";
}

function getApiKey(provider: string, providers: ProviderConfig): string | undefined {
  const providerLower = provider.toLowerCase();
  if (providerLower === "claude" || providerLower === "anthropic") {
    return providers.anthropicApiKey;
  }
  // OpenAI not configured in ProviderConfig yet
  return process.env.OPENAI_API_KEY;
}

/**
 * Call Claude API (non-streaming)
 */
async function callClaudeNonStreaming(
  messages: ChatMessage[],
  model: string,
  apiKey: string,
  temperature: number,
  maxTokens: number
): Promise<ChatResponse> {
  // Extract system message if present
  const systemMessage = messages.find(m => m.role === "system");
  const otherMessages = messages.filter(m => m.role !== "system");

  // Setup proxy if available
  const proxyUrl = getProxyUrl();
  const dispatcher = proxyUrl ? new undici.ProxyAgent(proxyUrl) : undefined;

  const { statusCode, body } = await undici.request("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model,
      max_tokens: maxTokens,
      temperature,
      ...(systemMessage && { system: systemMessage.content }),
      messages: otherMessages.map(m => ({
        role: m.role,
        content: m.content,
      })),
    }),
    dispatcher,
  });

  const responseText = await body.text();

  if (statusCode !== 200) {
    throw new Error(`Claude API error: ${statusCode} ${responseText}`);
  }

  const data = JSON.parse(responseText) as {
    content: Array<{ type: string; text: string }>;
    model: string;
    usage?: { input_tokens: number; output_tokens: number };
    stop_reason?: string;
  };

  const textContent = data.content.find(c => c.type === "text");
  if (!textContent) {
    throw new Error("No text content in Claude response");
  }

  return {
    content: textContent.text,
    model: data.model,
    usage: data.usage,
    finish_reason: data.stop_reason ?? "end_turn",
  };
}

/**
 * Stream Claude API response as SSE
 */
async function streamClaudeResponse(
  res: ServerResponse,
  messages: ChatMessage[],
  model: string,
  apiKey: string,
  temperature: number,
  maxTokens: number
): Promise<void> {
  // Extract system message if present
  const systemMessage = messages.find(m => m.role === "system");
  const otherMessages = messages.filter(m => m.role !== "system");

  // Setup proxy if available
  const proxyUrl = getProxyUrl();
  const dispatcher = proxyUrl ? new undici.ProxyAgent(proxyUrl) : undefined;

  let statusCode: number;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let body: any;

  try {
    const response = await undici.request("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model,
        max_tokens: maxTokens,
        temperature,
        stream: true,
        ...(systemMessage && { system: systemMessage.content }),
        messages: otherMessages.map(m => ({
          role: m.role,
          content: m.content,
        })),
      }),
      dispatcher,
    });
    statusCode = response.statusCode;
    body = response.body;
  } catch (err) {
    const errorEvent = { type: "error", message: `Request failed: ${(err as Error).message}` };
    res.write(`data: ${JSON.stringify(errorEvent)}\n\n`);
    res.end();
    return;
  }

  if (statusCode !== 200) {
    const errorBody = await body.text();
    const errorEvent = { type: "error", message: `Claude API error: ${statusCode} ${errorBody}` };
    res.write(`data: ${JSON.stringify(errorEvent)}\n\n`);
    res.end();
    return;
  }

  let buffer = "";
  let accumulatedContent = "";
  let sentDone = false;

  try {
    for await (const chunk of body) {
      buffer += chunk.toString();

      // Process SSE events from Claude
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || !trimmed.startsWith("data:")) continue;

        const dataStr = trimmed.slice(5).trim();
        if (dataStr === "[DONE]") continue;

        try {
          const event = JSON.parse(dataStr) as {
            type: string;
            delta?: { type: string; text?: string };
            message?: { model?: string };
          };

          if (event.type === "content_block_delta" && event.delta?.text) {
            const token = event.delta.text;
            accumulatedContent += token;

            // Send token event (matching Python format)
            const tokenEvent = { type: "token", content: token };
            res.write(`data: ${JSON.stringify(tokenEvent)}\n\n`);
          } else if (event.type === "message_stop" && !sentDone) {
            // Send done event (only once)
            const doneEvent = {
              type: "done",
              model,
              content: accumulatedContent,
            };
            res.write(`data: ${JSON.stringify(doneEvent)}\n\n`);
            sentDone = true;
          }
        } catch {
          // Ignore parse errors
        }
      }
    }

    // Ensure done event is sent if we haven't sent it yet
    if (accumulatedContent && !sentDone) {
      const doneEvent = {
        type: "done",
        model,
        content: accumulatedContent,
      };
      res.write(`data: ${JSON.stringify(doneEvent)}\n\n`);
    }
  } catch (err) {
    const errorEvent = { type: "error", message: (err as Error).message };
    res.write(`data: ${JSON.stringify(errorEvent)}\n\n`);
  } finally {
    res.end();
  }
}

// ============================================================================
// Route Registration
// ============================================================================

export function registerChatRoutes(router: Router, providers: ProviderConfig): void {
  // GET /api/v1/chat/providers - List providers
  router.get("/api/v1/chat/providers", async (_ctx, _req, res) => {
    const availableProviders: string[] = ["claude"];

    // Check if OpenAI is configured
    if (process.env.OPENAI_API_KEY) {
      availableProviders.push("openai");
    }

    sendJson(res, 200, successResponse({
      providers: availableProviders,
      default: "claude",
    }));
  });

  // POST /api/v1/chat - Non-streaming chat
  router.post("/api/v1/chat", async (ctx, _req, res) => {
    const body = ctx.body as ChatRequest | null;

    if (!body?.messages || body.messages.length === 0) {
      sendJson(res, 400, errorResponse("INVALID_REQUEST", "messages array is required"));
      return;
    }

    // Determine provider
    let provider = body.provider ?? "claude";
    if (body.model && provider === "claude") {
      const inferred = inferProviderFromModel(body.model);
      if (inferred !== provider) {
        provider = inferred;
      }
    }

    const apiKey = getApiKey(provider, providers);
    if (!apiKey) {
      sendJson(res, 400, errorResponse(
        "PROVIDER_ERROR",
        `API key not configured for provider: ${provider}`
      ));
      return;
    }

    const model = body.model ?? PROVIDER_DEFAULTS[provider]?.model ?? "claude-sonnet-4-5-20250929";
    const temperature = body.temperature ?? 0.7;
    const maxTokens = body.max_tokens ?? 4096;

    try {
      // Currently only Claude is implemented
      if (provider === "claude" || provider === "anthropic") {
        const result = await callClaudeNonStreaming(
          body.messages,
          model,
          apiKey,
          temperature,
          maxTokens
        );
        sendJson(res, 200, successResponse(result));
      } else {
        sendJson(res, 400, errorResponse(
          "PROVIDER_ERROR",
          `Provider ${provider} not implemented`
        ));
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      sendJson(res, 500, errorResponse("CHAT_ERROR", message));
    }
  });

  // POST /api/v1/chat/stream - Streaming chat with SSE
  router.post("/api/v1/chat/stream", async (ctx, _req, res) => {
    const body = ctx.body as ChatRequest | null;

    if (!body?.messages || body.messages.length === 0) {
      sendJson(res, 400, errorResponse("INVALID_REQUEST", "messages array is required"));
      return;
    }

    // Determine provider
    let provider = body.provider ?? "claude";
    if (body.model && provider === "claude") {
      const inferred = inferProviderFromModel(body.model);
      if (inferred !== provider) {
        provider = inferred;
      }
    }

    const apiKey = getApiKey(provider, providers);
    if (!apiKey) {
      sendJson(res, 400, errorResponse(
        "PROVIDER_ERROR",
        `API key not configured for provider: ${provider}`
      ));
      return;
    }

    const model = body.model ?? PROVIDER_DEFAULTS[provider]?.model ?? "claude-sonnet-4-5-20250929";
    const temperature = body.temperature ?? 0.7;
    const maxTokens = body.max_tokens ?? 4096;

    // Set SSE headers
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
      "X-Accel-Buffering": "no",
      "Access-Control-Allow-Origin": "*",
    });

    try {
      if (provider === "claude" || provider === "anthropic") {
        await streamClaudeResponse(res, body.messages, model, apiKey, temperature, maxTokens);
      } else {
        const errorEvent = { type: "error", message: `Provider ${provider} not implemented` };
        res.write(`data: ${JSON.stringify(errorEvent)}\n\n`);
        res.end();
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      const errorEvent = { type: "error", message };
      res.write(`data: ${JSON.stringify(errorEvent)}\n\n`);
      res.end();
    }
  });
}

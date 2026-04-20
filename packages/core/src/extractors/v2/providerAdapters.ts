import type { LLMProviderError } from '../../llm/types';
import { createExtractionFailure } from './failures';
import { normalizeExtractionText } from './normalization';

export interface OpenAIChatMessage {
  role: string;
  content: string;
}

export interface OpenAIChatCompletionBodyInput {
  model: string;
  temperature: number;
  maxTokens: number;
  messages: OpenAIChatMessage[];
  stop?: string[];
  response_format?: Record<string, unknown>;
}

function usesOpenAICompletionTokenField(model: string): boolean {
  return /^gpt-5(\.|-|$)/.test(model);
}

export function buildOpenAIChatCompletionBody(input: OpenAIChatCompletionBodyInput): Record<string, unknown> {
  const body: Record<string, unknown> = {
    model: input.model,
    temperature: input.temperature,
    messages: input.messages,
  };

  if (usesOpenAICompletionTokenField(input.model)) {
    body.max_completion_tokens = input.maxTokens;
  } else {
    body.max_tokens = input.maxTokens;
  }

  if (input.stop) {
    body.stop = input.stop;
  }
  if (input.response_format) {
    body.response_format = input.response_format;
  }

  return body;
}

export function normalizeProviderDraftText(rawText: string): string {
  return normalizeExtractionText(rawText);
}

export function mapProviderErrorToExtractionFailure(
  provider: string,
  error: LLMProviderError | Error
) {
  const statusCode = error instanceof Error && 'statusCode' in error ? error.statusCode : undefined;
  const providerCode = error instanceof Error && 'code' in error ? error.code : undefined;

  return createExtractionFailure('transport', error.message, {
    provider,
    cause: error,
    details: {
      statusCode,
      providerCode,
    },
  });
}


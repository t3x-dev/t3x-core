/**
 * L3 command adapter — turns the worker's LLMCall contract into a call
 * against the API's extract-yops endpoint. HTTP happens in L1
 * (infrastructure/llm#postExtractYops); this module stays pure to the
 * command layer so commands/ never contains a literal fetch().
 */

import {
  createExtractionFailure,
  EXTRACTION_FAILURE_CODES,
  type ExtractionFailureCode,
  type SourcedYOp,
  type ValidationTurn,
} from '@t3x-dev/core';
import { postExtractYops } from '@/infrastructure/llm';
import { ExtractionRequestError } from './errors';
import type { RetryFailingOp } from './types';

export interface CallExtractionLLMInput {
  conversationId: string;
  turns: ValidationTurn[];
  failingOps?: RetryFailingOp[];
  provider?: string;
  model?: string;
}

interface ExtractYopsErrorBody {
  success: false;
  error: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
  };
}

function isExtractionFailureCode(value: unknown): value is ExtractionFailureCode {
  return (
    typeof value === 'string' && (EXTRACTION_FAILURE_CODES as readonly string[]).includes(value)
  );
}

function buildRequestError(
  status: number,
  body: ExtractYopsErrorBody | null,
  fallbackText: string
): ExtractionRequestError {
  const failureCode = body?.error.details?.failure_code;

  if (isExtractionFailureCode(failureCode)) {
    return new ExtractionRequestError(
      createExtractionFailure(failureCode, body?.error.message ?? fallbackText, {
        details: { statusCode: status, ...(body?.error.details ?? {}) },
      }),
      status,
      body?.error.code
    );
  }

  const fallbackFailure = createExtractionFailure(
    status === 429 || status === 401 || status === 403 ? 'transport' : 'draft_parse',
    body?.error.message ?? fallbackText,
    {
      details: { statusCode: status, ...(body?.error.details ?? {}) },
    }
  );

  return new ExtractionRequestError(fallbackFailure, status, body?.error.code);
}

export async function callExtractionLLM(input: CallExtractionLLMInput): Promise<SourcedYOp[]> {
  const res = await postExtractYops({
    conversation_id: input.conversationId,
    turns: input.turns,
    ...(input.failingOps ? { failing_ops: input.failingOps } : {}),
    ...(input.provider ? { provider: input.provider } : {}),
    ...(input.model ? { model: input.model } : {}),
  });

  let parsedBody: unknown;
  try {
    parsedBody = await res.json();
  } catch {
    parsedBody = null;
  }

  if (!res.ok) {
    const text =
      parsedBody && typeof parsedBody === 'object'
        ? JSON.stringify(parsedBody)
        : await res.text().catch(() => '');
    throw buildRequestError(
      res.status,
      parsedBody && typeof parsedBody === 'object' ? (parsedBody as ExtractYopsErrorBody) : null,
      `extract-yops HTTP ${res.status}: ${text}`
    );
  }
  const body = parsedBody as { success: true; data: { ops: SourcedYOp[] } } | ExtractYopsErrorBody;
  if (!body.success) {
    throw buildRequestError(
      res.status,
      body,
      `extract-yops ${body.error.code}: ${body.error.message}`
    );
  }
  return body.data.ops;
}

/**
 * L3 command adapter for AI-assisted YOps revision.
 *
 * HTTP happens in L1 (`infrastructure/llm#postReviseYops`). This module
 * translates the revision request/response envelope into a typed command
 * surface used by hooks and components.
 */

import type { Relation, SemanticContent, SourcedYOp, TreeNode } from '@t3x-dev/core';
import { postReviseYops } from '@/infrastructure/llm';

export interface YOpsRevisionTurn {
  turn_hash: string;
  role?: 'user' | 'assistant' | 'system' | 'tool';
  content: string;
}

export interface RequestYOpsRevisionInput {
  conversationId: string;
  feedback: string;
  yops: ReadonlyArray<Record<string, unknown>>;
  trees: SemanticContent['trees'] | TreeNode[];
  relations: SemanticContent['relations'] | Relation[];
  turns: YOpsRevisionTurn[];
  provider?: string;
  model?: string;
}

export interface YOpsRevisionDryRun {
  ok: boolean;
  applied: number;
  preview?: SemanticContent;
  error?: {
    op_index: number;
    code: string;
    message: string;
  };
}

export type YOpsRevisionResult =
  | {
      kind: 'ok';
      ops: SourcedYOp[];
      reason: string;
      dry_run: YOpsRevisionDryRun;
    }
  | {
      kind: 'validation_failed';
      ops: SourcedYOp[];
      reason: string;
      dry_run: YOpsRevisionDryRun;
    }
  | {
      kind: 'parse_failed';
      reason: string;
      message: string;
    };

interface ApiErrorBody {
  success: false;
  error: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
  };
}

interface ApiSuccessBody {
  success: true;
  data: YOpsRevisionResult;
}

export class YOpsRevisionRequestError extends Error {
  constructor(
    message: string,
    public status: number,
    public code?: string
  ) {
    super(message);
    this.name = 'YOpsRevisionRequestError';
  }
}

function requestBody(input: RequestYOpsRevisionInput): Record<string, unknown> {
  return {
    feedback: input.feedback,
    yops: input.yops,
    trees: input.trees,
    relations: input.relations,
    turns: input.turns,
    ...(input.provider ? { provider: input.provider } : {}),
    ...(input.model ? { model: input.model } : {}),
  };
}

function isErrorBody(body: unknown): body is ApiErrorBody {
  return Boolean(
    body &&
      typeof body === 'object' &&
      (body as { success?: unknown }).success === false &&
      (body as { error?: unknown }).error &&
      typeof (body as { error: { message?: unknown } }).error.message === 'string'
  );
}

export async function requestYOpsRevision(
  input: RequestYOpsRevisionInput
): Promise<YOpsRevisionResult> {
  const res = await postReviseYops(input.conversationId, requestBody(input));

  let parsedBody: unknown;
  try {
    parsedBody = await res.json();
  } catch {
    parsedBody = null;
  }

  if (!res.ok) {
    const fallback =
      parsedBody && typeof parsedBody === 'object'
        ? JSON.stringify(parsedBody)
        : await res.text().catch(() => '');
    if (isErrorBody(parsedBody)) {
      throw new YOpsRevisionRequestError(
        parsedBody.error.message,
        res.status,
        parsedBody.error.code
      );
    }
    throw new YOpsRevisionRequestError(`YOps revision HTTP ${res.status}: ${fallback}`, res.status);
  }

  const body = parsedBody as ApiSuccessBody | ApiErrorBody;
  if (!body?.success) {
    if (isErrorBody(body)) {
      throw new YOpsRevisionRequestError(body.error.message, res.status, body.error.code);
    }
    throw new YOpsRevisionRequestError('YOps revision returned an invalid response', res.status);
  }

  return body.data;
}

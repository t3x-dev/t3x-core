/**
 * Read-only legacy YOps evidence adapter.
 *
 * Thin typed wrapper around the existing API client. Presents a
 * SourcedYOp-based interface to Layer 2 and maps HTTP errors to
 * typed PersistenceError.
 */

import type { YOpsLogEntry } from '@t3x-dev/core';
import { ApiError } from '@/infrastructure/core';
import { listYOpsLog } from '@/infrastructure/trees';
export interface LoadYOpsLogOptions {
  activeOnly?: boolean;
}

export class PersistenceError extends Error {
  constructor(
    public operation: 'load',
    public code: string,
    message: string,
    public cause?: unknown
  ) {
    super(message);
    this.name = 'PersistenceError';
  }
}

function wrapError(operation: PersistenceError['operation'], err: unknown): PersistenceError {
  if (err instanceof PersistenceError) return err;
  if (err instanceof ApiError) {
    return new PersistenceError(operation, err.code, err.message, err);
  }
  const msg = err instanceof Error ? err.message : String(err);
  return new PersistenceError(operation, 'UNKNOWN', msg, err);
}

export async function loadYOpsLog(
  conversationId: string,
  topicId?: string,
  options?: LoadYOpsLogOptions
): Promise<YOpsLogEntry[]> {
  try {
    return await listYOpsLog(conversationId, topicId, { activeOnly: options?.activeOnly ?? true });
  } catch (err) {
    throw wrapError('load', err);
  }
}

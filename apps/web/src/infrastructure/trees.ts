/**
 * Legacy semantic-state API — YOps log reads and writes
 */

import type { SemanticContent, YOpsLogEntry, YOpsSource } from '@t3x-dev/core';
import { API_V1, fetchWithTimeout, handleResponse } from './core';

// ── Types ──

export type { YOpsSource, YOpsLogEntry };

// ── YOps Log CRUD ──

export async function listYOpsLog(
  conversationId: string,
  topicId?: string,
  opts: { activeOnly?: boolean } = { activeOnly: true }
): Promise<YOpsLogEntry[]> {
  const params = new URLSearchParams();
  if (topicId) params.set('topic_id', topicId);
  if (opts.activeOnly ?? true) params.set('active_only', 'true');
  const query = params.size > 0 ? `?${params.toString()}` : '';
  const res = await fetchWithTimeout(
    `${API_V1}/conversations/${encodeURIComponent(conversationId)}/yops${query}`
  );
  return handleResponse<YOpsLogEntry[]>(res);
}

export async function getSemanticDraft(
  conversationId: string,
  topicId?: string
): Promise<SemanticContent> {
  const params = topicId ? `?topic_id=${encodeURIComponent(topicId)}` : '';
  const res = await fetchWithTimeout(
    `${API_V1}/conversations/${encodeURIComponent(conversationId)}/draft${params}`
  );
  return handleResponse<SemanticContent>(res);
}

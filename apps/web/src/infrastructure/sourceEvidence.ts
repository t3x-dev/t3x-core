/**
 * Repository-owned, read-only source/evidence projection.
 */

import type { LegacyYOpsEvidence } from '@t3x-dev/api-client';
import type { ConversationSourceEvidence } from '@/types/sourceEvidence';
import { API_V1, buildQueryString, fetchWithTimeout, handleResponse } from './core';

export async function getConversationSourceEvidence(
  projectId: string,
  conversationId: string,
  options: { limit?: number; offset?: number; signal?: AbortSignal } = {}
): Promise<ConversationSourceEvidence> {
  const query = buildQueryString({ limit: options.limit, offset: options.offset });
  const suffix = query ? `?${query}` : '';
  const response = await fetchWithTimeout(
    `${API_V1}/projects/${encodeURIComponent(projectId)}/sources/conversations/${encodeURIComponent(
      conversationId
    )}${suffix}`,
    undefined,
    undefined,
    options.signal
  );
  return handleResponse<ConversationSourceEvidence>(response);
}

export async function getLegacyYOpsEvidence(
  projectId: string,
  conversationId: string,
  options: {
    topicId?: string;
    archivedOnly?: boolean;
    order?: 'asc' | 'desc';
    limit?: number;
    offset?: number;
    signal?: AbortSignal;
  } = {}
): Promise<LegacyYOpsEvidence> {
  const query = buildQueryString({
    topic_id: options.topicId,
    archived_only: options.archivedOnly,
    order: options.order,
    limit: options.limit,
    offset: options.offset,
  });
  const suffix = query ? `?${query}` : '';
  const response = await fetchWithTimeout(
    `${API_V1}/projects/${encodeURIComponent(projectId)}/sources/conversations/${encodeURIComponent(
      conversationId
    )}/legacy-yops${suffix}`,
    undefined,
    undefined,
    options.signal
  );
  return handleResponse<LegacyYOpsEvidence>(response);
}

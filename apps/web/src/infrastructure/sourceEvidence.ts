/**
 * Repository-owned, read-only source/evidence projection.
 */

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

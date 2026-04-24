/**
 * Conversations CRUD API
 */

import { API_V1, buildQueryString, fetchWithTimeout, handleResponse } from './core';
import type { Conversation, ConversationListData } from './types';

export async function listConversations(
  projectId: string,
  limit = 50,
  offset = 0
): Promise<ConversationListData> {
  const query = buildQueryString({ project_id: projectId, limit, offset });
  const res = await fetchWithTimeout(`${API_V1}/conversations?${query}`);
  return handleResponse<ConversationListData>(res);
}

export async function createConversation(
  projectId: string,
  title?: string,
  parentCommitHash?: string,
  position?: { x: number; y: number },
  metadata?: Record<string, unknown>
): Promise<Conversation> {
  const res = await fetchWithTimeout(`${API_V1}/conversations`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      project_id: projectId,
      title,
      parent_commit_hash: parentCommitHash,
      position_x: position?.x,
      position_y: position?.y,
      metadata,
    }),
  });
  return handleResponse<Conversation>(res);
}

export async function deleteConversation(
  conversationId: string
): Promise<{ deleted: boolean; conversation_id: string }> {
  const res = await fetchWithTimeout(
    `${API_V1}/conversations/${encodeURIComponent(conversationId)}`,
    {
      method: 'DELETE',
    }
  );
  return handleResponse<{ deleted: boolean; conversation_id: string }>(res);
}

export async function getConversation(
  conversationId: string
): Promise<Conversation & { turns_count?: number }> {
  const res = await fetchWithTimeout(
    `${API_V1}/conversations/${encodeURIComponent(conversationId)}`
  );
  return handleResponse<Conversation & { turns_count?: number }>(res);
}

export async function updateConversation(
  conversationId: string,
  updates: {
    title?: string;
    position_x?: number;
    position_y?: number;
    provider?: string | null;
    model?: string | null;
    metadata?: Record<string, unknown>;
  }
): Promise<Conversation> {
  const res = await fetchWithTimeout(
    `${API_V1}/conversations/${encodeURIComponent(conversationId)}`,
    {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates),
    }
  );
  return handleResponse<Conversation>(res);
}

/**
 * Export conversation context as a downloadable file (JSON or Markdown).
 * Returns the blob plus the server-advised filename (falls back to a
 * sensible default when Content-Disposition is absent).
 */
export async function exportConversationContext(
  conversationId: string,
  format: 'json' | 'markdown'
): Promise<{ blob: Blob; filename: string }> {
  const res = await fetchWithTimeout(
    `${API_V1}/conversations/${encodeURIComponent(conversationId)}/context-export?format=${format}`
  );
  if (!res.ok) {
    throw new Error(`Export failed (${res.status})`);
  }
  const disposition = res.headers.get('Content-Disposition');
  const filenameMatch = disposition?.match(/filename="(.+)"/);
  const filename =
    filenameMatch?.[1] ?? `${conversationId}-context.${format === 'markdown' ? 'md' : 'json'}`;
  const blob = await res.blob();
  return { blob, filename };
}

/**
 * Fetch the plain-text memory representation of a conversation
 * for clipboard/export style flows. Distinct from
 * `@/infrastructure/pins.getConversationMemory`, which returns the
 * structured BuiltContext used by chat context assembly.
 */
export async function getConversationMemoryText(conversationId: string): Promise<{ text: string }> {
  const res = await fetchWithTimeout(
    `${API_V1}/conversations/${encodeURIComponent(conversationId)}/memory`
  );
  return handleResponse<{ text: string }>(res);
}

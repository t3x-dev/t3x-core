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
  updates: { title?: string; position_x?: number; position_y?: number }
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

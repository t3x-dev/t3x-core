/**
 * Topics API Client
 *
 * CRUD operations for conversation topics.
 */

import { API_V1, fetchWithTimeout, handleResponse } from './core';

export interface Topic {
  id: string;
  conversation_id: string;
  project_id: string;
  name: string;
  status: string;
  created_at: string;
}

export async function listTopics(conversationId: string): Promise<Topic[]> {
  const res = await fetchWithTimeout(
    `${API_V1}/conversations/${encodeURIComponent(conversationId)}/topics`
  );
  return handleResponse<Topic[]>(res);
}

export async function createTopicApi(conversationId: string, name: string): Promise<Topic> {
  const res = await fetchWithTimeout(
    `${API_V1}/conversations/${encodeURIComponent(conversationId)}/topics`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    }
  );
  return handleResponse<Topic>(res);
}

export async function updateTopicApi(
  topicId: string,
  update: { name?: string; status?: string }
): Promise<Topic> {
  const res = await fetchWithTimeout(`${API_V1}/topics/${encodeURIComponent(topicId)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(update),
  });
  return handleResponse<Topic>(res);
}

export async function deleteTopicApi(topicId: string): Promise<void> {
  const res = await fetchWithTimeout(`${API_V1}/topics/${encodeURIComponent(topicId)}`, {
    method: 'DELETE',
  });
  await handleResponse<unknown>(res);
}

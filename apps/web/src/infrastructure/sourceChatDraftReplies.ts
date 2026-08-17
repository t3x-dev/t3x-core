import { API_V1, fetchWithTimeout, handleResponse } from './core';

export interface SourceChatDraftReplyRequest {
  conversation_id: string;
  user_turn_hash: string;
  provider?: string;
  model?: string;
  if_revision?: number;
}

export type SourceChatDraftItemKind = 'captured' | 'excluded' | 'needs_confirmation';

export interface SourceChatDraftItem {
  id: string;
  kind: SourceChatDraftItemKind;
  title: string;
  content: string;
  target_id?: string;
  target_path?: string;
  source_quote?: string;
  source_turn_hash?: string;
}

export interface SourceChatDraftDisplay {
  captured: string[];
  excluded: string[];
  needs_confirmation: string[];
}

export interface SourceChatDraftReplyResponse {
  content: string;
  display: SourceChatDraftDisplay;
  model: string;
  provider: string;
  source_items: SourceChatDraftItem[];
  warnings: string[];
  usage?: { input_tokens?: number; output_tokens?: number };
}

export async function createSourceChatDraftReply(
  projectId: string,
  workspaceId: string,
  request: SourceChatDraftReplyRequest
): Promise<SourceChatDraftReplyResponse> {
  const res = await fetchWithTimeout(
    `${API_V1}/projects/${encodeURIComponent(projectId)}/workspaces/${encodeURIComponent(
      workspaceId
    )}/source-chat/draft-reply`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request),
    },
    120000
  );
  return handleResponse<SourceChatDraftReplyResponse>(res);
}

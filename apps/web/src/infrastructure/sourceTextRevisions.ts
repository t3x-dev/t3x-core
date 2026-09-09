import type { SourceTextDraftSpan } from '@/domain/sourceTextDrafts';
import { API_V1, fetchWithTimeout, handleResponse } from './core';

export type SourceTextRevisionStatus =
  | 'saved'
  | 'patched'
  | 'no_patch'
  | 'patch_failed'
  | 'synced'
  | 'discarded';

export interface SourceTextRevisionDTO {
  revision_id: string;
  project_id: string;
  conversation_id: string;
  turn_hash: string;
  turn_role: 'user' | 'assistant' | 'system' | 'tool';
  action: 'add' | 'edit' | 'delete';
  start_char: number;
  end_char: number;
  selected_text: string;
  replacement_text: string;
  base_content: string;
  content: string;
  spans: SourceTextDraftSpan[];
  base_content_hash: string;
  status: SourceTextRevisionStatus;
  patch_ops: unknown[] | null;
  patch_error: string | null;
  created_at: string;
  updated_at: string;
}

export async function listSourceTextRevisions(
  projectId: string,
  conversationId: string
): Promise<SourceTextRevisionDTO[]> {
  const params = new URLSearchParams({
    project_id: projectId,
    conversation_id: conversationId,
  });
  const res = await fetchWithTimeout(`${API_V1}/source-text-revisions?${params.toString()}`);
  return handleResponse<SourceTextRevisionDTO[]>(res);
}

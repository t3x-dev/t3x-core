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

export interface CreateSourceTextRevisionInput {
  projectId: string;
  conversationId: string;
  turnHash: string;
  turnRole: 'user' | 'assistant' | 'system' | 'tool';
  action: 'add' | 'edit' | 'delete';
  startChar: number;
  endChar: number;
  selectedText: string;
  replacementText: string;
  baseContent: string;
  content: string;
  spans: SourceTextDraftSpan[];
  baseContentHash?: string;
}

export async function createSourceTextRevision(
  input: CreateSourceTextRevisionInput
): Promise<SourceTextRevisionDTO> {
  const res = await fetchWithTimeout(`${API_V1}/source-text-revisions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      project_id: input.projectId,
      conversation_id: input.conversationId,
      turn_hash: input.turnHash,
      turn_role: input.turnRole,
      action: input.action,
      start_char: input.startChar,
      end_char: input.endChar,
      selected_text: input.selectedText,
      replacement_text: input.replacementText,
      base_content: input.baseContent,
      content: input.content,
      spans: input.spans,
      ...(input.baseContentHash ? { base_content_hash: input.baseContentHash } : {}),
    }),
  });
  return handleResponse<SourceTextRevisionDTO>(res);
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

export async function updateSourceTextRevision(
  revisionId: string,
  input: {
    status?: SourceTextRevisionStatus;
    patchOps?: unknown[] | null;
    patchError?: string | null;
  }
): Promise<SourceTextRevisionDTO> {
  const res = await fetchWithTimeout(
    `${API_V1}/source-text-revisions/${encodeURIComponent(revisionId)}`,
    {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...(input.status ? { status: input.status } : {}),
        ...(input.patchOps !== undefined ? { patch_ops: input.patchOps } : {}),
        ...(input.patchError !== undefined ? { patch_error: input.patchError } : {}),
      }),
    }
  );
  return handleResponse<SourceTextRevisionDTO>(res);
}

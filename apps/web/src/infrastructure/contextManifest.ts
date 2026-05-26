/**
 * Conversation context manifest API.
 *
 * L1 only: this is the fetch boundary for the structured context manifest
 * consumed by L3 queries/hooks.
 */

import type { SemanticContent } from '@t3x-dev/core';
import { API_V1, fetchWithTimeout, handleResponse } from './core';

export type ContextManifestBaselineSource = 'parent_commit' | 'none';

export interface ContextManifestBaseline {
  commit_hash: string | null;
  branch: string | null;
  message: string | null;
  content: SemanticContent | null;
  source: ContextManifestBaselineSource;
  source_conversation_id: string | null;
  node_count: number;
  relation_count: number;
}

export interface ContextManifestReference {
  type: 'conversation' | 'leaf';
  id: string;
  pin_id: string;
  included: boolean;
  title?: string;
}

export interface ContextManifestFeedback {
  type: 'leaf_assertion' | 'runner_assertion';
  id: string;
  parent_ref_id: string;
  pin_id: string;
  selected: boolean;
  included: boolean;
  passed?: boolean;
  details?: string;
  lesson?: string;
}

export interface ContextManifestSource {
  type: 'commit' | 'conversation' | 'leaf';
  id: string;
  title?: string;
}

export interface ConversationContextManifest {
  conversation_id: string;
  project_id: string;
  baseline: ContextManifestBaseline;
  references: ContextManifestReference[];
  feedback: ContextManifestFeedback[];
  token_estimate: number;
  sources: ContextManifestSource[];
  chat_context_text: string;
  extraction_context_text: string;
}

export async function getContextManifest(
  conversationId: string
): Promise<ConversationContextManifest> {
  const res = await fetchWithTimeout(
    `${API_V1}/conversations/${encodeURIComponent(conversationId)}/context-manifest`
  );
  return handleResponse<ConversationContextManifest>(res);
}

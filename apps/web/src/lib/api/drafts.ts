/**
 * Drafts V1/V2 (Agent) + Workbench API
 */

import { API_V1, fetchWithTimeout, handleResponse } from './core';
import type { Draft } from './types';

// ============================================================================
// Drafts V1/V2 (Agent Layer)
// ============================================================================

export async function createDraft(
  projectId: string,
  conversationId: string,
  bridgeId: 'prose' | 'plan' | 'story' | 'summary' | 'refine' | 'explain' | 'clarify',
  intent: string,
  baseCommitHash?: string,
  turnAnchorHash?: string,
  /** Optional: pre-selected text from curate preview. If provided, use this instead of full conversation. */
  selectedText?: string,
  /** Curate parameters for debugging/review */
  curateParams?: { cosine?: number; keepRatio?: number }
): Promise<Draft> {
  // LLM draft generation typically takes 10-20 seconds for a single call
  const res = await fetchWithTimeout(
    `${API_V1}/agent/drafts`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        project_id: projectId,
        conversation_id: conversationId,
        bridge_id: bridgeId,
        intent,
        base_commit_hash: baseCommitHash,
        turn_anchor_hash: turnAnchorHash,
        selected_text: selectedText,
        cosine: curateParams?.cosine,
        keep_ratio: curateParams?.keepRatio,
      }),
    },
    30000
  );
  return handleResponse<Draft>(res);
}

export async function getDraft(draftId: string): Promise<Draft> {
  const res = await fetchWithTimeout(`${API_V1}/agent/drafts/${encodeURIComponent(draftId)}`);
  return handleResponse<Draft>(res);
}

export async function updateDraft(
  draftId: string,
  feedback?: string,
  appendMustHave?: string[]
): Promise<Draft> {
  const res = await fetchWithTimeout(`${API_V1}/agent/drafts/${encodeURIComponent(draftId)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      feedback,
      append_must_have: appendMustHave,
    }),
  });
  return handleResponse<Draft>(res);
}

// ============================================================================
// Workbench Drafts
// ============================================================================

export type DraftNodeOrigin =
  | { type: 'extracted'; segment_id: string; confidence: number }
  | { type: 'selected' }
  | { type: 'manual' };

export interface DraftNode {
  id: string;
  text: string;
  origin: DraftNodeOrigin;
  source?: {
    conversation_id: string;
    conversation_title?: string;
    turn_hash: string;
    role: string;
    start_char: number;
    end_char: number;
  };
  position: number;
  included: boolean;
}

export interface DraftConstraint {
  id: string;
  type: 'require' | 'exclude';
  match_mode: 'exact' | 'semantic';
  value: string;
  reason?: string;
}

export interface WorkbenchDraft {
  id: string;
  project_id: string;
  title: string;
  goal: string | null;
  parent_commit_hash: string | null;
  forked_from: string | null;
  nodes: DraftNode[];
  constraints: DraftConstraint[];
  instructions: string | null;
  preview_type: string | null;
  preview_output: string | null;
  preview_generated_at: string | null;
  status: 'editing' | 'committed' | 'abandoned' | 'auto';
  committed_as: string | null;
  committed_leaf_id: string | null;
  target_branch: string | null;
  revision: number;
  created_at: string;
  updated_at: string;
  // LLM extraction fields
  extraction_mode?: 'deterministic' | 'llm' | null;
  semantic_points?: SemanticPointAPI[] | null;
  extraction_cursor?: ExtractionCursorAPI | null;
}

export interface CreateWorkbenchDraftInput {
  project_id: string;
  title: string;
  goal?: string;
  parent_commit_hash?: string;
  target_branch?: string;
  preview_type?: string;
}

export interface UpdateWorkbenchDraftInput {
  title?: string;
  goal?: string;
  nodes?: DraftNode[];
  constraints?: DraftConstraint[];
  instructions?: string;
  preview_type?: string;
  target_branch?: string;
  if_revision: number;
}

export async function createWorkbenchDraft(
  input: CreateWorkbenchDraftInput
): Promise<WorkbenchDraft> {
  const res = await fetchWithTimeout(`${API_V1}/drafts`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  return handleResponse<WorkbenchDraft>(res);
}

export async function getWorkbenchDraft(draftId: string): Promise<WorkbenchDraft> {
  const res = await fetchWithTimeout(`${API_V1}/drafts/${encodeURIComponent(draftId)}`);
  return handleResponse<WorkbenchDraft>(res);
}

export async function listWorkbenchDrafts(
  projectId: string,
  status?: string
): Promise<WorkbenchDraft[]> {
  const params = new URLSearchParams({ project_id: projectId });
  if (status) params.set('status', status);
  const res = await fetchWithTimeout(`${API_V1}/drafts?${params.toString()}`);
  return handleResponse<WorkbenchDraft[]>(res);
}

export async function updateWorkbenchDraft(
  draftId: string,
  updates: UpdateWorkbenchDraftInput
): Promise<WorkbenchDraft> {
  const res = await fetchWithTimeout(`${API_V1}/drafts/${encodeURIComponent(draftId)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(updates),
  });
  return handleResponse<WorkbenchDraft>(res);
}

export async function deleteWorkbenchDraft(draftId: string): Promise<void> {
  const res = await fetchWithTimeout(`${API_V1}/drafts/${encodeURIComponent(draftId)}`, {
    method: 'DELETE',
  });
  await handleResponse(res);
}

export async function previewWorkbenchDraft(
  draftId: string,
  options?: { model?: string; preview_type?: string }
): Promise<{ output: string; model_used: string; token_count: number; cached: boolean }> {
  const res = await fetchWithTimeout(`${API_V1}/drafts/${encodeURIComponent(draftId)}/preview`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(options ?? {}),
  });
  return handleResponse<{
    output: string;
    model_used: string;
    token_count: number;
    cached: boolean;
  }>(res);
}

export interface SuggestResult {
  sentence_id: string;
  text: string;
  commit_hash: string;
  similarity: number;
  already_in_draft: boolean;
}

export async function suggestForDraft(draftId: string, limit?: number): Promise<SuggestResult[]> {
  const res = await fetchWithTimeout(`${API_V1}/drafts/${encodeURIComponent(draftId)}/suggest`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ limit }),
  });
  const data = await handleResponse<{ suggestions: SuggestResult[] }>(res);
  return data.suggestions;
}

export async function commitWorkbenchDraft(
  draftId: string,
  message?: string
): Promise<{
  commit: Record<string, unknown>;
  leaf: Record<string, unknown> | null;
  draft_status: string;
}> {
  const res = await fetchWithTimeout(`${API_V1}/drafts/${encodeURIComponent(draftId)}/commit`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message }),
  });
  return handleResponse<{
    commit: Record<string, unknown>;
    leaf: Record<string, unknown> | null;
    draft_status: string;
  }>(res);
}

export async function forkWorkbenchDraft(draftId: string): Promise<WorkbenchDraft> {
  const res = await fetchWithTimeout(`${API_V1}/drafts/${encodeURIComponent(draftId)}/fork`, {
    method: 'POST',
  });
  return handleResponse<WorkbenchDraft>(res);
}

// ============================================================================
// Auto-Draft (LLM Extraction)
// ============================================================================

/**
 * Create an auto-draft by extracting sentences from a conversation via LLM.
 */
export async function createAutoDraft(
  input: {
    project_id: string;
    conversation_id: string;
    parent_commit_hash?: string;
    target_branch?: string;
    options?: { max_sentences?: number };
  },
  signal?: AbortSignal
): Promise<WorkbenchDraft> {
  const res = await fetchWithTimeout(
    `${API_V1}/drafts/auto`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    },
    60_000,
    signal
  );
  return handleResponse<WorkbenchDraft>(res);
}

/**
 * Promote an auto-draft to editing status.
 */
export async function promoteDraft(draftId: string): Promise<WorkbenchDraft> {
  const res = await fetchWithTimeout(`${API_V1}/drafts/${encodeURIComponent(draftId)}/promote`, {
    method: 'POST',
  });
  return handleResponse<WorkbenchDraft>(res);
}

/** Extract-to-draft response */
export interface ExtractToDraftResult {
  added_count: number;
  draft: WorkbenchDraft;
}

/**
 * Extract sentences from a conversation and append to an existing draft.
 */
export async function extractToDraft(
  draftId: string,
  conversationId: string,
  options?: { max_sentences?: number }
): Promise<ExtractToDraftResult> {
  const res = await fetchWithTimeout(
    `${API_V1}/drafts/${encodeURIComponent(draftId)}/extract`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        conversation_id: conversationId,
        options,
      }),
    },
    60_000
  );
  return handleResponse<ExtractToDraftResult>(res);
}

// ============================================================================
// LLM Incremental Extraction Types (API layer)
// ============================================================================

export interface LocatedEvidenceAPI {
  conversation_id: string;
  turn_hash: string;
  quoted_text: string;
  start_char: number;
  end_char: number;
  match_score: number;
  role: 'primary' | 'supporting';
  relevance: string;
  enabled: boolean;
}

export interface SemanticPointAPI {
  id: string;
  text: string;
  extraction_mode: 'deterministic' | 'llm_extracted' | 'manual';
  inference_type?: 'direct' | 'paraphrase' | 'cross_turn' | 'implicit';
  status: 'inherited' | 'auto_landed' | 'reviewed' | 'modified' | 'reinforced' | 'undone';
  zone: 'ready' | 'review';
  routing_reason?: string;
  inherited_from?: string;
  evidence: LocatedEvidenceAPI[];
  confidence?: number;
  low_coverage?: boolean;
  position: number;
  staged: boolean;
}

export interface ExtractionCursorAPI {
  cursors: Record<
    string,
    {
      last_processed_turn: string;
      processed_at: string;
    }
  >;
}

// ============================================================================
// LLM Incremental Extraction
// ============================================================================

export interface IncrementalExtractResult {
  ready_points: SemanticPointAPI[];
  review_points: SemanticPointAPI[];
  cursor: ExtractionCursorAPI;
  stats: {
    total_turns: number;
    new_turns: number;
    proposals: number;
    auto_landed: number;
    needs_review: number;
    rejected: number;
  };
}

export async function extractIncremental(
  projectId: string,
  conversationId: string,
  draftId: string
): Promise<IncrementalExtractResult> {
  const res = await fetchWithTimeout(
    `${API_V1}/extract/incremental`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        project_id: projectId,
        conversation_id: conversationId,
        draft_id: draftId,
      }),
    },
    60_000
  );
  return handleResponse<IncrementalExtractResult>(res);
}

export interface ReviewActionResult {
  semantic_points: SemanticPointAPI[];
}

export async function reviewAction(
  draftId: string,
  spId: string,
  action: 'accept' | 'dismiss' | 'undo' | 'edit',
  editedText?: string
): Promise<ReviewActionResult> {
  const res = await fetchWithTimeout(
    `${API_V1}/drafts/${encodeURIComponent(draftId)}/review-action`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sp_id: spId, action, edited_text: editedText }),
    }
  );
  return handleResponse<ReviewActionResult>(res);
}

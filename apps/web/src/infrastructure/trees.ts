/**
 * Tree Semantic Engine API — extraction, yops log
 */

import type { SemanticContent, YOp, YOpsLogEntry, YOpsSource } from '@t3x-dev/core';
import { API_V1, fetchWithTimeout, handleResponse } from './core';

// ── Types ──

export type { YOpsSource, YOpsLogEntry };

export interface TreeExtractResult {
  delta?: unknown;
  snapshot?: SemanticContent;
  yops_log_id?: string;
  status: 'completed' | 'skipped';
  reason?: string;
}

export interface TreeAnswerResult {
  applied: boolean;
  delta?: unknown;
  snapshot?: SemanticContent;
  yops_log_id?: string;
  new_project_id?: string;
  new_project_url?: string;
  errors?: string[];
}

// ── Tree Extraction ──

export async function extractNodes(
  conversationId: string,
  turnHashes?: string[],
  opts?: {
    topicId?: string;
    forceExtract?: boolean;
  }
): Promise<TreeExtractResult> {
  const res = await fetchWithTimeout(
    `${API_V1}/extract/trees`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        conversation_id: conversationId,
        ...(turnHashes && { turn_hashes: turnHashes }),
        ...(opts?.topicId && { topic_id: opts.topicId }),
        ...(opts?.forceExtract && { force_extract: opts.forceExtract }),
      }),
    },
    60_000
  );
  return handleResponse<TreeExtractResult>(res);
}

export async function answerTreeQuestion(
  conversationId: string,
  answers: Array<{
    question_id: string;
    drift_choice?: string;
    answer_text?: string;
    selected_value?: unknown;
  }>,
  questionContext?: { type?: string; tree_id?: string; slot_key?: string },
  driftContext?: { relation?: string; new_topic?: string }
): Promise<TreeAnswerResult> {
  const res = await fetchWithTimeout(
    `${API_V1}/extract/trees/answer`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        conversation_id: conversationId,
        answers,
        ...(questionContext && { question_context: questionContext }),
        ...(driftContext && { drift_context: driftContext }),
      }),
    },
    60_000
  );
  return handleResponse<TreeAnswerResult>(res);
}

// ── YOps Log CRUD ──

export async function listYOpsLog(
  conversationId: string,
  topicId?: string,
  opts: { activeOnly?: boolean } = { activeOnly: true }
): Promise<YOpsLogEntry[]> {
  const params = new URLSearchParams();
  if (topicId) params.set('topic_id', topicId);
  if (opts.activeOnly ?? true) params.set('active_only', 'true');
  const query = params.size > 0 ? `?${params.toString()}` : '';
  const res = await fetchWithTimeout(
    `${API_V1}/conversations/${encodeURIComponent(conversationId)}/yops${query}`
  );
  return handleResponse<YOpsLogEntry[]>(res);
}

export async function getSemanticDraft(
  conversationId: string,
  topicId?: string
): Promise<SemanticContent> {
  const params = topicId ? `?topic_id=${encodeURIComponent(topicId)}` : '';
  const res = await fetchWithTimeout(
    `${API_V1}/conversations/${encodeURIComponent(conversationId)}/draft${params}`
  );
  return handleResponse<SemanticContent>(res);
}

export interface CreateYOpsEntryOptions {
  /**
   * Maps to the `replace_active_llm_draft` field on POST /yops. When true,
   * the API marks every active-draft LLM-sourced entry for this
   * conversation as `superseded_at = now()` inside the same transaction
   * as the new entry's insert. Manual-edit (HumanSource) ops on prior
   * entries are explicitly preserved by the API regardless of this flag
   * — that's the v1 contract from the suggestion-vs-baseline RFC.
   *
   * Note (2026-05-04): the WebUI Apply path no longer opts into this
   * supersede branch — staged Extract drafts and manual edits both send
   * explicit `false`, so re-extract appends rather than stacking-then-
   * replacing. This option is retained for non-WebUI callers (legacy
   * clients, future agent flows) that genuinely want explicit-supersede
   * semantics. See
   * `docs/superpowers/specs/2026-05-04-yops-append-apply-mechanism-design.md`.
   *
   * Default omitted = API treats as `false`, preserving append-only
   * behaviour for every existing caller (gold edits, compression,
   * MCP, etc.).
   */
  replaceActiveLLMDraft?: boolean;
  /**
   * Repair mode for a replay-failing persisted yops_log row. Maps to
   * `repair_yops_log_id`; the API supersedes that row and inserts the
   * edited script atomically.
   */
  repairYopsLogId?: string;
  /**
   * Full active-script replacement mode. Used when the user edits the
   * Script editor after the script has already been applied; maps to
   * `replace_active_script` so the API supersedes active uncommitted rows
   * instead of appending the whole script a second time.
   */
  replaceActiveScript?: boolean;
}

export async function createYOpsEntry(
  conversationId: string,
  yops: YOp[],
  source: YOpsSource,
  metadata?: Record<string, unknown>,
  options?: CreateYOpsEntryOptions
): Promise<YOpsLogEntry> {
  const res = await fetchWithTimeout(
    `${API_V1}/conversations/${encodeURIComponent(conversationId)}/yops`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        source,
        yops,
        ...(metadata && { metadata }),
        ...(options?.replaceActiveLLMDraft !== undefined && {
          replace_active_llm_draft: options.replaceActiveLLMDraft,
        }),
        ...(options?.repairYopsLogId && { repair_yops_log_id: options.repairYopsLogId }),
        ...(options?.replaceActiveScript !== undefined && {
          replace_active_script: options.replaceActiveScript,
        }),
      }),
    }
  );
  return handleResponse<YOpsLogEntry>(res);
}

export async function deleteYOpsEntry(conversationId: string, yopsId: string): Promise<void> {
  const res = await fetchWithTimeout(
    `${API_V1}/conversations/${encodeURIComponent(conversationId)}/yops/${encodeURIComponent(yopsId)}`,
    { method: 'DELETE' }
  );
  await handleResponse<unknown>(res);
}

// ── Compression ──

export interface CompressResult {
  delta: unknown;
  snapshot?: import('@t3x-dev/core').SemanticContent;
  metadata: {
    compress_summary: string;
    trees_before: number;
    trees_after: number;
    merged_count: number;
    removed_count: number;
    removed_tree_ids: string[];
  };
  yops_log_id: string;
}

export async function compressNodes(conversationId: string): Promise<CompressResult> {
  const res = await fetchWithTimeout(
    `${API_V1}/conversations/${encodeURIComponent(conversationId)}/compress`,
    { method: 'POST', headers: { 'Content-Type': 'application/json' } },
    60_000
  );
  return handleResponse<CompressResult>(res);
}

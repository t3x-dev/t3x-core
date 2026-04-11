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
  status: 'completed' | 'drift_detected' | 'skipped';
  drift?: { relation?: string; new_topic?: string; old_topic?: string };
  choices?: string[];
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
  driftDecision?: { choice: string; relation?: string; new_topic?: string },
  opts?: {
    topicId?: string;
    forceExtract?: boolean;
    sourcePinIds?: string[];
    style?: { granularity?: string; quote_length?: string; update_stance?: string; tier3?: string };
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
        ...(driftDecision && { drift_decision: driftDecision }),
        ...(opts?.topicId && { topic_id: opts.topicId }),
        ...(opts?.forceExtract && { force_extract: opts.forceExtract }),
        ...(opts?.sourcePinIds?.length && { source_pin_ids: opts.sourcePinIds }),
        ...(opts?.style && { style: opts.style }),
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
  topicId?: string
): Promise<YOpsLogEntry[]> {
  const params = topicId ? `?topic_id=${encodeURIComponent(topicId)}` : '';
  const res = await fetchWithTimeout(
    `${API_V1}/conversations/${encodeURIComponent(conversationId)}/yops${params}`
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

export async function createYOpsEntry(
  conversationId: string,
  yops: YOp[],
  source: YOpsSource
): Promise<YOpsLogEntry> {
  const res = await fetchWithTimeout(
    `${API_V1}/conversations/${encodeURIComponent(conversationId)}/yops`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ source, yops }),
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


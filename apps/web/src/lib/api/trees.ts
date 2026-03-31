/**
 * Tree Semantic Engine API — extraction, yops log, gate check
 */

import type { YOp, YOpsLogEntry, YOpsSource, SemanticContent } from '@t3x-dev/core';
import { API_V1, fetchWithTimeout, handleResponse } from './core';

// ── Types ──

export type { YOpsSource, YOpsLogEntry };


export interface AdvisoryQuestion {
  id: string;
  type: 'vagueness' | 'structural';
  treeId: string;
  slotKey?: string;
  question: string;
  currentValue?: unknown;
}

export interface TreeExtractResult {
  delta?: unknown;
  snapshot?: SemanticContent;
  yops_log_id?: string;
  status: 'completed' | 'drift_detected' | 'skipped';
  drift?: { relation?: string; new_topic?: string; old_topic?: string };
  choices?: string[];
  gate_result?: GateCheckResult;
  advisory_questions?: AdvisoryQuestion[];
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

export interface GateCheckResult {
  passed: boolean;
  structure: {
    passed: boolean;
    checks: {
      schema_valid: boolean;
      refs_intact: boolean;
      relations_valid: boolean;
      no_cycles: boolean;
      no_duplicate_ids: boolean;
      no_self_relations: boolean;
    };
    warnings?: Array<{ type: string; message: string; location: string }>;
  };
  semantic?: {
    passed: boolean;
    score: number;
    dimensions: Record<string, { score: number; details: string }>;
    issues: Array<{
      severity: 'error' | 'warning' | 'info';
      tree_id?: string;
      dimension: string;
      description: string;
      suggestion?: string;
    }>;
  };
  business?: {
    passed: boolean;
    results: Array<{
      rule_id: string;
      passed: boolean;
      message?: string;
      severity: 'error' | 'warning';
    }>;
  };
}

export type GateIssue = NonNullable<GateCheckResult['semantic']>['issues'][number];

// ── Tree Extraction ──

export async function extractNodes(
  conversationId: string,
  turnHashes?: string[],
  driftDecision?: { choice: string; relation?: string; new_topic?: string },
  opts?: { topicId?: string; forceExtract?: boolean }
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

/** @deprecated Use listYOpsLog instead */
export const listDeltas = listYOpsLog;

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

// ── Gate Check ──

export async function gateCheck(
  content: SemanticContent,
  opts?: {
    conversation_id?: string;
    turns?: Array<{ role: string; content: string }>;
    business_rules?: Array<{
      id: string;
      type: 'rule' | 'llm';
      rule?: string;
      prompt?: string;
      message?: string;
      severity: 'error' | 'warning';
    }>;
    gates?: Array<'structure' | 'semantic' | 'business'>;
  }
): Promise<GateCheckResult> {
  const res = await fetchWithTimeout(
    `${API_V1}/gate/check`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content, ...opts }),
    },
    60_000
  );
  return handleResponse<GateCheckResult>(res);
}

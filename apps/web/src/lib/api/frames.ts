/**
 * Frame Semantic Engine API — extraction, delta log, gate check
 */

import type { Delta, DeltaLogEntry, DeltaSource, SemanticContent } from '@t3x-dev/core';
import { API_V1, fetchWithTimeout, handleResponse } from './core';

// ── Types ──

export type { DeltaSource, DeltaLogEntry };

export interface AdvisoryQuestion {
  id: string;
  type: 'vagueness' | 'structural';
  frameId: string;
  slotKey?: string;
  question: string;
  currentValue?: unknown;
}

export interface FrameExtractResult {
  delta?: Delta;
  snapshot?: SemanticContent;
  delta_log_id?: string;
  status: 'completed' | 'drift_detected' | 'skipped';
  drift?: { relation?: string; new_topic?: string; old_topic?: string };
  choices?: string[];
  gate_result?: GateCheckResult;
  advisory_questions?: AdvisoryQuestion[];
  reason?: string;
}

export interface FrameAnswerResult {
  applied: boolean;
  delta?: Delta;
  snapshot?: SemanticContent;
  delta_log_id?: string;
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
      frame_id?: string;
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

// ── Frame Extraction ──

export async function extractFrames(
  conversationId: string,
  turnHashes?: string[],
  driftDecision?: { choice: string; relation?: string; new_topic?: string }
): Promise<FrameExtractResult> {
  const res = await fetchWithTimeout(
    `${API_V1}/extract/frames`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        conversation_id: conversationId,
        ...(turnHashes && { turn_hashes: turnHashes }),
        ...(driftDecision && { drift_decision: driftDecision }),
      }),
    },
    60_000
  );
  return handleResponse<FrameExtractResult>(res);
}

export async function answerFrameQuestion(
  conversationId: string,
  answers: Array<{
    question_id: string;
    drift_choice?: string;
    answer_text?: string;
    selected_value?: unknown;
  }>,
  questionContext?: { type?: string; frame_id?: string; slot_key?: string },
  driftContext?: { relation?: string; new_topic?: string }
): Promise<FrameAnswerResult> {
  const res = await fetchWithTimeout(
    `${API_V1}/extract/frames/answer`,
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
  return handleResponse<FrameAnswerResult>(res);
}

// ── Delta Log CRUD ──

export async function listDeltas(conversationId: string): Promise<DeltaLogEntry[]> {
  const res = await fetchWithTimeout(
    `${API_V1}/conversations/${encodeURIComponent(conversationId)}/deltas`
  );
  return handleResponse<DeltaLogEntry[]>(res);
}

export async function getSemanticDraft(conversationId: string): Promise<SemanticContent> {
  const res = await fetchWithTimeout(
    `${API_V1}/conversations/${encodeURIComponent(conversationId)}/draft`
  );
  return handleResponse<SemanticContent>(res);
}

export async function createDelta(
  conversationId: string,
  delta: Delta,
  source: DeltaSource
): Promise<DeltaLogEntry> {
  const res = await fetchWithTimeout(
    `${API_V1}/conversations/${encodeURIComponent(conversationId)}/deltas`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ source, delta }),
    }
  );
  return handleResponse<DeltaLogEntry>(res);
}

export async function deleteDelta(conversationId: string, deltaId: string): Promise<void> {
  const res = await fetchWithTimeout(
    `${API_V1}/conversations/${encodeURIComponent(conversationId)}/deltas/${encodeURIComponent(deltaId)}`,
    { method: 'DELETE' }
  );
  await handleResponse<unknown>(res);
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

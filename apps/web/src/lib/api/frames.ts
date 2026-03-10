/**
 * Frame Semantic Engine API — extraction, delta log, gate check
 */

import type { Delta, DeltaLogEntry, DeltaSource, SemanticContent } from '@t3x/core';
import { API_V1, fetchWithTimeout, handleResponse } from './core';

// ── Types ──

export type { DeltaSource, DeltaLogEntry };

export interface FrameExtractResult {
  delta: Delta;
  snapshot: SemanticContent;
  delta_log_id: string;
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
  turnHashes?: string[]
): Promise<FrameExtractResult> {
  const res = await fetchWithTimeout(`${API_V1}/extract/frames`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      conversation_id: conversationId,
      ...(turnHashes && { turn_hashes: turnHashes }),
    }),
  });
  return handleResponse<FrameExtractResult>(res);
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
  const res = await fetchWithTimeout(`${API_V1}/gate/check`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content, ...opts }),
  });
  return handleResponse<GateCheckResult>(res);
}

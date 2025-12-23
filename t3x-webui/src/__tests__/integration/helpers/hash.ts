/**
 * Hash Verification Helper
 *
 * 使用 @t3x/core 的权威 hash 计算函数进行验证。
 * 这是"王炸断言"的核心：API 返回的 hash 必须与 Core 重算的 hash 完全一致。
 */

import { computeTurnHash, computeCommitHash } from '@t3x/core';

/**
 * 验证 Turn hash
 * 返回 { valid, expected, actual }
 */
export function verifyTurnHash(turn: {
  turn_hash: string;
  parent_turn_hash: string | null;
  project_id: string;
  conversation_id: string;
  role: string;
  content: string;
  language?: string | null;
  rings?: unknown;
  created_at: string;
}): { valid: boolean; expected: string; actual: string } {
  const ringsJson = turn.rings ? JSON.stringify(turn.rings) : null;

  const expected = computeTurnHash({
    parent_turn_hash: turn.parent_turn_hash,
    project_id: turn.project_id,
    conversation_id: turn.conversation_id,
    role: turn.role,
    content: turn.content,
    language: turn.language ?? null,
    rings_json: ringsJson,
    created_at: turn.created_at,
  });

  return {
    valid: expected === turn.turn_hash,
    expected,
    actual: turn.turn_hash,
  };
}

/**
 * 验证 Commit hash
 * 返回 { valid, expected, actual }
 */
export function verifyCommitHash(commit: {
  commit_hash: string;
  project_id: string;
  branch: string;
  parents_json: string;
  turn_window_json: string;
  facet_snapshot_json: string;
  pipeline_config_json?: string | null;
  draft_id?: string | null;
  draft_text_hash?: string | null;
  signature_json?: string | null;
  created_at: string;
}): { valid: boolean; expected: string; actual: string } {
  const expected = computeCommitHash({
    project_id: commit.project_id,
    branch: commit.branch,
    parents_json: commit.parents_json,
    turn_window_json: commit.turn_window_json,
    facet_snapshot_json: commit.facet_snapshot_json,
    pipeline_config_json: commit.pipeline_config_json ?? null,
    draft_id: commit.draft_id ?? null,
    draft_text_hash: commit.draft_text_hash ?? null,
    signature_json: commit.signature_json ?? null,
    created_at: commit.created_at,
  });

  return {
    valid: expected === commit.commit_hash,
    expected,
    actual: commit.commit_hash,
  };
}

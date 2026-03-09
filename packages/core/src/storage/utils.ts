/**
 * Storage utilities: ID generation, timestamps, hash computation
 */

import { createHash, randomUUID } from 'crypto';
import { canonicalize } from 'json-canonicalize';
import type { ContentBlock } from '../multimodal/contentBlock';

// === ID Generation ===

export function generateProjectId(): string {
  return `proj_${randomUUID().replace(/-/g, '').slice(0, 8)}`;
}

export function generateConversationId(): string {
  return `conv_${randomUUID().replace(/-/g, '').slice(0, 8)}`;
}

export function generateBranchId(): string {
  return `branch_${randomUUID().replace(/-/g, '').slice(0, 8)}`;
}

export function generateDraftId(): string {
  return `draft_${randomUUID().replace(/-/g, '').slice(0, 8)}`;
}

export function generateMergeDraftId(): string {
  return `mdraft_${randomUUID().replace(/-/g, '').slice(0, 12)}`;
}

// === V4 ID Generation (12-char IDs per V4 spec) ===

export function generateLeafId(): string {
  return `leaf_${randomUUID().replace(/-/g, '').slice(0, 12)}`;
}

export function generateConstraintId(): string {
  return `cst_${randomUUID().replace(/-/g, '').slice(0, 12)}`;
}

export function generateAssertionId(): string {
  return `ast_${randomUUID().replace(/-/g, '').slice(0, 12)}`;
}

export function generatePinId(): string {
  return `pin_${randomUUID().replace(/-/g, '').slice(0, 12)}`;
}

export function generateLeafHistoryId(): string {
  return `lhist_${randomUUID().replace(/-/g, '').slice(0, 12)}`;
}

export function generateSentenceId(): string {
  return `s_${randomUUID().replace(/-/g, '').slice(0, 12)}`;
}

export function generateDraftV3Id(): string {
  return `draft_${randomUUID().replace(/-/g, '').slice(0, 12)}`;
}

export function generateDraftSentenceId(): string {
  return `ds_${randomUUID().replace(/-/g, '').slice(0, 12)}`;
}

export function generateDraftConstraintId(): string {
  return `dc_${randomUUID().replace(/-/g, '').slice(0, 12)}`;
}

// === Timestamps ===

export function isoNow(): string {
  return new Date().toISOString();
}

// === Hash Computation (JCS + SHA256) ===

export function computeJCSHash(data: unknown): string {
  const canonical = canonicalize(data);
  const hash = createHash('sha256').update(canonical, 'utf8').digest('hex');
  return `sha256:${hash}`;
}

/**
 * Compute turn hash from turn data (excludes turn_hash itself)
 *
 * When content_blocks is provided and non-empty, uses turn_v2 schema
 * which includes content_blocks in the hash. Otherwise falls back to
 * turn_v1 for backward compatibility.
 */
export function computeTurnHash(data: {
  parent_turn_hash: string | null;
  project_id: string;
  conversation_id: string;
  role: string;
  content: string;
  language: string | null;
  rings_json: string | null;
  created_at: string;
  content_blocks?: ContentBlock[] | null;
}): string {
  if (data.content_blocks && data.content_blocks.length > 0) {
    return computeJCSHash({
      parent_turn_hash: data.parent_turn_hash,
      project_id: data.project_id,
      conversation_id: data.conversation_id,
      role: data.role,
      content: data.content,
      content_blocks: data.content_blocks,
      language: data.language,
      rings_json: data.rings_json,
      created_at: data.created_at,
      schema_version: 'turn_v2',
    });
  }
  return computeJCSHash({
    parent_turn_hash: data.parent_turn_hash,
    project_id: data.project_id,
    conversation_id: data.conversation_id,
    role: data.role,
    content: data.content,
    language: data.language,
    rings_json: data.rings_json,
    created_at: data.created_at,
    schema_version: 'turn_v1',
  });
}

/**
 * Compute commit hash from commit data (excludes message)
 */
export function computeCommitHash(data: {
  project_id: string;
  branch: string;
  parents_json: string;
  turn_window_json: string;
  facet_snapshot_json: string;
  pipeline_config_json: string | null;
  draft_id: string | null;
  draft_text_hash: string | null;
  signature_json: string | null;
  created_at: string;
}): string {
  return computeJCSHash({
    project_id: data.project_id,
    branch: data.branch,
    parents_json: data.parents_json,
    turn_window_json: data.turn_window_json,
    facet_snapshot_json: data.facet_snapshot_json,
    pipeline_config_json: data.pipeline_config_json,
    draft_id: data.draft_id,
    draft_text_hash: data.draft_text_hash,
    signature_json: data.signature_json,
    created_at: data.created_at,
    schema_version: 'commit_v1',
  });
}

/**
 * Compute text hash for draft verification
 */
export function computeTextHash(text: string): string {
  const hash = createHash('sha256').update(text, 'utf8').digest('hex');
  return `sha256:${hash}`;
}

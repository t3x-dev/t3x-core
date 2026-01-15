/**
 * Storage utilities: ID generation, timestamps, hash computation
 */

import { createHash, randomUUID } from 'crypto';
import { canonicalize } from 'json-canonicalize';

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

// === Timestamps ===

export function isoNow(): string {
  return new Date().toISOString().replace('+00:00', 'Z');
}

// === Hash Computation (JCS + SHA256) ===

export function computeJCSHash(data: unknown): string {
  const canonical = canonicalize(data);
  const hash = createHash('sha256').update(canonical, 'utf8').digest('hex');
  return `sha256:${hash}`;
}

/**
 * Compute turn hash from turn data (excludes turn_hash itself)
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
}): string {
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

export type SourceAvailabilityMode = 'available' | 'partial' | 'legacy' | 'unavailable';

export type SourceAvailabilityReason =
  | 'SOURCE_RECORD_MISSING'
  | 'TURN_PAGE_INCOMPLETE'
  | 'LEGACY_COMMIT_SOURCE_REFERENCE';

export interface ConversationSourceEvidence {
  availability: {
    mode: SourceAvailabilityMode;
    reasons: SourceAvailabilityReason[];
  };
  source: {
    type: 'conversation';
    id: string;
    project_id: string;
    title: string | null;
    alias: string | null;
    parent_commit_hash: string | null;
    committed_as: string | null;
    committed_at: string | null;
    created_at: string;
    metadata: Record<string, unknown> | null;
    provider: string | null;
    model: string | null;
  } | null;
  turns: {
    items: Array<{
      turn_hash: string;
      parent_turn_hash: string | null;
      role: 'user' | 'assistant' | 'system' | 'tool';
      content: string;
      language: string | null;
      rings: unknown | null;
      content_blocks: unknown[] | null;
      created_at: string;
    }>;
    total: number;
    limit: number;
    offset: number;
    completeness: 'complete' | 'partial';
  };
  revisions: Array<{
    revision_id: string;
    turn_hash: string;
    turn_role: 'user' | 'assistant' | 'system' | 'tool';
    action: 'add' | 'edit' | 'delete';
    selected_text: string;
    replacement_text: string;
    content: string;
    spans: Array<{
      id: string;
      action: 'add' | 'edit' | 'delete';
      start: number;
      end: number;
      text: string;
      original_text: string;
    }>;
    base_content_hash: string;
    status: 'saved' | 'patched' | 'no_patch' | 'patch_failed' | 'synced' | 'discarded';
    created_at: string;
    updated_at: string;
  }>;
  evidence_selection: {
    mode: 'not_recorded';
    turn_hashes: string[];
  };
  referring_commits: Array<{
    format: 'legacy_v1';
    commit_id: string;
    branch: string;
    message: string | null;
    recorded_at: string;
    source_title: string | null;
  }>;
}

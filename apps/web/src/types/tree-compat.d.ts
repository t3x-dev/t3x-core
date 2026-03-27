/**
 * Module augmentation to add backward-compatible properties to core types.
 *
 * During the tree-primary migration, many UI components still reference
 * old property names. This augmentation adds them as optional properties
 * for type compatibility during the migration period.
 */

import '@t3x-dev/core';

declare module '@t3x-dev/core' {
  interface TreeNode {
    /** @deprecated Use `key` instead. Present for migration compat. */
    id?: string;
    /** @deprecated Use `key` instead. Present for migration compat. */
    type?: string;
    /** Slot-level source references (migration compat) */
    slot_sources?: Record<string, unknown>;
    /** Manual edit flag (migration compat) */
    manual_edited?: boolean;
  }

  interface Commit {
    /** @deprecated Removed in tree-primary. */
    position_x?: number;
    /** @deprecated Removed in tree-primary. */
    position_y?: number;
    /** @deprecated Use provenance. */
    sources?: Array<{ type: string; id: string; title?: string }>;
    /** Alias for semantic content display */
    semantic?: SemanticContent;
    /** Alias for source_refs in some UI contexts */
    source_refs?: Array<{ type: string; id: string; title?: string }>;
  }
}

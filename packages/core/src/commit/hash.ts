/**
 * Hash computation for frame-based commits.
 *
 * First-class fields (in hash):
 *   schema, parents, author, committed_at,
 *   content.frames (id, type, slots, confidence),
 *   content.relations (from, to, type, confidence)
 *
 * Second-class fields (NOT in hash):
 *   frame.source, frame.slot_sources,
 *   project_id, message, branch, sources, provenance, position
 */

import { sha256 } from '../common/hash';
import type { CommitFirstClass } from './types';

export function computeCommitHash(commit: CommitFirstClass): string {
  const hashable = {
    schema: commit.schema,
    parents: commit.parents,
    author: commit.author,
    committed_at: commit.committed_at,
    content: {
      frames: commit.content.frames.map((f) => ({
        id: f.id,
        type: f.type,
        slots: f.slots,
        ...(f.confidence !== undefined ? { confidence: f.confidence } : {}),
      })),
      relations: commit.content.relations.map((r) => ({
        from: r.from,
        to: r.to,
        type: r.type,
        ...(r.confidence !== undefined ? { confidence: r.confidence } : {}),
      })),
    },
  };

  return `sha256:${sha256(hashable)}`;
}

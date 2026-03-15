/**
 * Upgrade legacy sentence-based commits to frame-based commits.
 *
 * If the legacy commit has a `semantic` field with frames, those are used.
 * Otherwise, each sentence becomes a frame with type 'legacy_sentence'
 * and a single slot { text: sentence.text }.
 */

import type { Frame, Relation } from '../semantic/types';
import type { Commit, Source } from './types';
import { COMMIT_SCHEMA } from './types';

interface LegacySentence {
  id: string;
  text: string;
  confidence?: number;
  source_ref?: unknown;
}

interface LegacyCommit {
  hash: string;
  schema: string;
  parents: string[];
  author: { type: string; name?: string; id?: string };
  committed_at: string;
  content: {
    sentences?: LegacySentence[];
    frames?: Frame[];
    relations?: Relation[];
  };
  project_id: string;
  message: string | null;
  branch: string;
  source_refs?: Array<{ type: string; id: string; title?: string }> | null;
  semantic?: { frames: Frame[]; relations: Relation[] } | null;
  sources?: Source[] | null;
  provenance?: Commit['provenance'];
  position_x?: number;
  position_y?: number;
}

export function upgradeLegacyCommit(raw: LegacyCommit): Commit {
  // Already current schema — pass through
  if (raw.schema === COMMIT_SCHEMA) {
    return raw as unknown as Commit;
  }

  // Use semantic frames if available, otherwise convert sentences
  let frames: Frame[];
  let relations: Relation[] = [];

  if (raw.semantic?.frames && raw.semantic.frames.length > 0) {
    frames = raw.semantic.frames;
    relations = raw.semantic.relations ?? [];
  } else if (raw.content.sentences) {
    frames = raw.content.sentences.map((s, i) => ({
      id: `f_${String(i + 1).padStart(3, '0')}`,
      type: 'legacy_sentence',
      slots: { text: s.text },
      confidence: s.confidence,
    }));
  } else {
    frames = [];
  }

  // Convert source_refs to sources
  const sources: Source[] | null = raw.source_refs
    ? raw.source_refs.map((sr) => ({
        type: sr.type as Source['type'],
        id: sr.id,
        title: sr.title,
      }))
    : raw.sources ?? null;

  return {
    hash: raw.hash,
    schema: COMMIT_SCHEMA,
    parents: raw.parents,
    author: {
      type: raw.author.type as Commit['author']['type'],
      id: raw.author.id,
      name: raw.author.name,
    },
    committed_at: raw.committed_at,
    content: { frames, relations },
    project_id: raw.project_id,
    message: raw.message,
    branch: raw.branch,
    sources,
    provenance: raw.provenance ?? null,
    position_x: raw.position_x,
    position_y: raw.position_y,
  };
}

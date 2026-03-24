/**
 * executeMerge Tests
 *
 * executeMerge now returns SemanticContent (frames + relations) instead of SentenceCommit.
 * Commit wrapping (hash, parents, author) is handled by the storage layer.
 */

import { describe, expect, it } from 'vitest';
import type { DiffableSentence } from '../../diff/types';
import { executeMerge } from '../../merge/executeMerge';
import type { Merge2WayResult } from '../../merge/types';

function makePrepared(overrides: Partial<Merge2WayResult> = {}): Merge2WayResult {
  return {
    identical: [],
    similarPairs: [],
    onlyInSource: [],
    onlyInTarget: [],
    ...overrides,
  };
}

function sent(id: string, text: string): DiffableSentence {
  return { id, text };
}

describe('executeMerge', () => {
  // ===========================================================================
  // Basic merge scenarios
  // ===========================================================================
  describe('basic merge', () => {
    it('returns SemanticContent with frames and relations', () => {
      const prepared = makePrepared();
      const result = executeMerge(prepared, 'sha256:src', 'sha256:tgt');

      expect(result).toHaveProperty('frames');
      expect(result).toHaveProperty('relations');
      expect(result.frames).toEqual([]);
      expect(result.relations).toEqual([]);
    });

    it('includes identical sentences as frames', () => {
      const prepared = makePrepared({
        identical: [sent('s1', 'Identical text')],
      });
      const result = executeMerge(prepared, 'sha256:src', 'sha256:tgt');
      expect(result.frames).toHaveLength(1);
      expect(result.frames[0].slots.text).toBe('Identical text');
      expect(result.frames[0].type).toBe('knowledge');
    });

    it('generates deterministic f_ prefixed IDs', () => {
      const prepared = makePrepared({
        identical: [sent('s1', 'Test')],
      });
      const result = executeMerge(prepared, 'sha256:src', 'sha256:tgt');
      expect(result.frames[0].id).toMatch(/^f_/);
    });

    it('generates same IDs for same inputs (deterministic)', () => {
      const prepared = makePrepared({ identical: [sent('s1', 'Test')] });
      const r1 = executeMerge(prepared, 'sha256:src', 'sha256:tgt');
      const r2 = executeMerge(prepared, 'sha256:src', 'sha256:tgt');
      expect(r1.frames[0].id).toBe(r2.frames[0].id);
    });
  });

  // ===========================================================================
  // Similar pairs resolution
  // ===========================================================================
  describe('similar pairs', () => {
    it('includes source sentence when resolution is source', () => {
      const prepared = makePrepared({
        similarPairs: [
          {
            source: sent('s1', 'Budget $3000'),
            target: sent('t1', 'Budget $3500'),
            wordDiff: [],
            resolution: 'source',
          },
        ],
      });
      const result = executeMerge(prepared, 'sha256:src', 'sha256:tgt');
      expect(result.frames[0].slots.text).toBe('Budget $3000');
    });

    it('includes target sentence when resolution is target', () => {
      const prepared = makePrepared({
        similarPairs: [
          {
            source: sent('s1', 'Budget $3000'),
            target: sent('t1', 'Budget $3500'),
            wordDiff: [],
            resolution: 'target',
          },
        ],
      });
      const result = executeMerge(prepared, 'sha256:src', 'sha256:tgt');
      expect(result.frames[0].slots.text).toBe('Budget $3500');
    });

    it('throws when similarPair has no resolution', () => {
      const prepared = makePrepared({
        similarPairs: [
          {
            source: sent('s1', 'Budget $3000'),
            target: sent('t1', 'Budget $3500'),
            wordDiff: [],
          },
        ],
      });
      expect(() =>
        executeMerge(prepared, 'sha256:src', 'sha256:tgt')
      ).toThrow('Unresolved similar pair');
    });
  });

  // ===========================================================================
  // onlyInSource / onlyInTarget
  // ===========================================================================
  describe('unique sentences', () => {
    it('includes kept onlyInSource sentences as frames', () => {
      const prepared = makePrepared({
        onlyInSource: [{ sentence: sent('s1', 'Source only'), keep: true }],
      });
      const result = executeMerge(prepared, 'sha256:src', 'sha256:tgt');
      expect(result.frames).toHaveLength(1);
      expect(result.frames[0].slots.text).toBe('Source only');
    });

    it('excludes discarded onlyInSource sentences', () => {
      const prepared = makePrepared({
        onlyInSource: [{ sentence: sent('s1', 'Discarded'), keep: false }],
      });
      const result = executeMerge(prepared, 'sha256:src', 'sha256:tgt');
      expect(result.frames).toHaveLength(0);
    });

    it('includes kept onlyInTarget sentences as frames', () => {
      const prepared = makePrepared({
        onlyInTarget: [{ sentence: sent('t1', 'Target only'), keep: true }],
      });
      const result = executeMerge(prepared, 'sha256:src', 'sha256:tgt');
      expect(result.frames).toHaveLength(1);
    });

    it('excludes discarded onlyInTarget sentences', () => {
      const prepared = makePrepared({
        onlyInTarget: [{ sentence: sent('t1', 'Discarded'), keep: false }],
      });
      const result = executeMerge(prepared, 'sha256:src', 'sha256:tgt');
      expect(result.frames).toHaveLength(0);
    });
  });

  // ===========================================================================
  // source_ref preservation
  // ===========================================================================
  describe('source_ref', () => {
    it('preserves source turn_hash on frame.source', () => {
      const sourceRef = {
        conversation_id: 'conv_1',
        turn_hash: 'sha256:abc',
        start_char: 0,
        end_char: 10,
      };
      const prepared = makePrepared({
        identical: [{ id: 's1', text: 'With ref', source_ref: sourceRef }],
      });
      const result = executeMerge(prepared, 'sha256:src', 'sha256:tgt');
      expect(result.frames[0].source).toBe('sha256:abc');
    });

    it('omits source when source_ref not present', () => {
      const prepared = makePrepared({
        identical: [sent('s1', 'No ref')],
      });
      const result = executeMerge(prepared, 'sha256:src', 'sha256:tgt');
      expect(result.frames[0].source).toBeUndefined();
    });
  });

  // ===========================================================================
  // Full merge
  // ===========================================================================
  describe('full merge', () => {
    it('combines all categories in correct order', () => {
      const prepared = makePrepared({
        identical: [sent('s_ident', 'Identical')],
        similarPairs: [
          {
            source: sent('s_sim', 'Old value'),
            target: sent('t_sim', 'New value'),
            wordDiff: [],
            resolution: 'target',
          },
        ],
        onlyInSource: [{ sentence: sent('s_only', 'Source kept'), keep: true }],
        onlyInTarget: [{ sentence: sent('t_only', 'Target kept'), keep: true }],
      });
      const result = executeMerge(prepared, 'sha256:src', 'sha256:tgt');
      const texts = result.frames.map((f) => f.slots.text);
      expect(texts).toEqual(['Identical', 'New value', 'Source kept', 'Target kept']);
    });

    it('always returns empty relations array', () => {
      const prepared = makePrepared({
        identical: [sent('s1', 'Test')],
      });
      const result = executeMerge(prepared, 'sha256:src', 'sha256:tgt');
      expect(result.relations).toEqual([]);
    });
  });
});

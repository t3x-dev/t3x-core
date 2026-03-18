/**
 * executeMerge Tests
 */

import { describe, expect, it } from 'vitest';
import type { DiffableSentence } from '../../diff/types';
import { executeMerge } from '../../merge/executeMerge';
import type { Merge2WayResult } from '../../merge/types';

const author = { type: 'human' as const, name: 'Alice' };

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
    it('creates SentenceCommit with correct schema and parents', () => {
      const prepared = makePrepared();
      const result = executeMerge(
        prepared,
        'sha256:src',
        'sha256:tgt',
        author,
        'Merge msg',
        'proj_1'
      );

      expect(result.schema).toBe('t3x/commit/v4');
      expect(result.parents).toEqual(['sha256:src', 'sha256:tgt']);
      expect(result.author).toEqual(author);
      expect(result.message).toBe('Merge msg');
      expect(result.project_id).toBe('proj_1');
      expect(result.hash).toMatch(/^sha256:/);
      expect(result.committed_at).toBeDefined();
    });

    it('includes identical sentences', () => {
      const prepared = makePrepared({
        identical: [sent('s1', 'Identical text')],
      });
      const result = executeMerge(prepared, 'sha256:src', 'sha256:tgt', author, 'msg', 'proj_1');
      expect(result.content.sentences).toHaveLength(1);
      expect(result.content.sentences[0].text).toBe('Identical text');
    });

    it('generates deterministic s_ prefixed IDs', () => {
      const prepared = makePrepared({
        identical: [sent('s1', 'Test')],
      });
      const result = executeMerge(prepared, 'sha256:src', 'sha256:tgt', author, 'msg', 'proj_1');
      expect(result.content.sentences[0].id).toMatch(/^s_/);
      expect(result.content.sentences[0].id.length).toBe(14); // s_ + 12 hex chars
    });

    it('generates same IDs for same inputs (deterministic)', () => {
      const prepared = makePrepared({ identical: [sent('s1', 'Test')] });
      const r1 = executeMerge(prepared, 'sha256:src', 'sha256:tgt', author, 'msg', 'proj_1');
      const r2 = executeMerge(prepared, 'sha256:src', 'sha256:tgt', author, 'msg', 'proj_1');
      expect(r1.content.sentences[0].id).toBe(r2.content.sentences[0].id);
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
      const result = executeMerge(prepared, 'sha256:src', 'sha256:tgt', author, 'msg', 'proj_1');
      expect(result.content.sentences[0].text).toBe('Budget $3000');
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
      const result = executeMerge(prepared, 'sha256:src', 'sha256:tgt', author, 'msg', 'proj_1');
      expect(result.content.sentences[0].text).toBe('Budget $3500');
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
        executeMerge(prepared, 'sha256:src', 'sha256:tgt', author, 'msg', 'proj_1')
      ).toThrow('Unresolved similar pair');
    });
  });

  // ===========================================================================
  // onlyInSource / onlyInTarget
  // ===========================================================================
  describe('unique sentences', () => {
    it('includes kept onlyInSource sentences', () => {
      const prepared = makePrepared({
        onlyInSource: [{ sentence: sent('s1', 'Source only'), keep: true }],
      });
      const result = executeMerge(prepared, 'sha256:src', 'sha256:tgt', author, 'msg', 'proj_1');
      expect(result.content.sentences).toHaveLength(1);
      expect(result.content.sentences[0].text).toBe('Source only');
    });

    it('excludes discarded onlyInSource sentences', () => {
      const prepared = makePrepared({
        onlyInSource: [{ sentence: sent('s1', 'Discarded'), keep: false }],
      });
      const result = executeMerge(prepared, 'sha256:src', 'sha256:tgt', author, 'msg', 'proj_1');
      expect(result.content.sentences).toHaveLength(0);
    });

    it('includes kept onlyInTarget sentences', () => {
      const prepared = makePrepared({
        onlyInTarget: [{ sentence: sent('t1', 'Target only'), keep: true }],
      });
      const result = executeMerge(prepared, 'sha256:src', 'sha256:tgt', author, 'msg', 'proj_1');
      expect(result.content.sentences).toHaveLength(1);
    });

    it('excludes discarded onlyInTarget sentences', () => {
      const prepared = makePrepared({
        onlyInTarget: [{ sentence: sent('t1', 'Discarded'), keep: false }],
      });
      const result = executeMerge(prepared, 'sha256:src', 'sha256:tgt', author, 'msg', 'proj_1');
      expect(result.content.sentences).toHaveLength(0);
    });
  });

  // ===========================================================================
  // source_ref preservation
  // ===========================================================================
  describe('source_ref', () => {
    it('preserves source_ref through merge', () => {
      const sourceRef = {
        conversation_id: 'conv_1',
        turn_hash: 'sha256:abc',
        start_char: 0,
        end_char: 10,
      };
      const prepared = makePrepared({
        identical: [{ id: 's1', text: 'With ref', source_ref: sourceRef }],
      });
      const result = executeMerge(prepared, 'sha256:src', 'sha256:tgt', author, 'msg', 'proj_1');
      expect(result.content.sentences[0].source_ref).toEqual(sourceRef);
    });

    it('omits source_ref when not present', () => {
      const prepared = makePrepared({
        identical: [sent('s1', 'No ref')],
      });
      const result = executeMerge(prepared, 'sha256:src', 'sha256:tgt', author, 'msg', 'proj_1');
      expect(result.content.sentences[0].source_ref).toBeUndefined();
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
      const result = executeMerge(prepared, 'sha256:src', 'sha256:tgt', author, 'msg', 'proj_1');
      const texts = result.content.sentences.map((s) => s.text);
      expect(texts).toEqual(['Identical', 'New value', 'Source kept', 'Target kept']);
    });
  });
});

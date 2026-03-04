/**
 * Three-Way Merge Tests
 *
 * Tests for prepareThreeWayMerge and executeThreeWayMerge.
 * Covers the decision matrix for all base sentence scenarios:
 * - unchanged, one-sided modification, divergent edit,
 * - delete vs modify, identical changes, additions, empty base.
 */

import { describe, expect, it } from 'vitest';
import type { DiffableSentence } from '../../diff/types';
import { executeThreeWayMerge, prepareThreeWayMerge } from '../../merge/threeWayMerge';
import type { CommitAuthor } from '../../types/v4';

// ============================================================================
// Test Helpers
// ============================================================================

const sent = (id: string, text: string): DiffableSentence => ({ id, text });

const author: CommitAuthor = { type: 'human', name: 'Test User' };
const projectId = 'proj_test3way';

// ============================================================================
// prepareThreeWayMerge Tests
// ============================================================================

describe('prepareThreeWayMerge', () => {
  // -------------------------------------------------------------------------
  // 1. Clean merge (no conflicts)
  // -------------------------------------------------------------------------
  describe('clean merge (no conflicts)', () => {
    it('returns clean status when source modifies and target is unchanged', () => {
      const base = [sent('b1', 'Budget is $3000'), sent('b2', 'Meeting on Monday')];
      const source = [sent('s1', 'Budget is $3500'), sent('s2', 'Meeting on Monday')];
      const target = [sent('t1', 'Budget is $3000'), sent('t2', 'Meeting on Monday')];

      const result = prepareThreeWayMerge(base, source, target);

      expect(result.status).toBe('clean');
      expect(result.conflicts).toHaveLength(0);
      expect(result.unchanged).toHaveLength(1);
      expect(result.unchanged[0].text).toBe('Meeting on Monday');
      expect(result.autoMerged).toHaveLength(1);
      expect(result.autoMerged[0].sentence.text).toBe('Budget is $3500');
      expect(result.autoMerged[0].from).toBe('source');
    });

    it('handles multiple auto-merged sentences from different sides', () => {
      const base = [sent('b1', 'Budget is $3000'), sent('b2', 'Meeting on Monday')];
      const source = [sent('s1', 'Budget is $3500'), sent('s2', 'Meeting on Monday')];
      const target = [sent('t1', 'Budget is $3000'), sent('t2', 'Meeting on Tuesday')];

      const result = prepareThreeWayMerge(base, source, target);

      expect(result.status).toBe('clean');
      expect(result.conflicts).toHaveLength(0);
      expect(result.autoMerged).toHaveLength(2);

      const fromSource = result.autoMerged.find((m) => m.from === 'source');
      const fromTarget = result.autoMerged.find((m) => m.from === 'target');

      expect(fromSource?.sentence.text).toBe('Budget is $3500');
      expect(fromTarget?.sentence.text).toBe('Meeting on Tuesday');
    });
  });

  // -------------------------------------------------------------------------
  // 2. One-sided modifications
  // -------------------------------------------------------------------------
  describe('one-sided modifications', () => {
    it('auto-merges source-only modification', () => {
      const base = [sent('b1', 'The quick brown fox jumps over the lazy dog')];
      const source = [sent('s1', 'The quick brown fox leaps over the lazy dog')];
      const target = [sent('t1', 'The quick brown fox jumps over the lazy dog')];

      const result = prepareThreeWayMerge(base, source, target);

      expect(result.status).toBe('clean');
      expect(result.autoMerged).toHaveLength(1);
      expect(result.autoMerged[0].from).toBe('source');
      expect(result.autoMerged[0].baseSentence?.text).toBe(
        'The quick brown fox jumps over the lazy dog'
      );
    });

    it('auto-merges target-only modification', () => {
      const base = [sent('b1', 'The quick brown fox jumps over the lazy dog')];
      const source = [sent('s1', 'The quick brown fox jumps over the lazy dog')];
      const target = [sent('t1', 'The quick brown fox jumps over the lazy cat')];

      const result = prepareThreeWayMerge(base, source, target);

      expect(result.status).toBe('clean');
      expect(result.autoMerged).toHaveLength(1);
      expect(result.autoMerged[0].from).toBe('target');
    });

    it('auto-resolves deletion in source only', () => {
      const base = [sent('b1', 'Sentence one'), sent('b2', 'Sentence two')];
      const source = [sent('s2', 'Sentence two')]; // b1 deleted
      const target = [sent('t1', 'Sentence one'), sent('t2', 'Sentence two')];

      const result = prepareThreeWayMerge(base, source, target);

      expect(result.status).toBe('clean');
      expect(result.unchanged).toHaveLength(1);
      expect(result.unchanged[0].text).toBe('Sentence two');
      // b1 is not in unchanged, autoMerged, or conflicts — it's removed
      expect(result.autoMerged).toHaveLength(0);
      expect(result.conflicts).toHaveLength(0);
    });

    it('auto-resolves deletion in target only', () => {
      const base = [sent('b1', 'Sentence one'), sent('b2', 'Sentence two')];
      const source = [sent('s1', 'Sentence one'), sent('s2', 'Sentence two')];
      const target = [sent('t2', 'Sentence two')]; // b1 deleted

      const result = prepareThreeWayMerge(base, source, target);

      expect(result.status).toBe('clean');
      expect(result.unchanged).toHaveLength(1);
      expect(result.unchanged[0].text).toBe('Sentence two');
      expect(result.autoMerged).toHaveLength(0);
    });

    it('auto-resolves deletion in both sides', () => {
      const base = [sent('b1', 'Delete me'), sent('b2', 'Keep me')];
      const source = [sent('s2', 'Keep me')]; // b1 deleted
      const target = [sent('t2', 'Keep me')]; // b1 deleted

      const result = prepareThreeWayMerge(base, source, target);

      expect(result.status).toBe('clean');
      expect(result.unchanged).toHaveLength(1);
      expect(result.unchanged[0].text).toBe('Keep me');
      expect(result.conflicts).toHaveLength(0);
    });
  });

  // -------------------------------------------------------------------------
  // 3. Divergent edit conflict
  // -------------------------------------------------------------------------
  describe('divergent edit conflict', () => {
    it('detects divergent edits as conflict', () => {
      const base = [sent('b1', 'Budget is $3000 for the project')];
      const source = [sent('s1', 'Budget is $3500 for the project')];
      const target = [sent('t1', 'Budget is $4000 for the project')];

      const result = prepareThreeWayMerge(base, source, target);

      expect(result.status).toBe('conflicts');
      expect(result.conflicts).toHaveLength(1);
      expect(result.conflicts[0].type).toBe('divergent_edit');
      expect(result.conflicts[0].base.text).toBe('Budget is $3000 for the project');
      expect(result.conflicts[0].source?.text).toBe('Budget is $3500 for the project');
      expect(result.conflicts[0].target?.text).toBe('Budget is $4000 for the project');
    });

    it('includes word diffs for divergent edit conflicts', () => {
      const base = [sent('b1', 'Budget is $3000 for the project')];
      const source = [sent('s1', 'Budget is $3500 for the project')];
      const target = [sent('t1', 'Budget is $4000 for the project')];

      const result = prepareThreeWayMerge(base, source, target);

      expect(result.conflicts[0].baseToSourceDiff).toBeDefined();
      expect(result.conflicts[0].baseToTargetDiff).toBeDefined();
      expect(result.conflicts[0].baseToSourceDiff!.length).toBeGreaterThan(0);
      expect(result.conflicts[0].baseToTargetDiff!.length).toBeGreaterThan(0);
    });

    it('has no resolution set initially', () => {
      const base = [sent('b1', 'Budget is $3000 for the project')];
      const source = [sent('s1', 'Budget is $3500 for the project')];
      const target = [sent('t1', 'Budget is $4000 for the project')];

      const result = prepareThreeWayMerge(base, source, target);

      expect(result.conflicts[0].resolution).toBeUndefined();
    });
  });

  // -------------------------------------------------------------------------
  // 4. Delete vs modify conflict
  // -------------------------------------------------------------------------
  describe('delete vs modify conflict', () => {
    it('detects delete in source + modify in target as conflict', () => {
      const base = [sent('b1', 'The quick brown fox jumps over the lazy dog')];
      const source: DiffableSentence[] = []; // deleted
      const target = [sent('t1', 'The quick brown fox leaps over the lazy dog')]; // modified

      const result = prepareThreeWayMerge(base, source, target);

      expect(result.status).toBe('conflicts');
      expect(result.conflicts).toHaveLength(1);
      expect(result.conflicts[0].type).toBe('delete_vs_modify');
      expect(result.conflicts[0].source).toBeNull();
      expect(result.conflicts[0].target?.text).toBe('The quick brown fox leaps over the lazy dog');
      expect(result.conflicts[0].baseToTargetDiff).toBeDefined();
    });

    it('detects modify in source + delete in target as conflict', () => {
      const base = [sent('b1', 'The quick brown fox jumps over the lazy dog')];
      const source = [sent('s1', 'The quick brown fox leaps over the lazy dog')]; // modified
      const target: DiffableSentence[] = []; // deleted

      const result = prepareThreeWayMerge(base, source, target);

      expect(result.status).toBe('conflicts');
      expect(result.conflicts).toHaveLength(1);
      expect(result.conflicts[0].type).toBe('delete_vs_modify');
      expect(result.conflicts[0].source?.text).toBe('The quick brown fox leaps over the lazy dog');
      expect(result.conflicts[0].target).toBeNull();
      expect(result.conflicts[0].baseToSourceDiff).toBeDefined();
    });
  });

  // -------------------------------------------------------------------------
  // 5. Identical changes on both sides (auto-resolve)
  // -------------------------------------------------------------------------
  describe('identical changes on both sides', () => {
    it('auto-resolves when both sides make the same modification', () => {
      const base = [sent('b1', 'Budget is $3000 for the project')];
      const source = [sent('s1', 'Budget is $3500 for the project')];
      const target = [sent('t1', 'Budget is $3500 for the project')];

      const result = prepareThreeWayMerge(base, source, target);

      expect(result.status).toBe('clean');
      expect(result.conflicts).toHaveLength(0);
      expect(result.autoMerged).toHaveLength(1);
      expect(result.autoMerged[0].sentence.text).toBe('Budget is $3500 for the project');
    });
  });

  // -------------------------------------------------------------------------
  // 6. New additions from both sides
  // -------------------------------------------------------------------------
  describe('additions from both sides', () => {
    it('collects additions from source', () => {
      const base = [sent('b1', 'Original sentence')];
      const source = [sent('s1', 'Original sentence'), sent('s2', 'New from source branch')];
      const target = [sent('t1', 'Original sentence')];

      const result = prepareThreeWayMerge(base, source, target);

      expect(result.additions).toHaveLength(1);
      expect(result.additions[0].sentence.text).toBe('New from source branch');
      expect(result.additions[0].from).toBe('source');
    });

    it('collects additions from target', () => {
      const base = [sent('b1', 'Original sentence')];
      const source = [sent('s1', 'Original sentence')];
      const target = [sent('t1', 'Original sentence'), sent('t2', 'New from target branch')];

      const result = prepareThreeWayMerge(base, source, target);

      expect(result.additions).toHaveLength(1);
      expect(result.additions[0].sentence.text).toBe('New from target branch');
      expect(result.additions[0].from).toBe('target');
    });

    it('collects additions from both sides', () => {
      const base = [sent('b1', 'Original sentence')];
      const source = [sent('s1', 'Original sentence'), sent('s2', 'Added by source')];
      const target = [sent('t1', 'Original sentence'), sent('t2', 'Added by target')];

      const result = prepareThreeWayMerge(base, source, target);

      expect(result.additions).toHaveLength(2);
      const sourceAddition = result.additions.find((a) => a.from === 'source');
      const targetAddition = result.additions.find((a) => a.from === 'target');
      expect(sourceAddition?.sentence.text).toBe('Added by source');
      expect(targetAddition?.sentence.text).toBe('Added by target');
    });

    it('deduplicates identical additions from both sides', () => {
      const base = [sent('b1', 'Original sentence')];
      const source = [sent('s1', 'Original sentence'), sent('s2', 'Both sides added this')];
      const target = [sent('t1', 'Original sentence'), sent('t2', 'Both sides added this')];

      const result = prepareThreeWayMerge(base, source, target);

      // Should only have one addition, not two
      expect(result.additions).toHaveLength(1);
      expect(result.additions[0].sentence.text).toBe('Both sides added this');
    });
  });

  // -------------------------------------------------------------------------
  // 7. Empty base (equivalent to two-way)
  // -------------------------------------------------------------------------
  describe('empty base', () => {
    it('treats all sentences as additions when base is empty', () => {
      const base: DiffableSentence[] = [];
      const source = [sent('s1', 'Source sentence alpha beta gamma')];
      const target = [sent('t1', 'Target sentence delta epsilon zeta')];

      const result = prepareThreeWayMerge(base, source, target);

      expect(result.status).toBe('clean');
      expect(result.unchanged).toHaveLength(0);
      expect(result.autoMerged).toHaveLength(0);
      expect(result.conflicts).toHaveLength(0);
      expect(result.additions).toHaveLength(2);
    });

    it('deduplicates identical additions even with empty base', () => {
      const base: DiffableSentence[] = [];
      const source = [sent('s1', 'Same text in both branches')];
      const target = [sent('t1', 'Same text in both branches')];

      const result = prepareThreeWayMerge(base, source, target);

      expect(result.additions).toHaveLength(1);
    });
  });

  // -------------------------------------------------------------------------
  // 8. Mixed scenarios
  // -------------------------------------------------------------------------
  describe('mixed scenarios', () => {
    it('handles a complex real-world merge scenario', () => {
      const base = [
        sent('b1', 'Project budget is $3000 allocated'),
        sent('b2', 'Meeting scheduled for Monday morning'),
        sent('b3', 'Team lead is Alice Johnson'),
        sent('b4', 'Deadline is end of quarter'),
      ];

      const source = [
        sent('s1', 'Project budget is $3500 allocated'), // modified
        sent('s2', 'Meeting scheduled for Monday morning'), // unchanged
        // b3 deleted
        sent('s4', 'Deadline is end of quarter'), // unchanged
        sent('s5', 'New requirement added by source'), // added
      ];

      const target = [
        sent('t1', 'Project budget is $3000 allocated'), // unchanged
        sent('t2', 'Meeting scheduled for Tuesday morning'), // modified
        sent('t3', 'Team lead is Alice Johnson'), // unchanged
        sent('t4', 'Deadline is end of year'), // modified
        sent('t6', 'New requirement added by target'), // added
      ];

      const result = prepareThreeWayMerge(base, source, target);

      // b1: modified in source only → autoMerged from source
      expect(
        result.autoMerged.some((m) => m.sentence.text === 'Project budget is $3500 allocated')
      ).toBe(true);

      // b2: modified in target only → autoMerged from target
      expect(
        result.autoMerged.some((m) => m.sentence.text === 'Meeting scheduled for Tuesday morning')
      ).toBe(true);

      // b3: deleted in source, unchanged in target → auto-removed (not in any result)
      const allTexts = [
        ...result.unchanged.map((s) => s.text),
        ...result.autoMerged.map((m) => m.sentence.text),
        ...result.conflicts.map((c) => c.base.text),
      ];
      expect(allTexts).not.toContain('Team lead is Alice Johnson');

      // b4: modified in target only → autoMerged from target
      expect(result.autoMerged.some((m) => m.sentence.text === 'Deadline is end of year')).toBe(
        true
      );

      // Additions from both sides
      expect(
        result.additions.some((a) => a.sentence.text === 'New requirement added by source')
      ).toBe(true);
      expect(
        result.additions.some((a) => a.sentence.text === 'New requirement added by target')
      ).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // 9. Edge cases
  // -------------------------------------------------------------------------
  describe('edge cases', () => {
    it('handles all-empty inputs', () => {
      const result = prepareThreeWayMerge([], [], []);

      expect(result.status).toBe('clean');
      expect(result.unchanged).toHaveLength(0);
      expect(result.autoMerged).toHaveLength(0);
      expect(result.additions).toHaveLength(0);
      expect(result.conflicts).toHaveLength(0);
    });

    it('handles base with content but both branches empty', () => {
      const base = [sent('b1', 'Will be deleted by both')];
      const source: DiffableSentence[] = [];
      const target: DiffableSentence[] = [];

      const result = prepareThreeWayMerge(base, source, target);

      expect(result.status).toBe('clean');
      expect(result.unchanged).toHaveLength(0);
      expect(result.autoMerged).toHaveLength(0);
      expect(result.conflicts).toHaveLength(0);
    });

    it('preserves source_ref through three-way merge', () => {
      const sourceRef = {
        conversation_id: 'conv_1',
        turn_hash: 'sha256:abc',
        start_char: 0,
        end_char: 20,
      };

      const base = [{ id: 'b1', text: 'With ref', source_ref: sourceRef }];
      const source = [{ id: 's1', text: 'With ref', source_ref: sourceRef }];
      const target = [{ id: 't1', text: 'With ref', source_ref: sourceRef }];

      const result = prepareThreeWayMerge(base, source, target);

      expect(result.unchanged).toHaveLength(1);
      // source_ref is preserved on the unchanged sentence
      expect(result.unchanged[0].source_ref).toBeDefined();
    });
  });
});

// ============================================================================
// executeThreeWayMerge Tests
// ============================================================================

describe('executeThreeWayMerge', () => {
  // -------------------------------------------------------------------------
  // Basic execution
  // -------------------------------------------------------------------------
  describe('basic execution', () => {
    it('creates CommitV4 with correct schema and parents', () => {
      const result = prepareThreeWayMerge(
        [sent('b1', 'Same text')],
        [sent('s1', 'Same text')],
        [sent('t1', 'Same text')]
      );

      const commit = executeThreeWayMerge(
        result,
        'sha256:src',
        'sha256:tgt',
        author,
        'Three-way merge',
        projectId
      );

      expect(commit.schema).toBe('t3x/commit/v4');
      expect(commit.parents).toEqual(['sha256:src', 'sha256:tgt']);
      expect(commit.author).toEqual(author);
      expect(commit.message).toBe('Three-way merge');
      expect(commit.project_id).toBe(projectId);
      expect(commit.hash).toMatch(/^sha256:/);
    });

    it('includes unchanged and auto-merged sentences', () => {
      const result = prepareThreeWayMerge(
        [sent('b1', 'Unchanged text'), sent('b2', 'Budget is $3000 for the project')],
        [sent('s1', 'Unchanged text'), sent('s2', 'Budget is $3500 for the project')],
        [sent('t1', 'Unchanged text'), sent('t2', 'Budget is $3000 for the project')]
      );

      const commit = executeThreeWayMerge(
        result,
        'sha256:src',
        'sha256:tgt',
        author,
        'Merge',
        projectId
      );

      const texts = commit.content.sentences.map((s) => s.text);
      expect(texts).toContain('Unchanged text');
      expect(texts).toContain('Budget is $3500 for the project');
      expect(commit.content.sentences).toHaveLength(2);
    });

    it('generates deterministic s_ prefixed IDs', () => {
      const result = prepareThreeWayMerge(
        [sent('b1', 'Test')],
        [sent('s1', 'Test')],
        [sent('t1', 'Test')]
      );

      const commit = executeThreeWayMerge(
        result,
        'sha256:src',
        'sha256:tgt',
        author,
        'Merge',
        projectId
      );

      expect(commit.content.sentences[0].id).toMatch(/^s_[a-f0-9]{12}$/);
    });
  });

  // -------------------------------------------------------------------------
  // Conflict resolution
  // -------------------------------------------------------------------------
  describe('conflict resolution', () => {
    it('throws on unresolved conflict', () => {
      const result = prepareThreeWayMerge(
        [sent('b1', 'Budget is $3000 for the project')],
        [sent('s1', 'Budget is $3500 for the project')],
        [sent('t1', 'Budget is $4000 for the project')]
      );

      expect(() =>
        executeThreeWayMerge(result, 'sha256:src', 'sha256:tgt', author, 'Merge', projectId)
      ).toThrow('Unresolved conflict');
    });

    it('includes source sentence when conflict resolved as source', () => {
      const result = prepareThreeWayMerge(
        [sent('b1', 'Budget is $3000 for the project')],
        [sent('s1', 'Budget is $3500 for the project')],
        [sent('t1', 'Budget is $4000 for the project')]
      );
      result.conflicts[0].resolution = 'source';

      const commit = executeThreeWayMerge(
        result,
        'sha256:src',
        'sha256:tgt',
        author,
        'Merge',
        projectId
      );

      expect(commit.content.sentences[0].text).toBe('Budget is $3500 for the project');
    });

    it('includes target sentence when conflict resolved as target', () => {
      const result = prepareThreeWayMerge(
        [sent('b1', 'Budget is $3000 for the project')],
        [sent('s1', 'Budget is $3500 for the project')],
        [sent('t1', 'Budget is $4000 for the project')]
      );
      result.conflicts[0].resolution = 'target';

      const commit = executeThreeWayMerge(
        result,
        'sha256:src',
        'sha256:tgt',
        author,
        'Merge',
        projectId
      );

      expect(commit.content.sentences[0].text).toBe('Budget is $4000 for the project');
    });

    it('includes both sentences when conflict resolved as both', () => {
      const result = prepareThreeWayMerge(
        [sent('b1', 'Budget is $3000 for the project')],
        [sent('s1', 'Budget is $3500 for the project')],
        [sent('t1', 'Budget is $4000 for the project')]
      );
      result.conflicts[0].resolution = 'both';

      const commit = executeThreeWayMerge(
        result,
        'sha256:src',
        'sha256:tgt',
        author,
        'Merge',
        projectId
      );

      const texts = commit.content.sentences.map((s) => s.text);
      expect(texts).toContain('Budget is $3500 for the project');
      expect(texts).toContain('Budget is $4000 for the project');
      expect(commit.content.sentences).toHaveLength(2);
    });

    it('uses editedText when conflict resolved as edit', () => {
      const result = prepareThreeWayMerge(
        [sent('b1', 'Budget is $3000 for the project')],
        [sent('s1', 'Budget is $3500 for the project')],
        [sent('t1', 'Budget is $4000 for the project')]
      );
      result.conflicts[0].resolution = 'edit';
      result.conflicts[0].editedText = 'Budget is $3750 for the project';

      const commit = executeThreeWayMerge(
        result,
        'sha256:src',
        'sha256:tgt',
        author,
        'Merge',
        projectId
      );

      expect(commit.content.sentences[0].text).toBe('Budget is $3750 for the project');
    });

    it('throws when edit resolution has no editedText', () => {
      const result = prepareThreeWayMerge(
        [sent('b1', 'Budget is $3000 for the project')],
        [sent('s1', 'Budget is $3500 for the project')],
        [sent('t1', 'Budget is $4000 for the project')]
      );
      result.conflicts[0].resolution = 'edit';
      // No editedText set

      expect(() =>
        executeThreeWayMerge(result, 'sha256:src', 'sha256:tgt', author, 'Merge', projectId)
      ).toThrow('no editedText provided');
    });

    it('handles delete_vs_modify conflict resolved as source (delete)', () => {
      const base = [sent('b1', 'The quick brown fox jumps over the lazy dog')];
      const source: DiffableSentence[] = []; // deleted
      const target = [sent('t1', 'The quick brown fox leaps over the lazy dog')];

      const result = prepareThreeWayMerge(base, source, target);
      result.conflicts[0].resolution = 'source'; // Keep deletion

      const commit = executeThreeWayMerge(
        result,
        'sha256:src',
        'sha256:tgt',
        author,
        'Merge',
        projectId
      );

      // source is null (deleted), so no sentence is added
      expect(commit.content.sentences).toHaveLength(0);
    });

    it('handles delete_vs_modify conflict resolved as target (keep modified)', () => {
      const base = [sent('b1', 'The quick brown fox jumps over the lazy dog')];
      const source: DiffableSentence[] = []; // deleted
      const target = [sent('t1', 'The quick brown fox leaps over the lazy dog')];

      const result = prepareThreeWayMerge(base, source, target);
      result.conflicts[0].resolution = 'target'; // Keep modified version

      const commit = executeThreeWayMerge(
        result,
        'sha256:src',
        'sha256:tgt',
        author,
        'Merge',
        projectId
      );

      expect(commit.content.sentences).toHaveLength(1);
      expect(commit.content.sentences[0].text).toBe('The quick brown fox leaps over the lazy dog');
    });
  });

  // -------------------------------------------------------------------------
  // Additions in execute
  // -------------------------------------------------------------------------
  describe('additions', () => {
    it('includes additions from both sides in the merged commit', () => {
      const base = [sent('b1', 'Original sentence')];
      const source = [sent('s1', 'Original sentence'), sent('s2', 'Added by source')];
      const target = [sent('t1', 'Original sentence'), sent('t2', 'Added by target')];

      const result = prepareThreeWayMerge(base, source, target);
      const commit = executeThreeWayMerge(
        result,
        'sha256:src',
        'sha256:tgt',
        author,
        'Merge',
        projectId
      );

      const texts = commit.content.sentences.map((s) => s.text);
      expect(texts).toContain('Original sentence');
      expect(texts).toContain('Added by source');
      expect(texts).toContain('Added by target');
    });
  });

  // -------------------------------------------------------------------------
  // source_ref preservation
  // -------------------------------------------------------------------------
  describe('source_ref preservation', () => {
    it('preserves source_ref through three-way merge', () => {
      const sourceRef = {
        conversation_id: 'conv_1',
        turn_hash: 'sha256:abc',
        start_char: 0,
        end_char: 10,
      };

      const base = [{ id: 'b1', text: 'With ref', source_ref: sourceRef }];
      const source = [{ id: 's1', text: 'With ref', source_ref: sourceRef }];
      const target = [{ id: 't1', text: 'With ref', source_ref: sourceRef }];

      const result = prepareThreeWayMerge(base, source, target);
      const commit = executeThreeWayMerge(
        result,
        'sha256:src',
        'sha256:tgt',
        author,
        'Merge',
        projectId
      );

      expect(commit.content.sentences[0].source_ref).toEqual(sourceRef);
    });
  });

  // -------------------------------------------------------------------------
  // Full three-way merge end-to-end
  // -------------------------------------------------------------------------
  describe('end-to-end', () => {
    it('clean merge produces expected output', () => {
      const base = [
        sent('b1', 'Budget is $3000 allocated'),
        sent('b2', 'Meeting on Monday morning'),
      ];
      const source = [
        sent('s1', 'Budget is $3500 allocated'),
        sent('s2', 'Meeting on Monday morning'),
      ];
      const target = [
        sent('t1', 'Budget is $3000 allocated'),
        sent('t2', 'Meeting on Tuesday morning'),
      ];

      const result = prepareThreeWayMerge(base, source, target);
      expect(result.status).toBe('clean');

      const commit = executeThreeWayMerge(
        result,
        'sha256:src',
        'sha256:tgt',
        author,
        'Merge branches',
        projectId,
        '2024-01-01T00:00:00.000Z'
      );

      const texts = commit.content.sentences.map((s) => s.text);
      expect(texts).toContain('Budget is $3500 allocated');
      expect(texts).toContain('Meeting on Tuesday morning');
      expect(commit.content.sentences).toHaveLength(2);

      // Verify hash is deterministic
      const commit2 = executeThreeWayMerge(
        result,
        'sha256:src',
        'sha256:tgt',
        author,
        'Merge branches',
        projectId,
        '2024-01-01T00:00:00.000Z'
      );
      expect(commit.hash).toBe(commit2.hash);
    });

    it('V4 commit has no constraints in content', () => {
      const result = prepareThreeWayMerge(
        [sent('b1', 'Test')],
        [sent('s1', 'Test')],
        [sent('t1', 'Test')]
      );

      const commit = executeThreeWayMerge(
        result,
        'sha256:src',
        'sha256:tgt',
        author,
        'Merge',
        projectId
      );

      expect(commit.content).toHaveProperty('sentences');
      expect(commit.content).not.toHaveProperty('constraints');
    });
  });
});

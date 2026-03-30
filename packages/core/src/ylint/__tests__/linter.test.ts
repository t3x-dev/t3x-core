import { describe, expect, it } from 'vitest';
import type { SemanticContent, TreeNode } from '../../semantic/types';
import { DEFAULT_LINT_CONFIG, ylint } from '../linter';

/** Helper to build a SemanticContent with a single tree */
function sc(...trees: TreeNode[]): SemanticContent {
  return { trees, relations: [] };
}

/** Helper to build a simple TreeNode */
function node(
  key: string,
  slots: Record<string, unknown> = {},
  children: TreeNode[] = [],
  extras?: Partial<TreeNode>,
): TreeNode {
  return { key, slots: slots as TreeNode['slots'], children, ...extras };
}

describe('ylint', () => {
  // ── Form 1: Keys Are Nouns ──

  describe('Form 1 — Keys Are Nouns', () => {
    it('passes short noun key', () => {
      const result = ylint(sc(node('budget')));
      const f1Warnings = result.warnings.filter((w) => w.form === 1);
      expect(f1Warnings).toHaveLength(0);
      expect(result.scores.form1).toBe(1.0);
    });

    it('warns key-too-long for 4+ word keys', () => {
      const result = ylint(sc(node('very_long_key_name_here')));
      const w = result.warnings.find((w) => w.rule === 'key-too-long');
      expect(w).toBeDefined();
      expect(w!.form).toBe(1);
      expect(w!.severity).toBe('warn');
    });

    it('warns key-contains-verb when key has a verb', () => {
      const result = ylint(sc(node('get_data')));
      const w = result.warnings.find((w) => w.rule === 'key-contains-verb');
      expect(w).toBeDefined();
      expect(w!.form).toBe(1);
      expect(w!.message).toContain('get');
    });

    it('does NOT trigger verb detection on "settings" (word-boundary aware)', () => {
      const result = ylint(sc(node('settings')));
      const verbWarnings = result.warnings.filter(
        (w) => w.rule === 'key-contains-verb',
      );
      expect(verbWarnings).toHaveLength(0);
    });

    it('does NOT trigger verb detection on "island" (contains "is")', () => {
      const result = ylint(sc(node('island')));
      const verbWarnings = result.warnings.filter(
        (w) => w.rule === 'key-contains-verb',
      );
      expect(verbWarnings).toHaveLength(0);
    });

    it('detects verb in multi-word key', () => {
      const result = ylint(sc(node('should_update')));
      const w = result.warnings.find((w) => w.rule === 'key-contains-verb');
      expect(w).toBeDefined();
      expect(w!.message).toContain('should');
    });
  });

  // ── Form 2: Scalars Are Atomic Facts ──

  describe('Form 2 — Scalars Are Atomic Facts', () => {
    it('passes short string scalar', () => {
      const result = ylint(sc(node('topic', { summary: 'A short fact' })));
      const f2Warnings = result.warnings.filter((w) => w.form === 2);
      expect(f2Warnings).toHaveLength(0);
      expect(result.scores.form2).toBe(1.0);
    });

    it('warns scalar-multi-fact for 3+ comma segments', () => {
      const result = ylint(
        sc(node('topic', { value: 'apples, oranges, bananas' })),
      );
      const w = result.warnings.find((w) => w.rule === 'scalar-multi-fact');
      expect(w).toBeDefined();
      expect(w!.form).toBe(2);
    });

    it('does not warn scalar-multi-fact for 2 comma segments', () => {
      const result = ylint(
        sc(node('topic', { value: 'apples, oranges' })),
      );
      const w = result.warnings.find((w) => w.rule === 'scalar-multi-fact');
      expect(w).toBeUndefined();
    });

    it('warns scalar-compound for " and "', () => {
      const result = ylint(
        sc(node('topic', { value: 'cats and dogs' })),
      );
      const w = result.warnings.find((w) => w.rule === 'scalar-compound');
      expect(w).toBeDefined();
      expect(w!.severity).toBe('info');
    });

    it('warns scalar-compound for " or "', () => {
      const result = ylint(
        sc(node('topic', { value: 'tea or coffee' })),
      );
      const w = result.warnings.find((w) => w.rule === 'scalar-compound');
      expect(w).toBeDefined();
    });

    it('warns scalar-too-long for >100 char strings', () => {
      const longStr = 'x'.repeat(101);
      const result = ylint(sc(node('topic', { value: longStr })));
      const w = result.warnings.find((w) => w.rule === 'scalar-too-long');
      expect(w).toBeDefined();
      expect(w!.form).toBe(2);
    });

    it('exempts slot_quotes values from Form 2 checks', () => {
      const result = ylint(
        sc(
          node(
            'topic',
            { verbatim: 'apples, oranges, bananas, grapes and pears' },
            [],
            { slot_quotes: { verbatim: 'original quote text' } },
          ),
        ),
      );
      const f2Warnings = result.warnings.filter((w) => w.form === 2);
      expect(f2Warnings).toHaveLength(0);
    });

    it('exempts number and boolean scalars', () => {
      const result = ylint(
        sc(node('metrics', { count: 42, active: true })),
      );
      const f2Warnings = result.warnings.filter((w) => w.form === 2);
      expect(f2Warnings).toHaveLength(0);
    });
  });

  // ── Form 3: Lists Are Genuinely Plural ──

  describe('Form 3 — Lists Are Genuinely Plural', () => {
    it('passes list with multiple clean items', () => {
      const result = ylint(
        sc(node('fruits', { items: ['apple', 'banana', 'cherry'] })),
      );
      const f3Warnings = result.warnings.filter((w) => w.form === 3);
      expect(f3Warnings).toHaveLength(0);
      expect(result.scores.form3).toBe(1.0);
    });

    it('warns list-single-item for single-element list', () => {
      const result = ylint(sc(node('fruits', { items: ['apple'] })));
      const w = result.warnings.find((w) => w.rule === 'list-single-item');
      expect(w).toBeDefined();
      expect(w!.severity).toBe('info');
    });

    it('warns list-looks-like-map for item containing ":"', () => {
      const result = ylint(
        sc(node('config', { entries: ['name: John', 'age: 30'] })),
      );
      const w = result.warnings.find((w) => w.rule === 'list-looks-like-map');
      expect(w).toBeDefined();
      expect(w!.form).toBe(3);
    });

    it('warns list-looks-like-map for item containing " is "', () => {
      const result = ylint(
        sc(node('facts', { entries: ['sky is blue', 'grass is green'] })),
      );
      const w = result.warnings.find((w) => w.rule === 'list-looks-like-map');
      expect(w).toBeDefined();
    });

    it('warns list-looks-like-map for item containing "="', () => {
      const result = ylint(
        sc(node('env', { vars: ['DEBUG=true', 'PORT=3000'] })),
      );
      const w = result.warnings.find((w) => w.rule === 'list-looks-like-map');
      expect(w).toBeDefined();
    });
  });

  // ── Form 4: Depth Equals Specificity ──

  describe('Form 4 — Depth Equals Specificity', () => {
    it('passes node at max depth (depth=3 with max_depth=3)', () => {
      // depth 0 -> 1 -> 2 -> 3
      const tree = node('a', {}, [
        node('b', {}, [node('c', {}, [node('d')])]),
      ]);
      const result = ylint(sc(tree));
      const depthWarnings = result.warnings.filter(
        (w) => w.rule === 'depth-exceeded',
      );
      expect(depthWarnings).toHaveLength(0);
    });

    it('warns depth-exceeded at depth 4 (max_depth=3)', () => {
      // depth 0 -> 1 -> 2 -> 3 -> 4
      const tree = node('a', {}, [
        node('b', {}, [node('c', {}, [node('d', {}, [node('e')])])]),
      ]);
      const result = ylint(sc(tree));
      const w = result.warnings.find((w) => w.rule === 'depth-exceeded');
      expect(w).toBeDefined();
      expect(w!.path).toBe('a.b.c.d.e');
    });

    it('warns single-child-chain', () => {
      // Root has 1 tree, that tree has 1 child, that child has 1 child
      // The middle node (b) has 1 child and its parent (a) has 1 child => chain
      const tree = node('a', {}, [node('b', {}, [node('c')])]);
      const result = ylint(sc(tree));
      const w = result.warnings.find(
        (w) => w.rule === 'single-child-chain',
      );
      expect(w).toBeDefined();
      // Both 'a' and 'a.b' form single-child chains; first match is 'a'
      expect(w!.path).toBe('a');
    });

    it('does NOT warn single-child-chain when node has siblings', () => {
      const tree = node('a', {}, [
        node('b', {}, [node('d')]),
        node('c'),
      ]);
      const result = ylint(sc(tree));
      const chainWarnings = result.warnings.filter(
        (w) => w.rule === 'single-child-chain',
      );
      expect(chainWarnings).toHaveLength(0);
    });

    it('warns generic-container-key', () => {
      const result = ylint(sc(node('details')));
      const w = result.warnings.find(
        (w) => w.rule === 'generic-container-key',
      );
      expect(w).toBeDefined();
      expect(w!.severity).toBe('warn');
    });

    it('warns generic-container-key for "misc"', () => {
      const result = ylint(sc(node('misc')));
      const w = result.warnings.find(
        (w) => w.rule === 'generic-container-key',
      );
      expect(w).toBeDefined();
    });
  });

  // ── Integration Tests ──

  describe('Integration', () => {
    it('clean tree returns score 1.0', () => {
      const tree = node('budget', { amount: 'fifty thousand' }, [
        node('allocation', { category: 'marketing' }),
        node('timeline', { quarter: 'Q3' }),
      ]);
      const result = ylint(sc(tree));
      expect(result.warnings).toHaveLength(0);
      expect(result.scores.form1).toBe(1.0);
      expect(result.scores.form2).toBe(1.0);
      expect(result.scores.form3).toBe(1.0);
      expect(result.scores.form4).toBe(1.0);
      expect(result.overall).toBe(1.0);
    });

    it('tree with many violations has low score', () => {
      const tree = node(
        'get_all_the_various_data_items',
        {
          long_value: 'x'.repeat(150),
          compound: 'cats and dogs, fish, birds, lizards',
          solo: ['only one'],
          kvlist: ['key: value', 'name: test'],
        },
        [
          node('details', {}, [
            node('info', {}, [
              node('misc', {}, [node('stuff')]),
            ]),
          ]),
        ],
      );
      const result = ylint(sc(tree));
      expect(result.warnings.length).toBeGreaterThan(5);
      expect(result.overall).toBeLessThan(0.5);
    });

    it('disabled forms are not checked', () => {
      const tree = node('get_data', {
        value: 'a very long string that is compound and has commas, lots, of, them',
      });
      const result = ylint(sc(tree), { enabled_forms: [3, 4] });
      const f1Warnings = result.warnings.filter((w) => w.form === 1);
      const f2Warnings = result.warnings.filter((w) => w.form === 2);
      expect(f1Warnings).toHaveLength(0);
      expect(f2Warnings).toHaveLength(0);
      // Disabled form scores default to 1.0
      expect(result.scores.form1).toBe(1.0);
      expect(result.scores.form2).toBe(1.0);
    });

    it('custom config overrides defaults', () => {
      // With max_key_words=5, a 4-word key should pass
      const result = ylint(sc(node('one_two_three_four')), {
        max_key_words: 5,
      });
      const w = result.warnings.find((w) => w.rule === 'key-too-long');
      expect(w).toBeUndefined();
    });

    it('empty tree returns score 1.0', () => {
      const result = ylint({ trees: [], relations: [] });
      expect(result.warnings).toHaveLength(0);
      expect(result.overall).toBe(1.0);
    });
  });

  // ── Score Tests ──

  describe('Scores', () => {
    it('scores are between 0 and 1', () => {
      const tree = node('get_data', {
        value: 'apples, oranges, bananas and grapes',
      });
      const result = ylint(sc(tree));
      expect(result.scores.form1).toBeGreaterThanOrEqual(0);
      expect(result.scores.form1).toBeLessThanOrEqual(1);
      expect(result.scores.form2).toBeGreaterThanOrEqual(0);
      expect(result.scores.form2).toBeLessThanOrEqual(1);
      expect(result.scores.form3).toBeGreaterThanOrEqual(0);
      expect(result.scores.form3).toBeLessThanOrEqual(1);
      expect(result.scores.form4).toBeGreaterThanOrEqual(0);
      expect(result.scores.form4).toBeLessThanOrEqual(1);
      expect(result.overall).toBeGreaterThanOrEqual(0);
      expect(result.overall).toBeLessThanOrEqual(1);
    });

    it('overall is average of enabled form scores', () => {
      const tree = node('budget', { amount: 'fifty' });
      const result = ylint(sc(tree), { enabled_forms: [1, 2] });
      const expected = (result.scores.form1 + result.scores.form2) / 2;
      expect(result.overall).toBeCloseTo(expected, 10);
    });
  });

  // ── DEFAULT_LINT_CONFIG ──

  describe('DEFAULT_LINT_CONFIG', () => {
    it('has all expected defaults', () => {
      expect(DEFAULT_LINT_CONFIG.max_key_words).toBe(3);
      expect(DEFAULT_LINT_CONFIG.max_scalar_length).toBe(100);
      expect(DEFAULT_LINT_CONFIG.max_depth).toBe(3);
      expect(DEFAULT_LINT_CONFIG.enabled_forms).toEqual([1, 2, 3, 4]);
      expect(DEFAULT_LINT_CONFIG.generic_keys).toContain('details');
      expect(DEFAULT_LINT_CONFIG.verb_list).toContain('is');
    });
  });
});

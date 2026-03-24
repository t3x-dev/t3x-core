/**
 * Export Utilities Tests
 *
 * Tests for leaf data export functions.
 * Note: Browser-dependent functions (copyToClipboard, downloadAsFile) are tested
 * through integration tests as they require JSDOM environment.
 */

import { describe, expect, it } from 'vitest';
import type { Assertion, Constraint, Leaf } from '@/lib/api';
import { formatLeafAsJSON, formatLeafAsJSONString, formatLeafAsMarkdown } from '@/lib/export';

describe('Export Utilities', () => {
  // Sample test data
  const sampleLeaf: Leaf = {
    id: 'leaf_test123',
    project_id: 'proj_abc',
    commit_hash: 'sha256:abc123def456',
    type: 'tweet',
    title: 'Test Tweet',
    output: 'This is the generated tweet content.',
    config: { max_tokens: 280 },
    constraints: [
      {
        id: 'cst_1',
        type: 'require',
        match_mode: 'exact',
        value: 'important keyword',
        description: 'Must include this keyword',
      } as Constraint,
      {
        id: 'cst_2',
        type: 'exclude',
        match_mode: 'semantic',
        value: 'forbidden phrase',
        reason: 'Brand guideline violation',
      } as Constraint,
    ],
    assertions: [
      {
        id: 'ast_1',
        constraint_id: 'cst_1',
        passed: true,
        details: 'Keyword found in output',
      } as Assertion,
      {
        id: 'ast_2',
        constraint_id: 'cst_2',
        passed: false,
        details: 'Forbidden phrase detected',
        lesson: 'Avoid using this phrase',
      } as Assertion,
    ],
    runner_assertions: null,
    generated_at: '2025-01-15T10:00:00.000Z',
    created_at: '2025-01-15T09:00:00.000Z',
    created_by: null,
  };

  const leafWithoutOutput: Leaf = {
    ...sampleLeaf,
    id: 'leaf_no_output',
    output: null,
    assertions: null,
  };

  describe('formatLeafAsMarkdown', () => {
    it('formats leaf with all fields', () => {
      const markdown = formatLeafAsMarkdown(sampleLeaf);

      // Check title
      expect(markdown).toContain('# Test Tweet');

      // Check metadata
      expect(markdown).toContain('**Type:** tweet');
      expect(markdown).toContain('**Commit:** `sha256:abc123def456`');

      // Check constraints sections
      expect(markdown).toContain('## Constraints');
      expect(markdown).toContain('### Must Have (1)');
      expect(markdown).toContain('### Must Not Have (1)');
      expect(markdown).toContain('important keyword');
      expect(markdown).toContain('forbidden phrase');
      expect(markdown).toContain('Brand guideline violation');

      // Check output
      expect(markdown).toContain('## Output');
      expect(markdown).toContain('This is the generated tweet content.');

      // Check validation results
      expect(markdown).toContain('## Validation Results');
      expect(markdown).toContain('1 Failed');
      expect(markdown).toContain('✅ **important keyword**');
      expect(markdown).toContain('❌ **forbidden phrase**');
      expect(markdown).toContain('Lesson: Avoid using this phrase');
    });

    it('formats leaf without output', () => {
      const markdown = formatLeafAsMarkdown(leafWithoutOutput);

      expect(markdown).toContain('*No output generated yet.*');
      expect(markdown).not.toContain('## Validation Results');
    });

    it('uses leaf ID as title when title is missing', () => {
      const leafNoTitle = { ...sampleLeaf, title: null };
      const markdown = formatLeafAsMarkdown(leafNoTitle);

      expect(markdown).toContain('# Leaf: leaf_test123');
    });

    it('includes footer with export timestamp', () => {
      const markdown = formatLeafAsMarkdown(sampleLeaf);

      expect(markdown).toContain('---');
      expect(markdown).toContain('*Exported from T3X on');
    });

    it('shows all passed status when all assertions pass', () => {
      const allPassedLeaf: Leaf = {
        ...sampleLeaf,
        assertions: [
          {
            id: 'ast_1',
            constraint_id: 'cst_1',
            passed: true,
            details: 'Passed',
          } as Assertion,
        ],
      };
      const markdown = formatLeafAsMarkdown(allPassedLeaf);

      expect(markdown).toContain('✅ All Passed');
    });

    it('handles leaf with no constraints', () => {
      const leafNoConstraints: Leaf = {
        ...sampleLeaf,
        constraints: [],
        assertions: [],
      };
      const markdown = formatLeafAsMarkdown(leafNoConstraints);

      expect(markdown).not.toContain('## Constraints');
      expect(markdown).not.toContain('## Validation Results');
    });

    it('shows correct pass/fail counts', () => {
      const markdown = formatLeafAsMarkdown(sampleLeaf);

      // 1 passed, 1 failed out of 2
      expect(markdown).toContain('1/2 passed');
    });

    it('includes constraint descriptions and reasons', () => {
      const markdown = formatLeafAsMarkdown(sampleLeaf);

      expect(markdown).toContain('Must include this keyword');
      expect(markdown).toContain('Reason: Brand guideline violation');
    });

    it('shows constraint match mode', () => {
      const markdown = formatLeafAsMarkdown(sampleLeaf);

      expect(markdown).toContain('(exact)');
      expect(markdown).toContain('(semantic)');
    });
  });

  describe('formatLeafAsJSON', () => {
    it('returns correct structure', () => {
      const json = formatLeafAsJSON(sampleLeaf);

      expect(json.leaf).toEqual(sampleLeaf);
      expect(json.source.commit_hash).toBe('sha256:abc123def456');
      expect(json.source.project_id).toBe('proj_abc');
      expect(json.exported_at).toBeDefined();
    });

    it('includes valid ISO timestamp', () => {
      const json = formatLeafAsJSON(sampleLeaf);

      const timestamp = new Date(json.exported_at);
      expect(timestamp.toISOString()).toBe(json.exported_at);
    });

    it('preserves all leaf fields', () => {
      const json = formatLeafAsJSON(sampleLeaf);

      expect(json.leaf.id).toBe('leaf_test123');
      expect(json.leaf.type).toBe('tweet');
      expect(json.leaf.title).toBe('Test Tweet');
      expect(json.leaf.output).toBe('This is the generated tweet content.');
      expect(json.leaf.constraints).toHaveLength(2);
      expect(json.leaf.assertions).toHaveLength(2);
    });
  });

  describe('formatLeafAsJSONString', () => {
    it('returns pretty-printed JSON', () => {
      const jsonString = formatLeafAsJSONString(sampleLeaf);

      // Should be valid JSON
      const parsed = JSON.parse(jsonString);
      expect(parsed.leaf.id).toBe('leaf_test123');

      // Should be pretty-printed (contains newlines and indentation)
      expect(jsonString).toContain('\n');
      expect(jsonString).toContain('  ');
    });

    it('can be parsed back to original structure', () => {
      const jsonString = formatLeafAsJSONString(sampleLeaf);
      const parsed = JSON.parse(jsonString);

      expect(parsed.leaf).toEqual(sampleLeaf);
      expect(parsed.source.commit_hash).toBe(sampleLeaf.commit_hash);
      expect(parsed.source.project_id).toBe(sampleLeaf.project_id);
    });

    it('handles special characters in content', () => {
      const leafWithSpecialChars: Leaf = {
        ...sampleLeaf,
        output: 'Content with "quotes" and \n newlines and emoji 🎉',
      };
      const jsonString = formatLeafAsJSONString(leafWithSpecialChars);

      // Should be valid JSON
      const parsed = JSON.parse(jsonString);
      expect(parsed.leaf.output).toBe('Content with "quotes" and \n newlines and emoji 🎉');
    });

    it('handles null output', () => {
      const jsonString = formatLeafAsJSONString(leafWithoutOutput);
      const parsed = JSON.parse(jsonString);

      expect(parsed.leaf.output).toBeNull();
    });
  });
});

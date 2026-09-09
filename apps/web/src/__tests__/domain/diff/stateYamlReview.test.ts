import type { SemanticContent } from '@t3x-dev/core';
import { describe, expect, it } from 'vitest';
import { buildStateYamlReview, stateYamlLinePaths } from '@/domain/diff/stateYamlReview';

const content = (slots: Record<string, unknown>) =>
  ({
    trees: [{ key: 'prd', slots, children: [] }],
    relations: [],
  }) as SemanticContent;

describe('State YAML review', () => {
  it('maps repeated field names to their full path', () => {
    expect(stateYamlLinePaths('prd:\n  title: Root\n  summary:\n    title: Child')).toEqual([
      'prd',
      'prd/title',
      'prd/summary',
      'prd/summary/title',
    ]);
  });
  it('maps quoted keys, multiline values and sequence entries', () => {
    expect(
      stateYamlLinePaths(
        'prd:\n  "a: b": |\n    first\n    second\n  items:\n    - title: Entry\n      done: true'
      )
    ).toEqual([
      'prd',
      'prd/a: b',
      'prd/a: b',
      'prd/a: b',
      'prd/items',
      'prd/items/0/title',
      'prd/items/0/done',
    ]);
  });
  it('retains both the old and new value and unchanged context', () => {
    const lines = buildStateYamlReview(
      content({ title: 'Same', outcome: 'Old' }),
      content({ title: 'Same', outcome: 'New' })
    );
    expect(lines).toContainEqual({ text: '  title: Same', path: 'prd/title', kind: 'unchanged' });
    expect(lines).toContainEqual({ text: '  outcome: Old', path: 'prd/outcome', kind: 'removed' });
    expect(lines).toContainEqual({ text: '  outcome: New', path: 'prd/outcome', kind: 'added' });
  });
  it('retains paths of removed fields and added empty values', () => {
    const lines = buildStateYamlReview(
      content({ obsolete: { title: 'Gone' } }),
      content({ acceptance: [] })
    );
    expect(lines).toContainEqual({
      text: '    title: Gone',
      path: 'prd/obsolete/title',
      kind: 'removed',
    });
    expect(lines).toContainEqual({
      text: '  acceptance: []',
      path: 'prd/acceptance',
      kind: 'added',
    });
  });
  it('does not confuse an identical value moved into a different node', () => {
    const lines = buildStateYamlReview(
      content({ a: { title: 'Same' } }),
      content({ b: { title: 'Same' } })
    );
    expect(lines.filter((line) => line.text.includes('title:'))).toEqual([
      { text: '    title: Same', path: 'prd/a/title', kind: 'removed' },
      { text: '    title: Same', path: 'prd/b/title', kind: 'added' },
    ]);
  });
});

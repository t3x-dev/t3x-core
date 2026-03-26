import { describe, expect, it } from 'vitest';
import type { SemanticContent } from '../../semantic/types';
import { checkRelationSanity } from '../../semantic/validate';

describe('checkRelationSanity', () => {
  it('should warn on contrasts between nodes of the same type (key)', () => {
    // Two children with the same key "preference" under different parent trees
    const content: SemanticContent = {
      trees: [
        {
          key: 'topic_a',
          slots: { a: 1 },
          children: [{ key: 'preference', slots: { value: 'coffee' }, children: [] }],
        },
        {
          key: 'topic_b',
          slots: { b: 1 },
          children: [{ key: 'preference', slots: { value: 'tea' }, children: [] }],
        },
      ],
      relations: [{ from: 'topic_a/preference', to: 'topic_b/preference', type: 'contrasts' }],
    };

    const warnings = checkRelationSanity(content);
    expect(warnings).toHaveLength(1);
    expect(warnings[0].type).toBe('same_type_contrast');
    expect(warnings[0].message).toContain('same type preference');
    expect(warnings[0].location).toBe('topic_a/preference->topic_b/preference');
  });

  it('should warn when contrasts and causes exist between the same pair', () => {
    const content: SemanticContent = {
      trees: [
        { key: 'event', slots: { name: 'rain' }, children: [] },
        { key: 'outcome', slots: { name: 'flood' }, children: [] },
      ],
      relations: [
        { from: 'event', to: 'outcome', type: 'contrasts' },
        { from: 'event', to: 'outcome', type: 'causes' },
      ],
    };

    const warnings = checkRelationSanity(content);
    const conflictWarning = warnings.find((w) => w.message.includes('Both contrasts and causes'));
    expect(conflictWarning).toBeDefined();
    expect(conflictWarning!.location).toBe('event->outcome');
  });

  it('should return no warnings for normal relations', () => {
    const content: SemanticContent = {
      trees: [
        { key: 'event', slots: { name: 'rain' }, children: [] },
        { key: 'outcome', slots: { name: 'flood' }, children: [] },
        { key: 'preference', slots: { value: 'umbrella' }, children: [] },
      ],
      relations: [
        { from: 'event', to: 'outcome', type: 'causes' },
        { from: 'outcome', to: 'preference', type: 'conditions' },
      ],
    };

    const warnings = checkRelationSanity(content);
    expect(warnings).toHaveLength(0);
  });

  it('should return no warnings for empty relations', () => {
    const content: SemanticContent = {
      trees: [{ key: 'event', slots: { name: 'test' }, children: [] }],
      relations: [],
    };

    const warnings = checkRelationSanity(content);
    expect(warnings).toHaveLength(0);
  });
});

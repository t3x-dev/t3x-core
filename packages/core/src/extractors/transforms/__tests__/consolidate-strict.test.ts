import { parseSchema } from '@t3x-dev/yschema';
import { describe, expect, it } from 'vitest';
import type { SemanticContent } from '../../../semantic/types';
import { consolidate } from '../consolidate';

const strictSchema = parseSchema(`
name: docker-compose
strict: true
nodes:
  services:
    required: true
    children: any
`);

const nonStrictSchema = parseSchema(`
name: knowledge
nodes:
  topic:
    required: false
`);

function contentWithDuplicates(): SemanticContent {
  return {
    trees: [
      {
        key: 'service',
        id: 'n1',
        slots: { name: 'postgres' },
        children: [],
      },
      {
        key: 'service',
        id: 'n2',
        slots: { name: 'redis' },
        children: [],
      },
    ] as SemanticContent['trees'],
    relations: [],
  };
}

describe('consolidate respects schema.strict', () => {
  it('skips consolidation when schema.strict is true', () => {
    const input = contentWithDuplicates();
    const result = consolidate(input, { schema: strictSchema });
    expect(result).toBe(input);
  });

  it('consolidates duplicates when schema is non-strict', () => {
    const input = contentWithDuplicates();
    const result = consolidate(input, { schema: nonStrictSchema });
    expect(result.trees.length).toBe(1);
    expect(result.trees[0].key).toBe('services');
  });

  it('consolidates when no schema is passed (backwards-compatible)', () => {
    const input = contentWithDuplicates();
    const result = consolidate(input);
    expect(result.trees.length).toBe(1);
    expect(result.trees[0].key).toBe('services');
  });

  it('consolidates when options object has no schema', () => {
    const input = contentWithDuplicates();
    const result = consolidate(input, {});
    expect(result.trees.length).toBe(1);
  });
});

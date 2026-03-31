import { describe, expect, it } from 'vitest';
import { getSemanticContentJsonSchema, getTreeNodeJsonSchema } from '../semantic/jsonSchema';

describe('JSON Schema export', () => {
  it('getSemanticContentJsonSchema returns valid JSON Schema', () => {
    const schema = getSemanticContentJsonSchema();
    expect(schema.$schema).toBe('https://json-schema.org/draft/2020-12/schema');
    expect(schema.type).toBe('object');
    expect(schema.properties).toHaveProperty('trees');
    expect(schema.properties).toHaveProperty('relations');
    expect(schema.$defs).toBeDefined();
  });

  it('getTreeNodeJsonSchema returns valid JSON Schema with $ref recursion', () => {
    const schema = getTreeNodeJsonSchema();
    expect(schema.type).toBe('object');
    expect(schema.properties).toHaveProperty('key');
    expect(schema.properties).toHaveProperty('slots');
    expect(schema.properties).toHaveProperty('children');
  });

  it('output is JSON-serializable', () => {
    const schema = getSemanticContentJsonSchema();
    const json = JSON.stringify(schema);
    expect(() => JSON.parse(json)).not.toThrow();
  });

  it('preserves key constraints', () => {
    const schema = getSemanticContentJsonSchema();
    // trees: min 1, max 1000
    expect(schema.properties.trees.minItems).toBe(1);
    expect(schema.properties.trees.maxItems).toBe(1000);
    // relations: default []
    expect(schema.properties.relations.default).toEqual([]);
    // TreeNode key: has pattern
    const treeDef = Object.values(schema.$defs as Record<string, Record<string, unknown>>)
      .find((def) => def.properties && (def.properties as Record<string, unknown>).key);
    expect(treeDef).toBeDefined();
    expect((treeDef!.properties as Record<string, Record<string, unknown>>).key.pattern).toBeDefined();
  });
});

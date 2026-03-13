import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { zodToJsonSchema } from '../../llm/zodToJsonSchema';

describe('zodToJsonSchema', () => {
  it('converts simple object', () => {
    const schema = z.object({ name: z.string(), age: z.number() });
    const json = zodToJsonSchema(schema);
    expect(json.type).toBe('object');
    expect(json.properties.name).toEqual({ type: 'string' });
    expect(json.properties.age).toEqual({ type: 'number' });
    expect(json.required).toEqual(expect.arrayContaining(['name', 'age']));
  });

  it('handles optional fields', () => {
    const schema = z.object({ name: z.string(), bio: z.string().optional() });
    const json = zodToJsonSchema(schema);
    expect(json.required).toEqual(['name']);
  });

  it('converts enum', () => {
    const schema = z.enum(['add', 'update', 'remove']);
    const json = zodToJsonSchema(schema);
    expect(json.enum).toEqual(['add', 'update', 'remove']);
  });

  it('converts array', () => {
    const schema = z.array(z.string());
    const json = zodToJsonSchema(schema);
    expect(json.type).toBe('array');
    expect(json.items).toEqual({ type: 'string' });
  });

  it('converts boolean', () => {
    const json = zodToJsonSchema(z.boolean());
    expect(json.type).toBe('boolean');
  });

  it('converts record', () => {
    const schema = z.record(z.string(), z.number());
    const json = zodToJsonSchema(schema);
    expect(json.type).toBe('object');
    expect(json.additionalProperties).toEqual({ type: 'number' });
  });

  it('converts literal', () => {
    const json = zodToJsonSchema(z.literal('add'));
    expect(json.const).toBe('add');
  });

  it('converts union to anyOf', () => {
    const schema = z.union([z.string(), z.number()]);
    const json = zodToJsonSchema(schema);
    expect(json.anyOf).toBeDefined();
    expect(json.anyOf).toHaveLength(2);
  });

  it('handles nullable', () => {
    const schema = z.string().nullable();
    const json = zodToJsonSchema(schema);
    expect(json.anyOf).toHaveLength(2);
    expect(json.anyOf[1]).toEqual({ type: 'null' });
  });

  it('handles min/max on number', () => {
    const schema = z.number().min(0).max(1);
    const json = zodToJsonSchema(schema);
    expect(json.minimum).toBe(0);
    expect(json.maximum).toBe(1);
  });

  it('handles min/max on string', () => {
    const schema = z.string().min(1).max(100);
    const json = zodToJsonSchema(schema);
    expect(json.minLength).toBe(1);
    expect(json.maxLength).toBe(100);
  });

  it('handles z.string().email() with format: email', () => {
    const json = zodToJsonSchema(z.string().email());
    expect(json.type).toBe('string');
    expect(json.format).toBe('email');
  });

  it('handles z.number().int() producing integer type', () => {
    const json = zodToJsonSchema(z.number().int());
    expect(json.type).toBe('integer');
  });

  it('handles z.number().gt(0) with exclusiveMinimum', () => {
    const json = zodToJsonSchema(z.number().gt(0));
    expect(json.exclusiveMinimum).toBe(0);
    expect(json.minimum).toBeUndefined();
  });

  it('does not include default fields in required', () => {
    const schema = z.object({ name: z.string(), greeting: z.string().default('hello') });
    const json = zodToJsonSchema(schema);
    expect(json.required).toEqual(['name']);
    expect(json.required).not.toContain('greeting');
  });

  it('handles z.lazy() by resolving the inner schema', () => {
    const json = zodToJsonSchema(z.lazy(() => z.string()));
    expect(json.type).toBe('string');
  });

  it('converts discriminatedUnion to anyOf', () => {
    const schema = z.discriminatedUnion('type', [
      z.object({ type: z.literal('a'), value: z.string() }),
      z.object({ type: z.literal('b'), count: z.number() }),
    ]);
    const json = zodToJsonSchema(schema);
    expect(json.anyOf).toBeDefined();
    expect(json.anyOf).toHaveLength(2);
    expect(json.anyOf[0].type).toBe('object');
    expect(json.anyOf[1].type).toBe('object');
  });
});

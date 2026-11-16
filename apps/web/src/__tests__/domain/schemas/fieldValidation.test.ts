import { describe, expect, it } from 'vitest';
import {
  fieldConstraintCount,
  parseFieldTestValue,
  schemaDefinitionError,
  testSchemaFieldValue,
} from '@/domain/schemas/fieldValidation';

const path = 'event/notes';
const test = (
  definition: Record<string, unknown>,
  value: Parameters<typeof testSchemaFieldValue>[3],
  required = false
) => testSchemaFieldValue(definition, required, path, value);
describe('native field value probe', () => {
  it.each([
    [4, false],
    [5, true],
    [80, true],
    [81, false],
  ])('checks the actual 5–80 length boundary at %s', (length, passed) => {
    const result = test({ type: 'string', minLength: 5, maxLength: 80 }, 'a'.repeat(length));
    expect(result.passed).toBe(passed);
    for (const issue of result.issues) expect(issue.path).toBe(path);
  });
  it('keeps UTF-16 length and whitespace word counts identical to YSchema', () => {
    expect(test({ type: 'string', maxLength: 1 }, '😀').passed).toBe(false);
    expect(test({ type: 'string', maxWords: 1 }, '中文词语').passed).toBe(true);
    expect(test({ type: 'string', maxWords: 1 }, 'two words').passed).toBe(false);
  });
  it('returns multiple failures without turning field success into Workspace readiness', () => {
    const r = test({ type: 'string', minLength: 5, pattern: '^A', enum: ['Allowed'] }, 'no');
    expect(r.issues.map((i) => i.code)).toEqual([
      'INVALID_ENUM',
      'INVALID_LENGTH',
      'INVALID_PATTERN',
    ]);
    expect(r).not.toHaveProperty('ready');
  });
  it('uses list item counts, number bounds, constants and exact JSON enum values', () => {
    expect(test({ type: 'array', minLength: 2, maxLength: 3 }, [0]).passed).toBe(false);
    expect(test({ type: 'array', minLength: 2, maxLength: 3 }, [0, false]).passed).toBe(true);
    expect(test({ type: 'number', minimum: 0, maximum: 1 }, 0).passed).toBe(true);
    expect(test({ type: 'number', minimum: 0, maximum: 1 }, 2).passed).toBe(false);
    expect(test({ type: 'boolean', const: false }, false).passed).toBe(true);
    expect(test({ type: 'object', enum: [{ name: 'a' }] }, { name: 'a' }).passed).toBe(true);
    expect(test({ type: 'object', enum: [{ name: 'a' }] }, { name: 'b' }).passed).toBe(false);
  });
  it('distinguishes missing, empty text, null and wrong types without filling a default', () => {
    expect(test({ type: 'string' }, undefined).passed).toBe(true);
    expect(test({ type: 'string' }, undefined, true).issues[0].code).toBe('REQUIRED_SLOT_MISSING');
    expect(test({ type: 'string', default: 'default' }, undefined, true).issues[0].code).toBe(
      'DEFAULT_REQUIRES_APPROVAL'
    );
    expect(test({ type: 'string' }, '', true).passed).toBe(true);
    expect(test({ type: 'string' }, null).passed).toBe(false);
    expect(test({ type: 'null' }, null).passed).toBe(true);
    expect(test({ type: 'number' }, '1').passed).toBe(false);
  });
  it('reports evidence as requiring context and leaves input and definition untouched', () => {
    const d = { type: 'string', provenanceRequired: true, default: 'default' };
    const before = structuredClone(d);
    const r = test(d, 'text');
    expect(r.passed).toBe(true);
    expect(r.needsEvidence).toBe(true);
    expect(d).toEqual(before);
  });
  it('rejects invalid definitions instead of showing a false success', () => {
    expect(() => test({ type: 'string', pattern: '[' }, 'test')).toThrow();
    expect(() => test({ type: 'string', minLength: 5, maxLength: 3 }, 'test')).toThrow();
    expect(
      schemaDefinitionError({
        yschema: '0.1',
        name: 'test',
        nodes: { item: { slots: { title: { minimum: 2, maximum: 1 } } } },
      })
    ).toBeDefined();
  });
  it('counts actual value constraints, excluding types, required, hints and defaults', () => {
    expect(
      fieldConstraintCount({
        type: 'string',
        minLength: 5,
        maxLength: 80,
        default: '',
        format: 'email',
        provenanceRequired: true,
      })
    ).toBe(2);
  });
  it('parses typed values and rejects malformed, non-finite or oversized JSON', () => {
    expect(parseFieldTestValue('missing', '')).toBeUndefined();
    expect(parseFieldTestValue('null', '')).toBeNull();
    expect(parseFieldTestValue('text', '')).toBe('');
    expect(parseFieldTestValue('number', '0')).toBe(0);
    expect(parseFieldTestValue('boolean', 'false')).toBe(false);
    expect(() => parseFieldTestValue('number', '')).toThrow();
    expect(() => parseFieldTestValue('number', '1e309')).toThrow();
    expect(() => parseFieldTestValue('json', '{')).toThrow();
    expect(() => parseFieldTestValue('json', '[1e309]')).toThrow();
    expect(() => parseFieldTestValue('json', JSON.stringify('x'.repeat(65536)))).toThrow();
    expect(() => parseFieldTestValue('text', 'x'.repeat(65536))).toThrow();
  });
});

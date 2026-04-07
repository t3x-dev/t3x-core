import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseSpec } from '../src/spec';

const yamlStr = readFileSync(join(__dirname, '..', 'yops.yaml'), 'utf8');
const spec = parseSpec(yamlStr);

describe('parseSpec', () => {
  it('parses name and version', () => {
    expect(spec.name).toBe('yops');
    expect(spec.version).toBe('1.0');
  });

  it('parses description', () => {
    expect(spec.description).toBeTruthy();
    expect(typeof spec.description).toBe('string');
  });

  it('parses all 18 operations', () => {
    const ops = Object.keys(spec.operations);
    expect(ops).toHaveLength(18);
  });

  it('parses operation names — define, set, sort, assert all present', () => {
    expect(spec.operations).toHaveProperty('define');
    expect(spec.operations).toHaveProperty('set');
    expect(spec.operations).toHaveProperty('sort');
    expect(spec.operations).toHaveProperty('assert');
  });

  it('parses operation category', () => {
    expect(spec.operations.define.category).toBe('ddl');
    expect(spec.operations.set.category).toBe('dml');
    expect(spec.operations.move.category).toBe('dtl');
    expect(spec.operations.assert.category).toBe('dcl');
  });

  it('parses operation description', () => {
    expect(spec.operations.set.description).toBeTruthy();
  });

  it('parses operation fields — set has path:required:string and value:required:any', () => {
    const fields = spec.operations.set.fields;
    expect(fields.path.type).toBe('string');
    expect(fields.path.required).toBe(true);
    expect(fields.value.type).toBe('any');
    expect(fields.value.required).toBe(true);
  });

  it('parses optional fields — sort has optional by and order with enum', () => {
    const fields = spec.operations.sort.fields;
    expect(fields.by.required).toBe(false);
    expect(fields.order.required).toBe(false);
    expect(fields.order.default).toBe('asc');
    expect(fields.order.enum).toEqual(['asc', 'desc']);
  });

  it('parses assert type field enum', () => {
    const typeField = spec.operations.assert.fields.type;
    expect(typeField.required).toBe(false);
    expect(typeField.enum).toEqual(['mapping', 'sequence', 'scalar']);
  });

  it('parses sequence fields with item_type', () => {
    const keysField = spec.operations.nest.fields.keys;
    expect(keysField.type).toBe('sequence');
    expect(keysField.item_type).toBe('string');
  });

  it('parses error codes — define has PATH_NOT_FOUND and ALREADY_EXISTS', () => {
    expect(spec.operations.define.errors).toContain('PATH_NOT_FOUND');
    expect(spec.operations.define.errors).toContain('ALREADY_EXISTS');
  });

  it('parses rules', () => {
    expect(spec.operations.define.rules.length).toBeGreaterThan(0);
    expect(typeof spec.operations.define.rules[0]).toBe('string');
  });

  it('parses global error catalog — PATH_NOT_FOUND and UNKNOWN_OP present', () => {
    expect(spec.errors).toHaveProperty('PATH_NOT_FOUND');
    expect(spec.errors).toHaveProperty('UNKNOWN_OP');
    expect(spec.errors.PATH_NOT_FOUND.description).toBeTruthy();
  });

  it('parses execution model — sequential, stop, immutable_input:true', () => {
    expect(spec.execution.order).toBe('sequential');
    expect(spec.execution.on_error).toBe('stop');
    expect(spec.execution.immutable_input).toBe(true);
  });

  it('parses idempotent_ops — includes unset and omit', () => {
    expect(spec.execution.idempotent_ops).toContain('unset');
    expect(spec.execution.idempotent_ops).toContain('omit');
  });

  it('parses readonly_ops — includes assert', () => {
    expect(spec.execution.readonly_ops).toContain('assert');
  });

  it('parses strict_ops — includes define', () => {
    expect(spec.execution.strict_ops).toContain('define');
  });

  it('tests array is empty or array for ops without tests', () => {
    // All ops should have a tests array (may be empty)
    for (const op of Object.values(spec.operations)) {
      expect(Array.isArray(op.tests)).toBe(true);
    }
  });
});

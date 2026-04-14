import { describe, expect, it } from 'vitest';
import { parseSchema, validateSchema } from '../src/index';

const schema = parseSchema(`
name: test
nodes:
  services:
    children: any
    each_child:
      slots:
        depends_on:
          type: list
          required: false
rules:
  - id: depends-on-exists
    if: "services/*"
    ref_must_exist:
      slot: depends_on
      in_path: services
    severity: error
`);

describe('ref_must_exist', () => {
  it('passes when every ref points to an existing key', () => {
    const tree = {
      services: {
        a: { depends_on: ['b'] },
        b: {},
      },
    };
    const result = validateSchema(tree, schema);
    expect(result.violations.filter((v) => v.severity === 'error')).toEqual([]);
  });

  it('emits REF_NOT_FOUND when a ref points to a missing key', () => {
    const tree = { services: { a: { depends_on: ['ghost'] } } };
    const result = validateSchema(tree, schema);
    const v = result.violations.find((x) => x.code === 'REF_NOT_FOUND');
    expect(v).toBeDefined();
    expect(v?.message).toMatch(/ghost/);
    expect(v?.path).toBe('services/a');
  });

  it('ignores the rule when the slot is absent', () => {
    const tree = { services: { a: {} } };
    const result = validateSchema(tree, schema);
    const v = result.violations.find((x) => x.code === 'REF_NOT_FOUND');
    expect(v).toBeUndefined();
  });
});

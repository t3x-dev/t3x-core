import { describe, expect, it } from 'vitest';
import { parseSchema, validateSchema } from '../src/index';

const schema = parseSchema(`
name: test
nodes:
  svc:
    slots:
      ports:
        type: list
        item_pattern: "^\\\\d+(:\\\\d+)?$"
`);

describe('item_pattern on list slot', () => {
  it('passes when all items match', () => {
    const result = validateSchema({ svc: { ports: ['80', '443:443'] } }, schema);
    expect(result.violations.filter((v) => v.severity === 'error')).toEqual([]);
  });

  it('emits INVALID_ITEM_PATTERN with the offending index in path', () => {
    const result = validateSchema({ svc: { ports: ['80', 'abc'] } }, schema);
    const v = result.violations.find((x) => x.code === 'INVALID_ITEM_PATTERN');
    expect(v).toBeDefined();
    expect(v?.path).toContain('[1]');
  });

  it('throws at parse time when item_pattern is an invalid regex', () => {
    expect(() =>
      parseSchema(`
name: test
nodes:
  svc:
    slots:
      ports:
        type: list
        item_pattern: "[invalid"
`)
    ).toThrow(/Invalid item_pattern regex/);
  });
});

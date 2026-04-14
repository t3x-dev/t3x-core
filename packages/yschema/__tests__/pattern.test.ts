import { describe, expect, it } from 'vitest';
import { parseSchema, validateSchema } from '../src/index';

const schema = parseSchema(`
name: test
nodes:
  app:
    slots:
      image:
        type: scalar
        required: true
        pattern: "^[^:\\\\s]+:[^\\\\s]+$"
        pattern_message: "must be tagged, e.g. name:tag"
`);

describe('pattern on scalar slot', () => {
  it('passes when value matches', () => {
    const result = validateSchema({ app: { image: 'nginx:1.25' } }, schema);
    expect(result.violations.filter(v => v.severity === 'error')).toEqual([]);
  });

  it('emits INVALID_PATTERN on mismatch', () => {
    const result = validateSchema({ app: { image: 'nginx' } }, schema);
    const codes = result.violations.map(v => v.code);
    expect(codes).toContain('INVALID_PATTERN');
  });

  it('includes pattern_message in the violation message when provided', () => {
    const result = validateSchema({ app: { image: 'nginx' } }, schema);
    const v = result.violations.find(x => x.code === 'INVALID_PATTERN');
    expect(v?.message).toMatch(/must be tagged/);
  });
});

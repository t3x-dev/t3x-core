import { describe, expect, it } from 'vitest';
import { parseSchema, validateSchema } from '../src/index';

const schema = parseSchema(`
name: strict-test
strict: true
nodes:
  services:
    children: any
    each_child:
      slots:
        image:
          type: scalar
          required: true
  volumes:
    children: any
`);

describe('strict mode', () => {
  it('rejects unknown top-level nodes', () => {
    const tree = {
      services: { app: { image: 'nginx:1' } },
      builds: {},
    };
    const result = validateSchema(tree, schema);
    const codes = result.violations.map((v) => v.code);
    expect(codes).toContain('UNEXPECTED_NODE');
  });

  it('rejects unknown slots under each_child services', () => {
    const tree = {
      services: {
        app: { image: 'nginx:1', porst: ['80:80'] },
      },
    };
    const result = validateSchema(tree, schema);
    const v = result.violations.find(
      (x) => x.code === 'UNEXPECTED_SLOT' || x.code === 'UNEXPECTED_NODE'
    );
    expect(v).toBeDefined();
    expect(v?.path).toContain('porst');
  });

  it('accepts only declared keys', () => {
    const tree = { services: { app: { image: 'nginx:1' } } };
    const result = validateSchema(tree, schema);
    expect(result.violations.filter((v) => v.severity === 'error')).toEqual([]);
  });
});

import { describe, expect, it } from 'vitest';
import { formatYOps, parseYOpsYaml } from '../src/format';
import type { YOp } from '../src/types';

const SAMPLE_OPS: YOp[] = [
  { define: { path: 'title' } },
  { set: { path: 'title', value: 'Hello World' } },
  { append: { path: 'tags', value: 'typescript' } },
];

const SAMPLE_YAML = `- define:
    path: title
- set:
    path: title
    value: Hello World
- append:
    path: tags
    value: typescript
`;

describe('parseYOpsYaml', () => {
  it('parses a valid YAML string into YOp[]', () => {
    const result = parseYOpsYaml(SAMPLE_YAML);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.ops).toHaveLength(3);
    expect(result.ops[0]).toEqual({ define: { path: 'title' } });
    expect(result.ops[1]).toEqual({ set: { path: 'title', value: 'Hello World' } });
  });

  it('returns error for invalid YAML syntax', () => {
    const result = parseYOpsYaml('{ unclosed: [');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBeTruthy();
  });

  it('returns error for non-array YAML (plain object)', () => {
    const result = parseYOpsYaml('key: value');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toMatch(/array/i);
  });

  it('returns error for non-array YAML (scalar)', () => {
    const result = parseYOpsYaml('just a string');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toMatch(/array/i);
  });
});

describe('formatYOps', () => {
  it('serializes YOp[] to a YAML string', () => {
    const yaml = formatYOps(SAMPLE_OPS);
    expect(typeof yaml).toBe('string');
    expect(yaml).toContain('define:');
    expect(yaml).toContain('path: title');
    expect(yaml).toContain('Hello World');
  });

  it('round-trips: parse(format(ops)) deepEquals ops', () => {
    const yaml = formatYOps(SAMPLE_OPS);
    const result = parseYOpsYaml(yaml);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.ops).toEqual(SAMPLE_OPS);
  });
});

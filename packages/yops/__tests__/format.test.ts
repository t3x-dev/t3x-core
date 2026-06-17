import { describe, expect, it } from 'vitest';
import { formatYOps, parseYOpsYaml } from '../src/format';
import type { YOp } from '../src/types';

const SAMPLE_OPS: YOp[] = [
  { define: { path: 'title' } },
  { set: { path: 'title', value: 'Hello World' } },
  { append: { path: 'tags', value: 'typescript' } },
];

const SAMPLE_BARE_YAML = `- define:
    path: title
- set:
    path: title
    value: Hello World
- append:
    path: tags
    value: typescript
`;

const SAMPLE_KEYED_YAML = `yops:
  - define:
      path: title
  - set:
      path: title
      value: Hello World
  - append:
      path: tags
      value: typescript
`;

describe('parseYOpsYaml', () => {
  it('parses a bare YAML array into YOp[]', () => {
    const result = parseYOpsYaml(SAMPLE_BARE_YAML);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.ops).toHaveLength(3);
    expect(result.ops[0]).toEqual({ define: { path: 'title' } });
  });

  it('parses the normative { yops: [...] } envelope', () => {
    const result = parseYOpsYaml(SAMPLE_KEYED_YAML);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.ops).toHaveLength(3);
    expect(result.ops[0]).toEqual({ define: { path: 'title' } });
  });

  it('accepts JSON syntax as a YAML declaration', () => {
    const result = parseYOpsYaml('[{ "set": { "path": "feature/enabled", "value": true } }]');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.ops).toEqual([{ set: { path: 'feature/enabled', value: true } }]);
  });

  it('treats on, off, yes, and no as YAML 1.2 strings', () => {
    const result = parseYOpsYaml(`
yops:
  - set: { path: flags/on, value: on }
  - set: { path: flags/off, value: off }
  - set: { path: flags/yes, value: yes }
  - set: { path: flags/no, value: no }
`);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.ops).toEqual([
      { set: { path: 'flags/on', value: 'on' } },
      { set: { path: 'flags/off', value: 'off' } },
      { set: { path: 'flags/yes', value: 'yes' } },
      { set: { path: 'flags/no', value: 'no' } },
    ]);
  });

  it('accepts quoted literal merge-like keys as normal strings', () => {
    const result = parseYOpsYaml(`
yops:
  - set:
      path: feature
      value: { "<<": literal }
`);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.ops).toEqual([{ set: { path: 'feature', value: { '<<': 'literal' } } }]);
  });

  it.each([
    [
      'anchors',
      `
yops:
  - set: &set_payload { path: feature/enabled, value: true }
`,
    ],
    [
      'aliases',
      `
yops:
  - set: &set_payload { path: feature/enabled, value: true }
  - set: *set_payload
`,
    ],
    [
      'merge keys',
      `
yops:
  - set:
      <<: { path: feature/enabled }
      value: true
`,
    ],
    [
      'multiple documents',
      `
---
yops: []
---
yops: []
`,
    ],
  ])('rejects YAML profile feature: %s', (_name, yamlInput) => {
    const result = parseYOpsYaml(yamlInput);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toMatch(/yaml profile|anchor|alias|merge|multiple documents/i);
  });

  it('returns error for invalid YAML syntax', () => {
    const result = parseYOpsYaml('{ unclosed: [');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBeTruthy();
  });

  it('returns error for plain object without a yops key', () => {
    const result = parseYOpsYaml('key: value');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toMatch(/array/i);
  });

  it('returns error when yops key is not an array', () => {
    const result = parseYOpsYaml('yops: not-an-array');
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
  it('serializes YOp[] to a YAML string with the yops envelope', () => {
    const yamlStr = formatYOps(SAMPLE_OPS);
    expect(typeof yamlStr).toBe('string');
    expect(yamlStr.startsWith('yops:')).toBe(true);
    expect(yamlStr).toContain('define:');
    expect(yamlStr).toContain('path: title');
    expect(yamlStr).toContain('Hello World');
  });

  it('round-trips: parse(format(ops)) deepEquals ops', () => {
    const yamlStr = formatYOps(SAMPLE_OPS);
    const result = parseYOpsYaml(yamlStr);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.ops).toEqual(SAMPLE_OPS);
  });
});

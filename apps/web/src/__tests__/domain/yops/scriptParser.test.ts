import type { YOp } from '@t3x-dev/core';
import { describe, expect, it } from 'vitest';
import { opsToYaml, parseYOpsScript } from '@/domain/yops/scriptParser';

describe('parseYOpsScript', () => {
  it('parses valid yops document', () => {
    const text = `yops:\n  - define:\n      parent: ""\n      key: trip`;
    const result = parseYOpsScript(text);
    expect(result.ops).toHaveLength(1);
    expect(result.errors).toHaveLength(0);
  });

  it('returns parse error for invalid YAML', () => {
    const text = 'yops:\n  - define:\n    bad indent';
    const result = parseYOpsScript(text);
    expect(result.ops).toBeNull();
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it('returns error for unknown operation', () => {
    const text = 'yops:\n  - sett:\n      path: foo\n      value: bar';
    const result = parseYOpsScript(text);
    expect(result.ops).toBeNull();
    expect(result.errors[0].message).toContain('sett');
    expect(result.errors[0].message).toContain('set');
  });

  it('returns error for missing yops key', () => {
    const text = 'ops:\n  - define:\n      parent: ""\n      key: trip';
    const result = parseYOpsScript(text);
    expect(result.ops).toBeNull();
    expect(result.errors[0].message).toContain('yops');
  });

  it('handles empty input', () => {
    const result = parseYOpsScript('');
    expect(result.ops).toBeNull();
    expect(result.errors).toHaveLength(0);
  });
});

describe('opsToYaml', () => {
  it('serializes ops to YAML', () => {
    const ops: YOp[] = [{ define: { path: 'trip' } }];
    const yaml = opsToYaml(ops);
    expect(yaml).toContain('yops:');
    expect(yaml).toContain('define:');
    expect(yaml).toContain('trip');
  });

  it('returns empty string for empty ops', () => {
    expect(opsToYaml([])).toBe('');
  });
});

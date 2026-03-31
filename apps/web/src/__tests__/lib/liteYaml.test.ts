import type { SemanticContent } from '@t3x-dev/core';
import { describe, expect, it } from 'vitest';
import { parseDisplayYAML, toDisplayYAML } from '@/lib/liteYaml';

const sampleContent: SemanticContent = {
  trees: [
    {
      key: 'decision_pending',
      slots: { choice: 'launch API', timeline: 'Q2 2026' },
      source: 'sha256:abc',
      confidence: 0.92,
      children: [],
    },
    {
      key: 'target_audience',
      slots: { segment: 'mid-size SaaS', size: '50-500' },
      source: 'sha256:def',
      confidence: 0.88,
      children: [],
    },
  ],
  relations: [{ from: 'target_audience', to: 'decision_pending', type: 'depends' }],
};

describe('toDisplayYAML', () => {
  it('should convert SemanticContent to lite YAML string', () => {
    const yaml = toDisplayYAML(sampleContent);

    expect(yaml).toContain('decision_pending:');
    expect(yaml).toContain('  choice: launch API');
    expect(yaml).toContain('  timeline: Q2 2026');
    expect(yaml).toContain('target_audience:');
    expect(yaml).toContain('target_audience → decision_pending (depends)');
    // Should NOT contain source, confidence
    expect(yaml).not.toContain('sha256');
    expect(yaml).not.toContain('0.92');
  });

  it('should handle duplicate types with suffixes', () => {
    const content: SemanticContent = {
      trees: [
        { key: 'symptom', slots: { desc: 'headache' }, source: '', confidence: 1, children: [] },
        { key: 'symptom_2', slots: { desc: 'nausea' }, source: '', confidence: 1, children: [] },
      ],
      relations: [],
    };
    const yaml = toDisplayYAML(content);
    expect(yaml).toContain('symptom:');
    expect(yaml).toContain('symptom_2:');
  });
});

describe('parseDisplayYAML', () => {
  it('should detect added trees as add YOps', () => {
    const currentContent: SemanticContent = { trees: [], relations: [] };
    const yamlWithNewNode = `new_node:\n  key: "value"\n`;
    const ops = parseDisplayYAML(yamlWithNewNode, currentContent);

    expect(ops.length).toBe(1);
    expect('add' in ops[0]).toBe(true);
    if ('add' in ops[0]) {
      expect(ops[0].add.node).toHaveProperty('new_node');
    }
  });

  it('should detect removed trees as drop YOps', () => {
    const ops = parseDisplayYAML('', sampleContent);

    const drops = ops.filter((op) => 'drop' in op);
    expect(drops.length).toBe(2);
  });
});

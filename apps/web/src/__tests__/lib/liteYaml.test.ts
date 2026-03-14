import type { SemanticContent } from '@t3x-dev/core';
import { describe, expect, it } from 'vitest';
import { parseDisplayYAML, toDisplayYAML } from '@/lib/liteYaml';

const sampleContent: SemanticContent = {
  frames: [
    {
      id: 'f_1',
      type: 'decision_pending',
      slots: { choice: 'launch API', timeline: 'Q2 2026' },
      source: 'sha256:abc',
      confidence: 0.92,
    },
    {
      id: 'f_2',
      type: 'target_audience',
      slots: { segment: 'mid-size SaaS', size: '50-500' },
      source: 'sha256:def',
      confidence: 0.88,
    },
  ],
  relations: [{ from: 'f_2', to: 'f_1', type: 'elaborates' }],
};

describe('toDisplayYAML', () => {
  it('should convert SemanticContent to lite YAML string', () => {
    const yaml = toDisplayYAML(sampleContent);

    expect(yaml).toContain('decision_pending:');
    expect(yaml).toContain('  choice: "launch API"');
    expect(yaml).toContain('  timeline: "Q2 2026"');
    expect(yaml).toContain('target_audience:');
    expect(yaml).toContain('target_audience → decision_pending (elaborates)');
    // Should NOT contain IDs, source, confidence
    expect(yaml).not.toContain('f_1');
    expect(yaml).not.toContain('sha256');
    expect(yaml).not.toContain('0.92');
  });

  it('should handle duplicate types with suffixes', () => {
    const content: SemanticContent = {
      frames: [
        { id: 'f_1', type: 'symptom', slots: { desc: 'headache' }, source: '', confidence: 1 },
        { id: 'f_2', type: 'symptom', slots: { desc: 'nausea' }, source: '', confidence: 1 },
      ],
      relations: [],
    };
    const yaml = toDisplayYAML(content);
    expect(yaml).toContain('symptom:');
    expect(yaml).toContain('symptom_2:');
  });
});

describe('parseDisplayYAML', () => {
  it('should detect added frames as add changes', () => {
    const currentContent: SemanticContent = { frames: [], relations: [] };
    const yamlWithNewFrame = `new_frame:\n  key: "value"\n`;
    const delta = parseDisplayYAML(yamlWithNewFrame, currentContent);

    expect(delta.changes.length).toBe(1);
    expect(delta.changes[0].action).toBe('add');
    if (delta.changes[0].action === 'add') {
      expect(delta.changes[0].frame.type).toBe('new_frame');
    }
  });

  it('should detect removed frames as remove changes', () => {
    const delta = parseDisplayYAML('', sampleContent);

    const removes = delta.changes.filter((c) => c.action === 'remove');
    expect(removes.length).toBe(2);
  });
});

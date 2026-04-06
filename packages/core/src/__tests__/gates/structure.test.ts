import { describe, expect, it } from 'vitest';
import { validateStructure } from '../../ops/gates/structure';
import type { SemanticContent } from '../../semantic/types';

describe('validateStructure', () => {
  it('passes for valid tree', () => {
    const content: SemanticContent = {
      trees: [{ key: 'trip', slots: { destination: 'Tokyo' }, children: [] }],
      relations: [],
    };
    const result = validateStructure(content);
    expect(result.passed).toBe(true);
    expect(result.gate).toBe('structure');
  });

  it('always passes (advisory only) even with issues', () => {
    // Relation referencing non-existent node
    const content: SemanticContent = {
      trees: [{ key: 'trip', slots: {}, children: [] }],
      relations: [{ from: 'trip', to: 'nonexistent', type: 'depends' }],
    };
    const result = validateStructure(content);
    // Structure gate is advisory, so passed is always true
    expect(result.passed).toBe(true);
    // But should produce warnings about the bad relation
    expect(result.violations.some((v) => v.message.includes('nonexistent'))).toBe(true);
    expect(result.violations.every((v) => v.severity === 'warning')).toBe(true);
  });

  it('reports all violations with opIndex -1', () => {
    const content: SemanticContent = {
      trees: [{ key: 'trip', slots: {}, children: [] }],
      relations: [{ from: 'trip', to: 'missing', type: 'causes' }],
    };
    const result = validateStructure(content);
    for (const v of result.violations) {
      expect(v.opIndex).toBe(-1);
      expect(v.gate).toBe('structure');
    }
  });
});

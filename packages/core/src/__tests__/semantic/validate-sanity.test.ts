import { describe, expect, it } from 'vitest';
import type { SemanticContent } from '../../semantic/types';
import { checkRelationSanity } from '../../semantic/validate';

describe('checkRelationSanity', () => {
  it('should warn on contrasts between frames of the same type', () => {
    const content: SemanticContent = {
      frames: [
        { id: 'f_001', type: 'preference', slots: { value: 'coffee' } },
        { id: 'f_002', type: 'preference', slots: { value: 'tea' } },
      ],
      relations: [{ from: 'f_001', to: 'f_002', type: 'contrasts' }],
    };

    const warnings = checkRelationSanity(content);
    expect(warnings).toHaveLength(1);
    expect(warnings[0].type).toBe('same_type_contrast');
    expect(warnings[0].message).toContain('same type preference');
    expect(warnings[0].location).toBe('f_001->f_002');
  });

  it('should warn when contrasts and causes exist between the same pair', () => {
    const content: SemanticContent = {
      frames: [
        { id: 'f_001', type: 'event', slots: { name: 'rain' } },
        { id: 'f_002', type: 'outcome', slots: { name: 'flood' } },
      ],
      relations: [
        { from: 'f_001', to: 'f_002', type: 'contrasts' },
        { from: 'f_001', to: 'f_002', type: 'causes' },
      ],
    };

    const warnings = checkRelationSanity(content);
    const conflictWarning = warnings.find((w) => w.type === 'contrast_causes_conflict');
    expect(conflictWarning).toBeDefined();
    expect(conflictWarning!.message).toContain('Both contrasts and causes');
    expect(conflictWarning!.location).toBe('f_001->f_002');
  });

  it('should return no warnings for normal relations', () => {
    const content: SemanticContent = {
      frames: [
        { id: 'f_001', type: 'event', slots: { name: 'rain' } },
        { id: 'f_002', type: 'outcome', slots: { name: 'flood' } },
        { id: 'f_003', type: 'preference', slots: { value: 'umbrella' } },
      ],
      relations: [
        { from: 'f_001', to: 'f_002', type: 'causes' },
        { from: 'f_002', to: 'f_003', type: 'elaborates' },
      ],
    };

    const warnings = checkRelationSanity(content);
    expect(warnings).toHaveLength(0);
  });

  it('should return no warnings for empty relations', () => {
    const content: SemanticContent = {
      frames: [{ id: 'f_001', type: 'event', slots: { name: 'test' } }],
      relations: [],
    };

    const warnings = checkRelationSanity(content);
    expect(warnings).toHaveLength(0);
  });
});

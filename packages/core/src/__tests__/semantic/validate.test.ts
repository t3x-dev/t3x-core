import { describe, expect, it } from 'vitest';
import type { SemanticContent } from '../../semantic/types';
import { validateIntegrity } from '../../semantic/validate';

const frame = (id: string, slots: Record<string, unknown> = { a: 1 }) => ({
  id,
  type: 'test',
  slots,
});

describe('validateIntegrity', () => {
  it('passes for valid content', () => {
    const content: SemanticContent = {
      frames: [frame('f_001'), frame('f_002')],
      relations: [{ from: 'f_001', to: 'f_002', type: 'causes' }],
    };
    const result = validateIntegrity(content);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('detects duplicate frame ids', () => {
    const content: SemanticContent = {
      frames: [frame('f_001'), frame('f_001')],
      relations: [],
    };
    const result = validateIntegrity(content);
    expect(result.valid).toBe(false);
    expect(result.errors[0].type).toBe('duplicate_id');
  });

  it('detects broken ref in slot', () => {
    const content: SemanticContent = {
      frames: [{ id: 'f_001', type: 'x', slots: { link: { ref: 'f_999' } } }],
      relations: [],
    };
    const result = validateIntegrity(content);
    expect(result.valid).toBe(false);
    expect(result.errors[0].type).toBe('broken_ref');
  });

  it('detects broken relation endpoint', () => {
    const content: SemanticContent = {
      frames: [frame('f_001')],
      relations: [{ from: 'f_001', to: 'f_999', type: 'causes' }],
    };
    const result = validateIntegrity(content);
    expect(result.valid).toBe(false);
    expect(result.errors[0].type).toBe('broken_relation');
  });

  it('detects self-referencing relation', () => {
    const content: SemanticContent = {
      frames: [frame('f_001')],
      relations: [{ from: 'f_001', to: 'f_001', type: 'elaborates' }],
    };
    const result = validateIntegrity(content);
    expect(result.valid).toBe(false);
    expect(result.errors[0].type).toBe('self_relation');
  });

  it('detects causal cycle', () => {
    const content: SemanticContent = {
      frames: [frame('f_001'), frame('f_002'), frame('f_003')],
      relations: [
        { from: 'f_001', to: 'f_002', type: 'causes' },
        { from: 'f_002', to: 'f_003', type: 'causes' },
        { from: 'f_003', to: 'f_001', type: 'causes' },
      ],
    };
    const result = validateIntegrity(content);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.type === 'cycle')).toBe(true);
  });

  it('warns on orphan frame', () => {
    const content: SemanticContent = {
      frames: [frame('f_001'), frame('f_002')],
      relations: [],
    };
    const result = validateIntegrity(content);
    expect(result.valid).toBe(true);
    expect(result.warnings.some((w) => w.type === 'orphan_frame')).toBe(true);
  });

  it('warns on low confidence', () => {
    const content: SemanticContent = {
      frames: [{ id: 'f_001', type: 'x', slots: { a: 1 }, confidence: 0.3 }],
      relations: [],
    };
    const result = validateIntegrity(content);
    expect(result.warnings.some((w) => w.type === 'low_confidence')).toBe(true);
  });

  it('no orphan warning for single frame', () => {
    const content: SemanticContent = {
      frames: [frame('f_001')],
      relations: [],
    };
    const result = validateIntegrity(content);
    expect(result.warnings.filter((w) => w.type === 'orphan_frame')).toHaveLength(0);
  });

  it('detects follows cycle', () => {
    const content: SemanticContent = {
      frames: [frame('f_001'), frame('f_002')],
      relations: [
        { from: 'f_001', to: 'f_002', type: 'follows' },
        { from: 'f_002', to: 'f_001', type: 'follows' },
      ],
    };
    const result = validateIntegrity(content);
    expect(result.errors.some((e) => e.type === 'cycle')).toBe(true);
  });
});

import { describe, expect, it } from 'vitest';
import { deriveSlotTag } from '@/domain/diff/deriveSlotTag';

describe('deriveSlotTag', () => {
  it('returns inherited for unchanged slot with parent', () => {
    expect(deriveSlotTag({ diffType: null, parentMessage: 'Init' })).toEqual({
      kind: 'inherited',
      label: '← Init',
    });
  });

  it('returns new field for added slot', () => {
    expect(deriveSlotTag({ diffType: 'added', parentMessage: 'Init' })).toEqual({
      kind: 'new',
      label: 'New field',
    });
  });

  it('returns modified for changed slot', () => {
    expect(deriveSlotTag({ diffType: 'modified', parentMessage: 'Init' })).toEqual({
      kind: 'modified',
      label: 'Changed',
    });
  });

  it('returns removed for deleted slot', () => {
    expect(deriveSlotTag({ diffType: 'removed', parentMessage: 'Init' })).toEqual({
      kind: 'removed',
      label: 'Removed',
    });
  });

  it('returns new field when no parent exists', () => {
    expect(deriveSlotTag({ diffType: null, parentMessage: null })).toEqual({
      kind: 'new',
      label: 'New field',
    });
  });

  it('truncates long inherited labels', () => {
    const tag = deriveSlotTag({
      diffType: null,
      parentMessage: 'A very long commit message here',
    });
    expect(tag.label.length).toBeLessThanOrEqual(22);
    expect(tag.label).toContain('…');
  });
});

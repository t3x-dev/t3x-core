import { describe, expect, it } from 'vitest';
import { includedImportPinIds } from '@/domain/workspaces/includedImportPinIds';

describe('includedImportPinIds', () => {
  it('returns only import pin IDs in store order', () => {
    expect(
      includedImportPinIds([
        { id: 'pin_commit', type: 'commit' },
        { id: 'pin_import_a', type: 'import' },
        { id: 'pin_conversation', type: 'conversation' },
        { id: 'pin_import_b', type: 'import' },
      ])
    ).toEqual(['pin_import_a', 'pin_import_b']);
  });

  it('returns an empty list when no import pins are included', () => {
    expect(includedImportPinIds([{ id: 'pin_commit', type: 'commit' }])).toEqual([]);
  });
});

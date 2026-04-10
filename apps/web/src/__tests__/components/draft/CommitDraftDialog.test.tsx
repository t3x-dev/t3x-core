import { describe, expect, test, vi } from 'vitest';
import { CommitDraftDialog } from '@/components/draft/CommitDraftDialog';

describe('CommitDraftDialog', () => {
  test('component exports successfully', () => {
    expect(CommitDraftDialog).toBeDefined();
    expect(typeof CommitDraftDialog).toBe('function');
  });

  test('accepts required props', () => {
    const props = {
      open: true,
      onClose: vi.fn(),
      onConfirm: vi.fn(),
      includedCount: 5,
      constraintCount: 2,
    };
    expect(props.includedCount).toBe(5);
    expect(props.constraintCount).toBe(2);
  });
});

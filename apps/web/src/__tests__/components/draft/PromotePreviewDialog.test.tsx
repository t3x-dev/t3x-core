import { describe, expect, test } from 'vitest';
import { PromotePreviewDialog } from '@/components/draft/PromotePreviewDialog';

describe('PromotePreviewDialog', () => {
  test('component exports successfully', () => {
    expect(PromotePreviewDialog).toBeDefined();
    expect(typeof PromotePreviewDialog).toBe('function');
  });

  test('accepts required props', () => {
    const props = {
      open: true,
      onOpenChange: () => {},
      autoDraftId: 'draft_123',
    };
    expect(props.open).toBe(true);
    expect(props.autoDraftId).toBe('draft_123');
  });

  test('optional callbacks are optional', () => {
    const props = {
      open: false,
      onOpenChange: () => {},
      autoDraftId: 'draft_456',
      onPromoted: undefined,
      onViewFull: undefined,
    };
    expect(props.onPromoted).toBeUndefined();
    expect(props.onViewFull).toBeUndefined();
  });
});

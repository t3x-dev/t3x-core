// @vitest-environment jsdom

import { describe, expect, it, vi } from 'vitest';
import { buildUnitNodeMenu } from '@/utils/canvasMenuBuilders';

describe('buildUnitNodeMenu', () => {
  it('exposes Delete for any uncommitted unit when a delete action is supplied', () => {
    const onDelete = vi.fn();

    const groups = buildUnitNodeMenu({
      hasConversation: true,
      isDeveloperMode: false,
      isDraft: false,
      onCreateBranch: vi.fn(),
      onDelete,
    });
    const deleteItem = groups
      .flatMap((group) => group.items)
      .find((item) => item.label === 'Delete');

    expect(deleteItem).toBeDefined();
    deleteItem?.action();
    expect(onDelete).toHaveBeenCalledOnce();
  });
});

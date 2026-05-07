// @vitest-environment jsdom

import { describe, expect, it } from 'vitest';
import { isSelectionPopoverTarget } from '@/hooks/shared/useTextSelection';

describe('useTextSelection', () => {
  it('recognizes clicks inside the selection popover', () => {
    const popover = document.createElement('div');
    popover.setAttribute('data-selection-popover', 'true');
    const button = document.createElement('button');
    popover.appendChild(button);

    expect(isSelectionPopoverTarget(button)).toBe(true);
  });

  it('ignores ordinary page targets', () => {
    expect(isSelectionPopoverTarget(document.createElement('button'))).toBe(false);
    expect(isSelectionPopoverTarget(new EventTarget())).toBe(false);
    expect(isSelectionPopoverTarget(null)).toBe(false);
  });
});

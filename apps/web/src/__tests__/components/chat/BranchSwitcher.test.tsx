// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BranchSwitcher } from '@/components/chat/BranchSwitcher';

const useBranchesMock = vi.fn();

vi.mock('@/hooks/shared/useBranches', () => ({
  useBranches: () => useBranchesMock(),
}));

describe('BranchSwitcher', () => {
  beforeEach(() => {
    Object.defineProperty(window, 'innerWidth', {
      configurable: true,
      value: 1280,
    });
    Object.defineProperty(window, 'innerHeight', {
      configurable: true,
      value: 720,
    });
    useBranchesMock.mockReturnValue({
      branches: ['main', 'feature/very-long-branch-name-that-can-push-header-width'],
      loading: false,
      create: vi.fn(),
    });
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('keeps the branch menu inside the viewport when the trigger is near the right edge', async () => {
    render(<BranchSwitcher projectId="proj_123" activeBranch="main" onBranchChange={vi.fn()} />);

    const trigger = screen.getByRole('button', { name: /main/i });
    vi.spyOn(trigger, 'getBoundingClientRect').mockReturnValue({
      x: 1156,
      y: 20,
      left: 1156,
      right: 1215,
      top: 20,
      bottom: 40,
      width: 59,
      height: 20,
      toJSON: () => ({}),
    });

    fireEvent.click(trigger);

    await waitFor(() => {
      const menu = document.body.querySelector('.fixed') as HTMLElement | null;
      expect(menu).not.toBeNull();
      expect(menu?.style.width).toBe('260px');
      expect(menu?.style.left).toBe('1012px');
    });
  });
});

// @vitest-environment jsdom

import '@testing-library/jest-dom';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const pushMock = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock }),
}));

import { CommandPalette } from '@/components/layout/CommandPalette';

describe('CommandPalette', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    global.ResizeObserver = class ResizeObserver {
      observe() {}
      unobserve() {}
      disconnect() {}
    };
    Element.prototype.scrollIntoView = vi.fn();
  });

  it('opens with executable commands and no placeholder actions', () => {
    render(<CommandPalette projectId="proj_1" />);

    fireEvent.keyDown(document, { key: 'k', metaKey: true });

    expect(screen.getByText('Go to Project Canvas')).toBeInTheDocument();
    expect(screen.getByText('Keyboard Shortcuts')).toBeInTheDocument();
    expect(screen.queryByText('Create Branch')).toBeNull();
    expect(screen.queryByText('Generate Summary')).toBeNull();
  });

  it('runs a selected command and closes the palette', () => {
    render(<CommandPalette projectId="proj_1" />);

    fireEvent.keyDown(document, { key: 'k', metaKey: true });
    fireEvent.click(screen.getByText('Go to Project Canvas'));

    expect(pushMock).toHaveBeenCalledWith('/project/proj_1');
  });
});

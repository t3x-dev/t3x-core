// @vitest-environment jsdom

import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import type React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { projectIdFromPathname, Sidebar } from '@/components/layout/Sidebar';

let mockPathname = '/project/proj_123';
let mockCanvasProjectId: string | null = null;
let mockChatProjectId: string | null = null;

vi.mock('next/navigation', () => ({
  usePathname: () => mockPathname,
}));

vi.mock('next/link', () => ({
  default: ({
    children,
    href,
    ...props
  }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

vi.mock('@/components/layout/UserMenu', () => ({
  UserMenu: () => <div data-testid="user-menu" />,
}));

vi.mock('@/components/ui/tooltip', () => ({
  Tooltip: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  TooltipContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  TooltipProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  TooltipTrigger: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock('@/store/canvasStore', () => ({
  useCanvasStore: (selector: (state: { projectId: string | null }) => unknown) =>
    selector({ projectId: mockCanvasProjectId }),
}));

vi.mock('@/store/chatStore', () => ({
  useChatStore: (selector: (state: { activeProjectId: string | null }) => unknown) =>
    selector({ activeProjectId: mockChatProjectId }),
}));

describe('Sidebar', () => {
  beforeEach(() => {
    mockPathname = '/project/proj_123';
    mockCanvasProjectId = null;
    mockChatProjectId = null;
  });

  it('marks Canvas active across project workspace detail routes', () => {
    mockPathname = '/project/proj_123/leaf/leaf_456';

    render(<Sidebar collapsed={false} onToggle={vi.fn()} />);

    const canvasLink = screen.getByRole('link', { name: /Canvas/i });
    const chatsLink = screen.getByRole('link', { name: /Chats/i });

    expect(canvasLink).toHaveAttribute('href', '/project/proj_123');
    expect(canvasLink).toHaveAttribute('aria-current', 'page');
    expect(chatsLink).not.toHaveAttribute('aria-current');
  });

  it('uses the loaded canvas project as the Canvas destination outside project routes', () => {
    mockPathname = '/settings/preferences';
    mockCanvasProjectId = 'proj_loaded';

    render(<Sidebar collapsed={false} onToggle={vi.fn()} />);

    const canvasLink = screen.getByRole('link', { name: /Canvas/i });
    expect(canvasLink).toHaveAttribute('href', '/project/proj_loaded');
    expect(canvasLink).not.toHaveAttribute('aria-current');
  });
});

describe('projectIdFromPathname', () => {
  it('extracts the project id from canvas-owned routes', () => {
    expect(projectIdFromPathname('/project/proj_abc/commit/sha256%3A123')).toBe('proj_abc');
  });

  it('returns null outside project routes', () => {
    expect(projectIdFromPathname('/chat')).toBeNull();
  });
});

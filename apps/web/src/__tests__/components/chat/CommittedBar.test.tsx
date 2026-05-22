// @vitest-environment jsdom

import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const pushMock = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock }),
}));

import { CommittedBar } from '@/components/chat/CommittedBar';
import { useCommitStore } from '@/store/commitStore';

describe('CommittedBar', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useCommitStore.setState({
      lastCommitHash: 'sha256:parent_commit',
      commitBranch: 'main',
    });
  });

  it('starts a child conversation with both parent commit and project context', () => {
    render(<CommittedBar projectId="proj_1" />);

    fireEvent.click(screen.getByRole('button', { name: /new conversation/i }));

    expect(pushMock).toHaveBeenCalledWith(
      '/chat/new?inheritFrom=sha256%3Aparent_commit&projectId=proj_1'
    );
  });

  it('opens canvas inside the chat workspace shell', () => {
    render(<CommittedBar projectId="proj_1" />);

    fireEvent.click(screen.getByRole('button', { name: /view canvas/i }));

    expect(pushMock).toHaveBeenCalledWith('/chat/project/proj_1/canvas');
  });

  it('uses the chat panel surface for the committed card', () => {
    const { container } = render(<CommittedBar projectId="proj_1" />);

    expect(container.querySelector('.bg-\\[var\\(--chat-panel\\)\\]')).not.toBeNull();
  });
});

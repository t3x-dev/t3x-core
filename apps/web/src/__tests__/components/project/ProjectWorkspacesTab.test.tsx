// @vitest-environment jsdom

import '@testing-library/jest-dom';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ProjectWorkspacesTab } from '@/components/project/ProjectWorkspacesTab';

const replaceMock = vi.fn();
let searchParamsValue = new URLSearchParams('tab=workspaces');

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: replaceMock }),
  useSearchParams: () => searchParamsValue,
}));

describe('ProjectWorkspacesTab', () => {
  it('selects the workspace from the URL without showing an internal workspace selector', () => {
    searchParamsValue = new URLSearchParams('tab=workspaces&workspace=workspace_release_notes');
    replaceMock.mockClear();

    render(<ProjectWorkspacesTab projectId="proj_other" />);

    expect(screen.getByRole('heading', { name: 'Release note cleanup' })).toBeInTheDocument();
    expect(screen.queryByText('Audience chat')).not.toBeInTheDocument();
    expect(screen.queryByText('PRD import')).not.toBeInTheDocument();
    expect(screen.queryByText('Release note outline')).not.toBeInTheDocument();

    const sourceChatTab = screen.getByRole('tab', { name: 'Chat' });
    fireEvent.mouseDown(sourceChatTab, { button: 0, ctrlKey: false });
    fireEvent.click(sourceChatTab);

    expect(screen.getByText('No source chat turns yet.')).toBeInTheDocument();
    expect(
      screen.queryByText(
        'Start by importing a document, pasting source text, or adding a manual note.'
      )
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText(
        'I will keep analysis separate until you mark a turn or material as source evidence.'
      )
    ).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('tab', { name: /YSchema/ }));

    expect(screen.getByRole('heading', { name: 'Release note cleanup' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Release note cleanup/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /PRD audience handoff/ })).not.toBeInTheDocument();
    expect(replaceMock).not.toHaveBeenCalled();
  });
});

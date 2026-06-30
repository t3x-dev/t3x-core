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
  it('selects the workspace from the URL and preserves project context when selection changes', () => {
    searchParamsValue = new URLSearchParams('tab=workspaces&workspace=workspace_release_notes');
    replaceMock.mockClear();

    render(<ProjectWorkspacesTab projectId="proj_other" />);

    expect(screen.getByRole('button', { name: /Release note cleanup/ })).toHaveAttribute(
      'aria-pressed',
      'true'
    );

    fireEvent.click(screen.getByRole('button', { name: /PRD audience handoff/ }));

    expect(replaceMock).toHaveBeenCalledWith('?tab=workspaces&workspace=workspace_prd_handoff', {
      scroll: false,
    });
  });
});

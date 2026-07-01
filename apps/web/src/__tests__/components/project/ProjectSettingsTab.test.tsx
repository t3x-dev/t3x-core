// @vitest-environment jsdom

import '@testing-library/jest-dom';
import { fireEvent, render, screen } from '@testing-library/react';
import type React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { ProjectSettingsTab } from '@/components/project/ProjectSettingsTab';
import type { ProjectSummary } from '@/store/projectStore';

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

describe('ProjectSettingsTab', () => {
  const project: ProjectSummary = {
    branchesCount: 1,
    commitsCount: 1,
    defaultModel: null,
    defaultProvider: null,
    description: 'Click audit workflow',
    drafts: 1,
    id: 'proj_audit',
    name: 'Mobile Click Audit 1780972749777',
    nodes: 2,
    owner: 'You',
    status: 'active',
    updatedAt: 'just now',
  };

  it('presents repository settings as repo-scoped controls', () => {
    render(<ProjectSettingsTab project={project} />);

    expect(screen.getByRole('heading', { name: 'Repository settings' })).toBeInTheDocument();
    expect(screen.getAllByText('Mobile Click Audit 1780972749777').length).toBeGreaterThan(0);
    expect(screen.getByText('Repository path')).toBeInTheDocument();
    expect(screen.getByText('/t3x-dev/mobile-click-audit')).toBeInTheDocument();
    expect(screen.getByText('General')).toBeInTheDocument();
    expect(screen.getByLabelText('Repository name')).toHaveValue(
      'Mobile Click Audit 1780972749777'
    );
    expect(screen.getByLabelText('Repository description')).toHaveValue('Click audit workflow');
    expect(screen.getByText('Defaults')).toBeInTheDocument();
    expect(screen.getByText('Runtime and outputs')).toBeInTheDocument();
    expect(screen.getByLabelText('Default schema')).toHaveTextContent('PRD Schema v2');
    expect(screen.getByLabelText('Workspace default lane')).toHaveTextContent('Source');
    expect(screen.getByRole('button', { name: 'Add output target' })).toBeDisabled();
    expect(screen.getByText('Output target setup requires backend runtime.')).toBeInTheDocument();
    expect(screen.getByText('Danger zone')).toBeInTheDocument();
    expect(screen.getAllByText('Rename repository').length).toBeGreaterThan(0);
    expect(screen.getByRole('button', { name: 'Rename repository' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Delete repository' })).toBeDisabled();
    expect(screen.queryByRole('heading', { name: 'Global setup' })).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Repository name'), {
      target: { value: 'Mobile Audit' },
    });
    expect(screen.getByRole('button', { name: 'Save repository profile' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Reset repository profile' })).toBeEnabled();
    expect(screen.getByRole('link', { name: 'Provider setup' })).toHaveAttribute(
      'href',
      '/settings/providers'
    );
    expect(screen.getByRole('link', { name: 'API / CLI / MCP access' })).toHaveAttribute(
      'href',
      '/settings/access'
    );
  });
});

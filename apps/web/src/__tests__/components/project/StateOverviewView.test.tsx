// @vitest-environment jsdom
import '@testing-library/jest-dom';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import { EmptyStateOverview, StateOverviewView } from '@/components/project/StateOverviewView';

const overview = vi.hoisted(() => vi.fn());
vi.mock('@/hooks/commits/useStateOverview', () => ({ useStateOverview: overview }));
const props = {
  projectId: 'p',
  commitDigest: `sha256:${'a'.repeat(64)}`,
  projectName: 'Evaluation schema',
};
beforeEach(() => {
  HTMLElement.prototype.scrollIntoView = vi.fn();
  overview.mockReturnValue({
    data: {
      author: {
        document: {
          description: 'Author description',
          tags: [],
          resources: [],
          readme:
            '# Guide\n\n<script>alert(1)</script>\n\n[Blocked](javascript:alert)\n\n[Good](https://example.test)\n\n![Remote](https://example.test/pixel.png)',
        },
      },
      summary: {
        items: [{ key: '', pointer: '/', type: 'string', childCount: null }],
        truncated: false,
      },
      render: {
        model: { value: { '': 'Empty-key content' } },
        recovery: { json: '{"":"Empty-key content"}' },
      },
    },
    loading: false,
    error: null,
  });
});
it('keeps author Markdown inert and prevents remote image requests', () => {
  const { container } = render(<StateOverviewView {...props} />);
  expect(screen.getByText('Author description')).toBeVisible();
  expect(container.querySelector('script')).toBeNull();
  expect(container.querySelector('img')).toBeNull();
  expect(screen.queryByRole('link', { name: 'Blocked' })).toBeNull();
  expect(screen.getByRole('link', { name: 'Good' })).toHaveAttribute('rel', 'noopener noreferrer');
});
it('focuses even an empty JSON key and supports expanding/restoring the render', () => {
  render(<StateOverviewView {...props} />);
  fireEvent.click(screen.getByRole('button', { name: 'Contents' }));
  fireEvent.click(screen.getByRole('button', { name: 'Guide' }));
  expect(HTMLElement.prototype.scrollIntoView).toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Expand rendered State' }));
  fireEvent.click(screen.getByRole('button', { name: '(empty key)' }));
  expect(screen.getByRole('button', { name: /All sections/ })).toBeVisible();
  expect(screen.queryByRole('region', { name: 'Project introduction' })).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Restore split view' }));
  expect(screen.getByRole('region', { name: 'Project introduction' })).toBeVisible();
});
it('shows a retryable failure without showing old author content', () => {
  const retry = vi.fn();
  overview.mockReturnValue({ error: 'Revision unavailable', retry });
  render(<StateOverviewView {...props} />);
  expect(screen.queryByText('Author description')).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
  expect(retry).toHaveBeenCalledOnce();
});

it('uses actual metadata and committed values for the release layout and handles absent commit authors', () => {
  render(
    <StateOverviewView
      {...props}
      projectName="test-bug"
      projectOwner="Actual owner"
      projectVisibility="private"
      schemaName="Actual schema"
      historyHref="/history"
      workspaceHref="/workspace"
      commits={[
        {
          hash: props.commitDigest,
          committed_at: '2026-09-09T00:00:00Z',
          message: 'Actual commit',
          branch: 'release/candidate',
        } as import('@/infrastructure/commits').ApiCommit,
      ]}
    />
  );
  expect(screen.getAllByText('Actual owner')).toHaveLength(2);
  expect(screen.getAllByText('Private')).toHaveLength(2);
  expect(screen.getByText('Empty-key content')).toBeVisible();
  expect(screen.queryByText('Monitoring enabled')).toBeNull();
  expect(screen.getByText(/Author not recorded/)).toBeVisible();
  expect(screen.getByRole('link', { name: 'Actual commit' })).toHaveAttribute(
    'href',
    expect.stringContaining('branch=release%2Fcandidate')
  );
  expect(screen.getByRole('link', { name: 'Propose change' })).toHaveAttribute(
    'href',
    '/workspace'
  );
});

it('shows the default README for empty repositories without inventing committed state', () => {
  render(<EmptyStateOverview workspaceHref="/project/empty?tab=workspaces" />);
  expect(screen.getByText('Release with evidence')).toBeVisible();
  expect(screen.getByText('No commits yet')).toBeVisible();
  expect(screen.getByRole('link', { name: 'Propose change' })).toHaveAttribute(
    'href',
    '/project/empty?tab=workspaces'
  );
  expect(screen.queryByText('Committed')).not.toBeInTheDocument();
});

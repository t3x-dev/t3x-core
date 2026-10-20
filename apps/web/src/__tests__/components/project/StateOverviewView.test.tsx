// @vitest-environment jsdom
import '@testing-library/jest-dom';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import { StateOverviewView } from '@/components/project/StateOverviewView';

const overview = vi.hoisted(() => vi.fn());
vi.mock('@/hooks/commits/useStateOverview', () => ({ useStateOverview: overview }));
const props = {
  projectId: 'p',
  commitDigest: `sha256:${'a'.repeat(64)}`,
  projectName: 'Evaluation schema',
  introductionSource: 'version' as const,
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
  expect(screen.queryByRole('region', { name: 'Version introduction' })).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Restore split view' }));
  expect(screen.getByRole('region', { name: 'Version introduction' })).toBeVisible();
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
      historyReturnTo="/team/repo?branch=release%2Fcandidate"
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
    `/project/p/history?branch=release%2Fcandidate&commit=${encodeURIComponent(props.commitDigest)}&returnTo=%2Fteam%2Frepo%3Fbranch%3Drelease%252Fcandidate`
  );
  expect(screen.getByRole('link', { name: 'Propose change' })).toHaveAttribute(
    'href',
    '/workspace'
  );
});

it('renders an empty repository with its own metadata and no committed state', () => {
  overview.mockReturnValue({ data: undefined, loading: false });
  render(
    <StateOverviewView
      {...props}
      commitDigest={null}
      introductionSource="repository"
      projectName="ew"
      projectOwner="t3x-dev"
      projectVisibility="private"
      schemaName="t3x/state"
      workspaceHref="/project/empty?tab=workspaces"
    />
  );
  expect(overview).toHaveBeenCalledWith('p', null);
  expect(screen.getByRole('heading', { name: 'ew' })).toBeVisible();
  expect(screen.queryByText('Release Control')).toBeNull();
  expect(screen.queryByText('Updated Sep 9')).toBeNull();
  expect(screen.queryByText('release-management')).toBeNull();
  expect(screen.getAllByText('t3x-dev').length).toBeGreaterThan(0);
  expect(screen.queryByText('Release with evidence')).toBeNull();
  expect(screen.getByText('No README added yet.')).toBeVisible();
  expect(screen.getByText('No commits yet')).toBeVisible();
  expect(screen.queryByText('Committed')).toBeNull();
  expect(screen.queryByRole('button', { name: 'Expand rendered State' })).toBeNull();
  expect(screen.getAllByRole('link', { name: 'Propose change' })[0]).toHaveAttribute(
    'href',
    '/project/empty?tab=workspaces'
  );
});

it('renders the empty repository header instead of hiding it', () => {
  overview.mockReturnValue({ data: undefined, loading: false });
  render(<StateOverviewView {...props} commitDigest={null} headerOnly projectName="ew" />);
  expect(screen.getByRole('heading', { name: 'ew' })).toBeVisible();
});

it('shows current repository information across heads without borrowing version content or resources', () => {
  const repository = {
    readme:
      '# Current repository\n\n![Missing](images/mark.png)\n\n<script>alert(1)</script>\n\n[Bad](javascript:alert)\n\n[Good](https://example.test)',
    tags: ['当前'],
  };
  const { rerender, container } = render(
    <StateOverviewView
      {...props}
      introductionSource="repository"
      repositoryProfile={repository}
      projectDescription="Current description"
    />
  );
  expect(screen.getByRole('heading', { name: 'Current repository' })).toBeVisible();
  expect(screen.getByText('#当前')).toBeVisible();
  expect(screen.getByText('Current description')).toBeVisible();
  expect(screen.queryByText('Author description')).toBeNull();
  expect(screen.getByText('[Image unavailable: Missing]')).toBeVisible();
  expect(container.querySelector('img, script')).toBeNull();
  expect(screen.queryByRole('link', { name: 'Bad' })).toBeNull();
  expect(screen.getByRole('link', { name: 'Good' })).toHaveAttribute('rel', 'noopener noreferrer');
  rerender(
    <StateOverviewView
      {...props}
      commitDigest="other-head"
      introductionSource="repository"
      repositoryProfile={repository}
    />
  );
  expect(screen.getByRole('heading', { name: 'Current repository' })).toBeVisible();
  rerender(
    <StateOverviewView
      {...props}
      introductionSource="repository"
      repositoryProfile={{ readme: '', tags: [] }}
      projectName="test-bug"
    />
  );
  expect(screen.getByText('No README added yet.')).toBeVisible();
  expect(screen.queryByRole('heading', { name: 'Guide' })).toBeNull();
  expect(screen.getByRole('heading', { name: 'test-bug' })).toBeVisible();
  expect(screen.queryByText('Release Control')).toBeNull();
  expect(screen.queryByText('Release with evidence')).toBeNull();
});

it('keeps missing historical introductions empty even with current repository information', () => {
  const data = overview().data;
  overview.mockReturnValue({ data: { ...data, author: null }, loading: false });
  render(
    <StateOverviewView
      {...props}
      repositoryProfile={{ readme: '# Current repository', tags: ['Current tag'] }}
      projectDescription="Current description"
      canEditRepository
      onSaveRepositoryProfile={vi.fn()}
    />
  );
  expect(screen.getByRole('region', { name: 'Version introduction' })).toBeVisible();
  expect(screen.getByText('No README published for this revision.')).toBeVisible();
  expect(screen.queryByText('Current repository')).toBeNull();
  expect(screen.queryByText('Current description')).toBeNull();
  expect(screen.queryByText('Current tag')).toBeNull();
  expect(screen.queryByRole('button', { name: 'Add README' })).toBeNull();
});

it('offers authorized editing with no Commit and keeps failed input, cancellation and empty saves distinct', async () => {
  const save = vi.fn().mockRejectedValueOnce(new Error('Save failed')).mockResolvedValue(undefined);
  overview.mockReturnValue({ data: undefined, loading: false });
  const repositoryProps = {
    ...props,
    introductionSource: 'repository' as const,
    commitDigest: null,
    repositoryProfile: { readme: 'Saved README', tags: ['Saved tag'] },
    canEditRepository: true,
    onSaveRepositoryProfile: save,
  };
  const { rerender } = render(<StateOverviewView {...repositoryProps} />);
  fireEvent.click(screen.getByRole('button', { name: 'Edit README' }));
  expect(screen.getByRole('textbox', { name: 'Repository README' })).toHaveValue('Saved README');
  fireEvent.change(screen.getByRole('textbox', { name: 'Repository README' }), {
    target: { value: 'Draft' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Save README' }));
  await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Save failed'));
  expect(screen.getByRole('textbox', { name: 'Repository README' })).toHaveValue('Draft');
  fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
  expect(save).toHaveBeenCalledExactlyOnceWith({ readme: 'Draft' });
  fireEvent.click(screen.getByRole('button', { name: 'Edit README' }));
  expect(screen.getByRole('textbox', { name: 'Repository README' })).toHaveValue('Saved README');
  fireEvent.change(screen.getByRole('textbox', { name: 'Repository README' }), {
    target: { value: '' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Save README' }));
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  expect(save).toHaveBeenLastCalledWith({ readme: '' });
  rerender(
    <StateOverviewView
      {...repositoryProps}
      repositoryProfile={{ readme: '', tags: ['Saved tag'] }}
    />
  );
  expect(screen.getByText('No README added yet.')).toBeVisible();
  expect(screen.getByText('#Saved tag')).toBeVisible();
});

it('saves only normalized tags and blocks duplicate submission while pending', async () => {
  let finish!: () => void;
  const save = vi.fn(
    () =>
      new Promise<void>((resolve) => {
        finish = resolve;
      })
  );
  overview.mockReturnValue({ data: undefined, loading: false });
  render(
    <StateOverviewView
      {...props}
      introductionSource="repository"
      commitDigest={null}
      canEditRepository
      onSaveRepositoryProfile={save}
    />
  );
  fireEvent.click(screen.getByRole('button', { name: 'Add tags' }));
  const input = screen.getByRole('textbox', { name: 'Tags', exact: true });
  for (const tag of ['中文', ' Dev ', '中文']) {
    fireEvent.change(input, { target: { value: tag } });
    fireEvent.keyDown(input, { key: 'Enter' });
  }
  fireEvent.change(input, { target: { value: 'Unfinished' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save tags' }));
  expect(screen.getByRole('button', { name: 'Saving…' })).toBeDisabled();
  fireEvent.submit(screen.getByRole('button', { name: 'Saving…' }).closest('form')!);
  expect(save).toHaveBeenCalledExactlyOnceWith({ tags: ['中文', 'Dev', 'Unfinished'] });
  finish();
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
});

it('prefills only an empty README draft from current repository metadata and persists only on Save', async () => {
  const save = vi.fn().mockResolvedValue(undefined);
  const repositoryProps = {
    ...props,
    introductionSource: 'repository' as const,
    projectName: 'Catalog',
    projectDescription: 'Repository description',
    repositoryProfile: { readme: '', tags: [] },
    canEditRepository: true,
    onSaveRepositoryProfile: save,
  };
  const { rerender } = render(<StateOverviewView {...repositoryProps} />);
  fireEvent.click(screen.getByRole('button', { name: 'Add README', exact: true }));
  expect(screen.getByRole('dialog', { name: 'Add repository README' })).toBeVisible();
  expect(screen.getByRole('textbox', { name: 'Repository README' })).toHaveValue(
    '# Catalog\n\nRepository description\n'
  );
  expect(save).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
  expect(screen.getByText('No README added yet.')).toBeVisible();
  rerender(<StateOverviewView {...repositoryProps} projectName="Renamed" projectDescription="" />);
  fireEvent.click(screen.getByRole('button', { name: 'Add README', exact: true }));
  expect(screen.getByRole('textbox', { name: 'Repository README' })).toHaveValue('# Renamed\n');
  fireEvent.click(screen.getByRole('button', { name: 'Save README', exact: true }));
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  expect(save).toHaveBeenCalledExactlyOnceWith({ readme: '# Renamed\n' });
});

it('keeps repository information visible when State fails, without executable viewer edit controls', () => {
  overview.mockReturnValue({
    data: undefined,
    loading: false,
    error: 'State request failed',
    retry: vi.fn(),
  });
  render(
    <StateOverviewView
      {...props}
      introductionSource="repository"
      repositoryProfile={{ readme: '# Available', tags: [] }}
      onSaveRepositoryProfile={vi.fn()}
    />
  );
  expect(screen.getByRole('heading', { name: 'Available' })).toBeVisible();
  expect(screen.queryByRole('button', { name: 'Edit README' })).toBeNull();
  expect(screen.queryByRole('button', { name: 'Add tags' })).toBeNull();
  expect(screen.getByRole('button', { name: 'Retry State' })).toBeVisible();
});

it('preserves an unsaved repository README when the viewed business Commit changes', () => {
  const ownProps = {
    ...props,
    introductionSource: 'repository' as const,
    repositoryProfile: { readme: 'Saved', tags: [] },
    canEditRepository: true,
    onSaveRepositoryProfile: vi.fn(),
  };
  const { rerender } = render(<StateOverviewView {...ownProps} />);
  fireEvent.click(screen.getByRole('button', { name: 'Edit README', exact: true }));
  fireEvent.change(screen.getByRole('textbox', { name: 'Repository README' }), {
    target: { value: 'Unsaved work' },
  });
  rerender(<StateOverviewView {...ownProps} commitDigest="different-branch-head" />);
  expect(screen.getByRole('textbox', { name: 'Repository README' })).toHaveValue('Unsaved work');
  fireEvent.click(screen.getByRole('button', { name: 'Cancel', exact: true }));
  expect(ownProps.onSaveRepositoryProfile).not.toHaveBeenCalled();
});

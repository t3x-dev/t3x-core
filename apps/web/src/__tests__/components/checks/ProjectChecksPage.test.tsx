// @vitest-environment jsdom
import '@testing-library/jest-dom';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ProjectChecksPage } from '@/components/checks/ProjectChecksPage';
import type { CheckRecord } from '@/domain/project/checks';
import { repositoryLocation } from '@/domain/project/repositoryLocation';

const mocks = vi.hoisted(() => ({
  list: vi.fn(),
  detail: vi.fn(),
  push: vi.fn(),
  replace: vi.fn(),
  query: '',
  pathname: '/owner/repo/checks',
}));
vi.mock('next/navigation', () => ({
  usePathname: () => mocks.pathname,
  useSearchParams: () => new URLSearchParams(mocks.query),
  useRouter: () => ({ push: mocks.push, replace: mocks.replace }),
}));
vi.mock('@/queries/checks', () => ({
  fetchProjectChecks: mocks.list,
  fetchProjectCheck: mocks.detail,
}));

const record: CheckRecord = {
  id: 'review:r12',
  kind: 'review',
  created_at: '2026-10-23T00:00:00Z',
  payload: {
    workspace_id: 'ws:main',
    snapshot_id: 'r12',
    snapshot: {
      review: { precondition: { workspaceRevision: 12, refName: 'main' } },
      transition: {
        checks: {
          objectIntegrity: 'verified',
          replay: { observation: 'observed', outcomes: ['verified'] },
          validation: {
            observation: 'observed',
            outcomes: ['failed'],
            runs: [
              {
                predicate: {
                  gaps: [
                    {
                      code: 'EVIDENCE_MISSING',
                      path: 'summary/audience',
                      message: 'Accepted evidence is required.',
                    },
                  ],
                },
              },
            ],
          },
        },
      },
    },
  },
};

describe('Repository Checks', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.query = '';
    mocks.pathname = '/owner/repo/checks';
    mocks.list.mockResolvedValue({ records: [record], next_cursor: 'older' });
    mocks.detail.mockResolvedValue(record);
  });
  it('opens the exact record and preserves list filters in its return link', async () => {
    mocks.query = 'workspace=ws%3Amain&kind=review';
    render(<ProjectChecksPage projectId="p" />);
    const link = await screen.findByRole('link', { name: /Workspace review · revision 12/ });
    const url = new URL(link.getAttribute('href') ?? '', 'http://localhost');
    expect(url.pathname).toBe('/project/p/checks/review%3Ar12');
    expect(url.searchParams.get('returnTo')).toBe(
      '/owner/repo/checks?workspace=ws%3Amain&kind=review'
    );
    expect(screen.getByRole('link', { name: 'Open Workspaces' })).toHaveAttribute(
      'href',
      '/project/p?tab=workspaces'
    );
    fireEvent.click(screen.getByRole('button', { name: /Older records/ }));
    expect(mocks.push).toHaveBeenCalledWith(
      '/owner/repo/checks?workspace=ws%3Amain&kind=review&cursor=older',
      { scroll: false }
    );
  });
  it('reads immutable evidence, shows its gaps, and separates current editing from saved content', async () => {
    mocks.pathname += '/review%3Ar12';
    mocks.query = 'returnTo=%2Fowner%2Frepo%2Fworkspaces%3FworkspaceMode%3Dreview';
    render(<ProjectChecksPage projectId="p" recordId="review%3Ar12" />);
    expect(await screen.findByText('EVIDENCE_MISSING')).toBeInTheDocument();
    expect(screen.getByText('summary/audience')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Open Review snapshot' })).toHaveAttribute(
      'href',
      '/project/p?tab=workspaces&workspace=ws%3Amain&workspaceMode=review&branch=main&reviewSnapshot=r12'
    );
    expect(screen.getByRole('link', { name: 'Open current Workspace' })).toHaveAttribute(
      'href',
      '/project/p?tab=workspaces&workspace=ws%3Amain&branch=main'
    );
    expect(mocks.detail).toHaveBeenCalledWith('p', 'review:r12', expect.any(AbortSignal));
    expect(mocks.list).not.toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: /Commit|Merge|Rerun/ })).not.toBeInTheDocument();
  });
  it('never leaves a previous record visible when the requested record fails to load', async () => {
    const view = render(<ProjectChecksPage projectId="p" recordId="review:r12" />);
    await screen.findByText('EVIDENCE_MISSING');
    mocks.detail.mockRejectedValueOnce(new Error('Record unavailable'));
    view.rerender(<ProjectChecksPage projectId="p" recordId="review:missing" />);
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Record unavailable'));
    expect(screen.queryByText('EVIDENCE_MISSING')).not.toBeInTheDocument();
  });
  it('labels PR data as replaceable current readiness', async () => {
    mocks.detail.mockResolvedValue({
      id: 'pull-request:pr1',
      kind: 'pull-request',
      created_at: record.created_at,
      payload: {
        number: 1,
        title: 'Change',
        source_branch: 'feature',
        target_branch: 'main',
        checks: [],
      },
    });
    render(<ProjectChecksPage projectId="p" recordId="pull-request:pr1" />);
    expect(await screen.findByText(/Rerunning replaces these results/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Open PR checks' })).toHaveAttribute(
      'href',
      '/project/p?tab=pull-requests&pr=1&prTab=checks'
    );
    const href = new URL(
      screen.getByRole('link', { name: 'Open PR checks' }).getAttribute('href') ?? '',
      'http://localhost'
    );
    expect(href.pathname).toBe('/project/p');
    expect(repositoryLocation('/owner/repo', '', href.searchParams.toString())).toBe(
      '/owner/repo/pull-requests?pr=1&prTab=checks'
    );
  });
});

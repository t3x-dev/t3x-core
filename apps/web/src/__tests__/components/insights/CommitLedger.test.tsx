// @vitest-environment jsdom

import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { CommitLedger } from '@/components/insights/CommitLedger';
import type { InsightsLedger } from '@/domain/insights/groupByBranch';

const ledger: InsightsLedger = {
  projects: [
    {
      branchCount: 2,
      branches: [
        {
          branch: 'main',
          buckets: [
            {
              commits: [
                {
                  author: 'Asha',
                  branch: 'main',
                  committed_at: '2026-05-19T10:00:00Z',
                  entry: {
                    author: 'Asha',
                    bridgePrompt: 'main',
                    evidenceCount: 3,
                    facets: ['goal: launch'],
                    id: 'main123',
                    stage: 'commit',
                    status: 'validated',
                    summary: 'Launch knowledge',
                    tags: ['Alpha', 'main'],
                    title: 'Main checkpoint',
                    updatedAt: '2h ago',
                  },
                  hash: 'sha256:main123',
                  message: 'Main checkpoint',
                  treeCount: 3,
                },
              ],
              id: 'today',
              label: 'Today',
            },
          ],
          commitCount: 1,
          latestAt: '2026-05-19T10:00:00Z',
        },
        {
          branch: 'feature',
          buckets: [
            {
              commits: [
                {
                  author: 'Bo',
                  branch: 'feature',
                  committed_at: '2026-05-18T10:00:00Z',
                  entry: {
                    author: 'Bo',
                    bridgePrompt: 'feature',
                    evidenceCount: 1,
                    facets: [],
                    id: 'feature123',
                    stage: 'commit',
                    status: 'validated',
                    summary: 'Feature knowledge',
                    tags: ['Alpha', 'feature'],
                    title: 'Feature checkpoint',
                    updatedAt: '1d ago',
                  },
                  hash: 'sha256:feature123',
                  message: 'Feature checkpoint',
                  treeCount: 1,
                },
              ],
              id: 'yesterday',
              label: 'Yesterday',
            },
          ],
          commitCount: 1,
          latestAt: '2026-05-18T10:00:00Z',
        },
      ],
      commitCount: 2,
      latestAt: '2026-05-19T10:00:00Z',
      projectId: 'proj_alpha',
      projectName: 'Alpha',
    },
  ],
  totals: { branches: 2, commits: 2, projects: 1 },
};

describe('CommitLedger', () => {
  it('renders a project, branch, and time-bucket ledger instead of a card grid', () => {
    render(<CommitLedger ledger={ledger} onSelectEntry={vi.fn()} selectedEntry={null} />);

    expect(screen.getByRole('region', { name: 'Semantic commit ledger' })).toBeInTheDocument();
    expect(screen.getByText('Alpha')).toBeInTheDocument();
    expect(screen.getByText('main')).toBeInTheDocument();
    expect(screen.getByText('feature')).toBeInTheDocument();
    expect(screen.getByText('Today')).toBeInTheDocument();
    expect(screen.getByText('Yesterday')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Main checkpoint/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Feature checkpoint/ })).toBeInTheDocument();
  });

  it('keeps SemanticCard-style detail available beside the ledger', () => {
    render(
      <CommitLedger
        ledger={ledger}
        onSelectEntry={vi.fn()}
        selectedEntry={ledger.projects[0].branches[0].buckets[0].commits[0].entry}
      />
    );

    expect(screen.getByRole('complementary', { name: 'Selected commit detail' })).toHaveTextContent(
      'Main checkpoint'
    );
    expect(screen.getByText('Launch knowledge')).toBeInTheDocument();
  });
});

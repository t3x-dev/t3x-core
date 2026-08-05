// @vitest-environment jsdom

import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { WorkspaceExtractionProposalView } from '@/components/workspaces/WorkspaceExtractionProposalView';
import { useWorkspaceExtractionTransition } from '@/hooks/workspaces/useWorkspaceExtractionTransition';
import type { WorkspaceCandidate } from '@/types/workspaces';

vi.mock('@/hooks/workspaces/useWorkspaceExtractionTransition', () => ({
  useWorkspaceExtractionTransition: vi.fn(),
}));

const candidate: WorkspaceCandidate = {
  id: 'workspace_extract',
  revision: 4,
  projectId: 'proj_1',
  title: 'Server extraction',
  summary: 'Review immutable Source-backed operations.',
  status: 'schema_review',
  updatedAt: '2026-08-05T00:00:00.000Z',
  baseCommitHash: null,
  targetBranch: 'main',
  sourceBundle: [],
  schemaBindings: [],
  schemaCandidate: { summary: 'Extracted', fields: [] },
  schemaReview: { verdict: 'needs_review', summary: 'Review', gaps: [] },
  yopsDraft: { id: 'draft_extract', operations: [] },
  outputTargets: [],
  backendCandidateId: 'candidate:abc',
  extractionProposal: {
    schema: 't3x.dev/workspace-extraction-proposal/v1',
    sourceSelector: { type: 'conversation', id: 'conv_1', turnHashes: ['turn_1'] },
    sourceSelectorDigest: `sha256:${'a'.repeat(64)}`,
    baseCommitHash: null,
    mode: 'bootstrap',
    operations: [
      {
        set: { path: 'device/name', value: 'greenhouse' },
        source: {
          type: 'llm',
          model: 'model:test',
          at: '2026-08-05T00:00:00.000Z',
          turn_ref: { turn_hash: 'turn_1', quote: 'Name it greenhouse.' },
        },
      },
    ],
    actor: { kind: 'agent', id: 'agent:extractor' },
    createdAt: '2026-08-05T00:00:00.000Z',
  },
};

describe('WorkspaceExtractionProposalView', () => {
  beforeEach(() => {
    vi.mocked(useWorkspaceExtractionTransition).mockReturnValue({
      error: null,
      loading: false,
      transitionId: null,
      view: null,
    });
  });

  it('renders canonical SourcedYOps as read-only derived cards', () => {
    render(<WorkspaceExtractionProposalView candidate={candidate} />);

    expect(screen.getByRole('heading', { name: 'Repository extraction proposal' })).toBeVisible();
    expect(screen.getByText('1 operations')).toBeVisible();
    expect(screen.getByText('SET')).toBeVisible();
    expect(screen.getByText(/Name it greenhouse/)).toBeVisible();
    expect(screen.getByText('Workspace proposal')).toBeVisible();
    expect(screen.getByText(/Decision and Commit remain human-controlled/)).toBeInTheDocument();
  });

  it('shows when the current candidate has a durable Transition link', () => {
    vi.mocked(useWorkspaceExtractionTransition).mockReturnValueOnce({
      error: null,
      loading: false,
      transitionId: `trn_${'a'.repeat(32)}`,
      view: null,
    });

    render(<WorkspaceExtractionProposalView candidate={candidate} />);

    expect(screen.getByText('Transition proposed')).toBeVisible();
  });
});

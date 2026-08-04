// @vitest-environment jsdom

import '@testing-library/jest-dom';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { type WorkspaceYOpsFlowView, YOpsDraftTab } from '@/components/workspaces/YOpsDraftTab';
import { useWorkspaceYOps } from '@/hooks/workspaces/useWorkspaceYOps';
import type { WorkspaceCandidate } from '@/types/workspaces';

vi.mock('@/hooks/workspaces/useWorkspaceYOps', () => ({
  useWorkspaceYOps: vi.fn(),
}));

const candidate: WorkspaceCandidate = {
  id: 'workspace_legacy',
  revision: 1,
  projectId: 'proj_1',
  title: 'Legacy branch update',
  summary: 'Review a structured update on a legacy branch.',
  status: 'ready_for_yops',
  updatedAt: '2026-07-30T00:00:00.000Z',
  baseCommitHash: null,
  targetBranch: 'main',
  sourceBundle: [{ id: 'source_1', type: 'text', title: 'Change request' }],
  schemaBindings: [{ schemaName: 'PRD Schema', version: 'v2', mode: 'pinned' }],
  schemaCandidate: { summary: 'Ready', fields: [] },
  schemaReview: { verdict: 'ready', summary: 'Ready', gaps: [] },
  yopsDraft: {
    id: 'draft_legacy',
    operations: [
      {
        id: 'op_1',
        op: 'set',
        path: 'prd/summary/audience',
        summary: 'Update audience',
        afterValue: 'Operators',
      },
    ],
  },
  outputTargets: [],
};

const previewTrees = [
  {
    key: 'prd',
    slots: { title: 'Legacy branch update' },
    children: [{ key: 'summary', slots: { audience: 'Operators' }, children: [] }],
  },
];

function Harness() {
  const [view, setView] = useState<WorkspaceYOpsFlowView>('validation');
  return (
    <YOpsDraftTab
      candidate={candidate}
      onApplied={() => setView('commit')}
      onViewChange={setView}
      view={view}
    />
  );
}

describe('YOpsDraftTab Transition write path', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('fails closed on a non-transition head and never falls back to a removed commit route', async () => {
    const validate = vi.fn().mockResolvedValue({
      ok: true,
      applied: 1,
      yops: [{ set: { path: 'prd/summary/audience', value: 'Operators' } }],
      baselineTrees: [],
      previewTrees,
      previewRelations: [],
    });
    vi.mocked(useWorkspaceYOps).mockReturnValue({
      loadCommittedContent: vi.fn(),
      rootKey: 'prd',
      validate,
    });

    const workspaceUrl = 'http://localhost:8000/api/v1/projects/proj_1/workspaces/workspace_legacy';
    const reviewUrl = `${workspaceUrl}/transition/review`;
    const legacyCommitUrl = `${workspaceUrl}/commit`;
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input);
      if (url === workspaceUrl) {
        return new Response(
          JSON.stringify({
            success: true,
            data: {
              candidate_id: 'candidate:workspace_legacy',
              workspace: { ...candidate, revision: 2 },
            },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }
      if (url === reviewUrl) {
        return new Response(
          JSON.stringify({
            success: false,
            error: {
              code: 'LEGACY_HEAD_READ_ONLY',
              message: 'Non-transition heads are read-only until migration is defined',
            },
          }),
          { status: 409, headers: { 'Content-Type': 'application/json' } }
        );
      }
      throw new Error(`Unexpected request: ${url}`);
    });

    render(<Harness />);
    fireEvent.click(screen.getByRole('button', { name: /Validate proposal/ }));
    expect(await screen.findByText('Proposal validated')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Apply YOps/ }));
    expect(await screen.findByRole('button', { name: 'Review change' })).toBeEnabled();
    fireEvent.click(screen.getByRole('button', { name: 'Review change' }));

    expect(
      await screen.findByRole('alert', { name: 'Transition setup required' })
    ).toHaveTextContent('needs an explicit migration');
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(fetchMock.mock.calls.some(([url]) => String(url) === reviewUrl)).toBe(true);
    expect(fetchMock.mock.calls.some(([url]) => String(url) === legacyCommitUrl)).toBe(false);
  });
});

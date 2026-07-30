// @vitest-environment jsdom

import '@testing-library/jest-dom';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { OutputTargetsTab } from '@/components/workspaces/OutputTargetsTab';
import type { WorkspaceCandidate } from '@/types/workspaces';

const mocks = vi.hoisted(() => ({
  createLeaf: vi.fn(),
}));

vi.mock('@/hooks/leaves/useCreateLeaf', () => ({
  useCreateLeaf: () => ({ create: mocks.createLeaf }),
}));

const candidate: WorkspaceCandidate = {
  id: 'workspace_prd_handoff',
  projectId: 'proj_1',
  title: 'PRD audience handoff',
  summary: 'Committed PRD workspace.',
  status: 'committed',
  updatedAt: '2026-07-13T08:00:00.000Z',
  baseCommitHash: 'sha256:base',
  lastCommitHash: 'sha256:committed',
  targetBranch: 'feature/prd-audience',
  sourceBundle: [],
  schemaBindings: [],
  schemaCandidate: { summary: 'Ready.', fields: [] },
  schemaReview: { verdict: 'ready', summary: 'Ready.', gaps: [] },
  yopsDraft: { id: 'draft_prd', operations: [] },
  outputTargets: [
    {
      id: 'target_prd_markdown',
      title: 'PRD review brief',
      type: 'document',
      format: 'markdown',
      status: 'draft_target',
      leafType: 'document',
      instruction: 'Generate a concise PRD review brief.',
      constraints: ['Use committed state only.'],
      sourceScope: 'Committed PRD candidate and source evidence.',
    },
  ],
};

describe('OutputTargetsTab', () => {
  beforeEach(() => {
    mocks.createLeaf.mockReset();
    mocks.createLeaf.mockResolvedValue({
      id: 'leaf_1',
      commit_hash: 'sha256:committed',
      type: 'article',
      title: 'PRD review brief',
      constraints: [],
      config: {},
      output: null,
      generated_at: null,
      assertions: null,
      runner_assertions: null,
      project_id: 'proj_1',
      created_at: '2026-07-13T08:01:00.000Z',
      created_by: null,
    });
  });

  it('creates a Leaf with output-target lineage and canonical generation config', async () => {
    render(<OutputTargetsTab candidate={candidate} />);

    fireEvent.click(screen.getByRole('button', { name: 'Create Leaf' }));

    await waitFor(() => expect(mocks.createLeaf).toHaveBeenCalledTimes(1));
    expect(mocks.createLeaf).toHaveBeenCalledWith({
      commit_hash: 'sha256:committed',
      config: {
        format: 'markdown',
        output_target_id: 'target_prd_markdown',
        source_scope: 'Committed PRD candidate and source evidence.',
        user_instruction: 'Generate a concise PRD review brief.',
        workspace_id: 'workspace_prd_handoff',
      },
      constraints: [
        {
          id: 'constraint_target_prd_markdown_1',
          match_mode: 'semantic',
          type: 'require',
          value: 'Use committed state only.',
        },
      ],
      project_id: 'proj_1',
      source: { type: 'user' },
      title: 'PRD review brief',
      type: 'article',
    });
    expect(mocks.createLeaf.mock.calls[0]?.[0].config).not.toHaveProperty('instruction');
  });
});

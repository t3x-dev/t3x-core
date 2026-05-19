// @vitest-environment jsdom

import { DEMO_WORKSPACE_FIXTURE } from '@t3x-dev/core';
import { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createWorkbenchDraft, updateWorkbenchDraft } from '@/commands/drafts';
import { useFixtureReplay } from '@/hooks/drafts/useFixtureReplay';
import { fetchProjects } from '@/queries/projects';
import type { WorkbenchDraft } from '@/types/api';
import { cleanupRoots, renderHook, waitForHook } from './renderHook';

vi.mock('@/queries/projects', () => ({
  fetchProjects: vi.fn(),
}));

vi.mock('@/commands/drafts', () => ({
  createWorkbenchDraft: vi.fn(),
  updateWorkbenchDraft: vi.fn(),
}));

function makeDraft(overrides: Partial<WorkbenchDraft> = {}): WorkbenchDraft {
  return {
    id: 'draft_demo',
    project_id: 'proj_demo',
    title: 'Fixture replay',
    goal: null,
    parent_commit_hash: null,
    forked_from: null,
    nodes: [],
    constraints: [],
    instructions: null,
    preview_type: null,
    preview_output: null,
    preview_generated_at: null,
    status: 'editing',
    committed_as: null,
    committed_leaf_id: null,
    target_branch: 'main',
    revision: 1,
    created_at: '2026-05-19T00:00:00.000Z',
    updated_at: '2026-05-19T00:00:00.000Z',
    ...overrides,
  };
}

describe('useFixtureReplay', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanupRoots();
  });

  it('creates a fixture-backed draft in the seeded demo project without an LLM call', async () => {
    vi.mocked(fetchProjects).mockResolvedValueOnce({
      projects: [
        {
          project_id: 'proj_demo',
          name: DEMO_WORKSPACE_FIXTURE.project.name,
          created_at: '2026-05-19T00:00:00.000Z',
          metadata: DEMO_WORKSPACE_FIXTURE.project.metadata,
        },
      ],
      limit: 50,
      offset: 0,
    });
    vi.mocked(createWorkbenchDraft).mockResolvedValueOnce(makeDraft());
    vi.mocked(updateWorkbenchDraft).mockResolvedValueOnce(makeDraft({ revision: 2 }));

    const { result } = renderHook(() => useFixtureReplay());
    let replay: Awaited<ReturnType<typeof result.current.start>> | null = null;
    await act(async () => {
      replay = await result.current.start();
    });
    await waitForHook();

    expect(createWorkbenchDraft).toHaveBeenCalledWith({
      project_id: 'proj_demo',
      title: 'Fixture replay: Prompt Review',
      goal: DEMO_WORKSPACE_FIXTURE.replay.label,
      preview_type: DEMO_WORKSPACE_FIXTURE.leaf.type,
    });
    expect(updateWorkbenchDraft).toHaveBeenCalledWith(
      'draft_demo',
      expect.objectContaining({
        if_revision: 1,
        preview_type: DEMO_WORKSPACE_FIXTURE.leaf.type,
        instructions: expect.stringContaining(DEMO_WORKSPACE_FIXTURE.replay.label),
        nodes: expect.arrayContaining([
          expect.objectContaining({
            id: 'ds_demo_refund_threshold',
            included: true,
            origin: { type: 'manual' },
          }),
        ]),
        constraints: expect.arrayContaining([
          expect.objectContaining({
            id: 'dc_demo_refund_threshold',
            value: 'Refunds above $100',
          }),
        ]),
      })
    );
    expect(replay?.href).toBe('/project/proj_demo/draft/draft_demo');
    expect(replay?.label).toBe(DEMO_WORKSPACE_FIXTURE.replay.label);
    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBeNull();
  });
});

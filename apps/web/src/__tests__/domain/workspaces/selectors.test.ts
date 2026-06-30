import { describe, expect, it } from 'vitest';
import {
  countWorkspaceStatuses,
  filterWorkspaceCandidates,
  formatWorkspaceStatus,
  getPrimarySchemaBinding,
  selectWorkspaceCandidate,
  sortWorkspaceCandidates,
  summarizeSourceBundle,
} from '@/domain/workspaces/selectors';
import type { SourceBundleItem, WorkspaceCandidate } from '@/types/workspaces';

const workspaceCandidates: WorkspaceCandidate[] = [
  {
    id: 'workspace_ready',
    projectId: 'proj_1',
    title: 'PRD audience handoff',
    summary: 'Ready source bundle for deterministic YOps apply.',
    status: 'ready_for_yops',
    updatedAt: '2026-06-29T09:30:00.000Z',
    sourceBundle: [
      { id: 'src_chat', type: 'chat', title: 'Audience chat', conversationId: 'conv_1' },
      { id: 'src_doc', type: 'document', title: 'PRD import', fileName: 'prd.md' },
    ],
    schemaBindings: [{ schemaName: 'PRD Schema', version: 'v2', mode: 'pinned' }],
  },
  {
    id: 'workspace_draft',
    projectId: 'proj_1',
    title: 'Release cleanup',
    summary: 'Draft release note source collection.',
    status: 'draft',
    updatedAt: '2026-06-28T14:10:00.000Z',
    sourceBundle: [
      {
        id: 'src_release_doc',
        type: 'document',
        title: 'Release outline',
        fileName: 'release.md',
      },
    ],
    schemaBindings: [{ schemaName: 'Release Note Schema', version: 'v1', mode: 'project_default' }],
  },
  {
    id: 'workspace_review',
    projectId: 'proj_1',
    title: 'Schema review packet',
    summary: 'Candidate waiting on schema binding review.',
    status: 'schema_review',
    updatedAt: '2026-06-30T08:15:00.000Z',
    sourceBundle: [
      { id: 'src_prompt', type: 'prompt_run', title: 'Review prompt', runId: 'run_1' },
    ],
    schemaBindings: [{ schemaName: 'Review Schema', version: 'v3', mode: 'draft_override' }],
  },
];

describe('workspace selectors', () => {
  it('formats workspace status labels for project-first candidate states', () => {
    expect(formatWorkspaceStatus('draft')).toBe('Draft');
    expect(formatWorkspaceStatus('ready_for_yops')).toBe('Ready for YOps');
    expect(formatWorkspaceStatus('schema_review')).toBe('Schema review');
    expect(formatWorkspaceStatus('committed')).toBe('Committed');
  });

  it('summarizes mixed source bundles without privileging chat', () => {
    const sources: SourceBundleItem[] = [
      { id: 'src_chat', type: 'chat', title: 'Audience chat', conversationId: 'conv_1' },
      { id: 'src_doc', type: 'document', title: 'PRD import', fileName: 'prd.md' },
      { id: 'src_prompt', type: 'prompt_run', title: 'Prompt audit', runId: 'run_1' },
      { id: 'src_import', type: 'import', title: 'YAML seed', format: 'yaml' },
    ];

    expect(summarizeSourceBundle(sources)).toBe('1 chat, 1 doc, 1 prompt run, 1 import');
  });

  it('returns an empty source summary for candidates without source evidence yet', () => {
    expect(summarizeSourceBundle([])).toBe('No sources');
  });

  it('prefers pinned and draft override schema bindings over project defaults', () => {
    expect(
      getPrimarySchemaBinding([
        { schemaName: 'PRD Schema', version: 'v2', mode: 'project_default' },
        { schemaName: 'PRD Schema', version: 'v3', mode: 'pinned' },
      ])
    ).toEqual({ schemaName: 'PRD Schema', version: 'v3', mode: 'pinned' });

    expect(
      getPrimarySchemaBinding([
        { schemaName: 'PRD Schema', version: 'v2', mode: 'pinned' },
        { schemaName: 'PRD Schema', version: 'v4 draft', mode: 'draft_override' },
      ])
    ).toEqual({ schemaName: 'PRD Schema', version: 'v4 draft', mode: 'draft_override' });
  });

  it('counts workspace statuses for tab filters without dropping zero-count states', () => {
    expect(countWorkspaceStatuses(workspaceCandidates)).toEqual({
      all: 3,
      committed: 0,
      draft: 1,
      ready_for_yops: 1,
      schema_review: 1,
    });
  });

  it('filters candidates by status and project evidence query', () => {
    expect(
      filterWorkspaceCandidates(workspaceCandidates, { query: 'release', status: 'draft' }).map(
        (candidate) => candidate.id
      )
    ).toEqual(['workspace_draft']);

    expect(
      filterWorkspaceCandidates(workspaceCandidates, { query: 'prd schema', status: 'all' }).map(
        (candidate) => candidate.id
      )
    ).toEqual(['workspace_ready']);
  });

  it('sorts workspace candidates by recency or title without mutating input order', () => {
    expect(
      sortWorkspaceCandidates(workspaceCandidates, 'updated_desc').map((candidate) => candidate.id)
    ).toEqual(['workspace_review', 'workspace_ready', 'workspace_draft']);

    expect(
      sortWorkspaceCandidates(workspaceCandidates, 'title_asc').map((candidate) => candidate.id)
    ).toEqual(['workspace_ready', 'workspace_draft', 'workspace_review']);

    expect(workspaceCandidates.map((candidate) => candidate.id)).toEqual([
      'workspace_ready',
      'workspace_draft',
      'workspace_review',
    ]);
  });

  it('selects the requested visible candidate or falls back to the first visible workspace', () => {
    expect(selectWorkspaceCandidate(workspaceCandidates, 'workspace_draft')?.id).toBe(
      'workspace_draft'
    );
    expect(selectWorkspaceCandidate(workspaceCandidates, 'missing')?.id).toBe('workspace_ready');
    expect(selectWorkspaceCandidate([], 'workspace_draft')).toBeNull();
  });
});

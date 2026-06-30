import type { WorkspaceCandidate } from '@/types/workspaces';

const workspaceCandidates: WorkspaceCandidate[] = [
  {
    id: 'workspace_prd_handoff',
    projectId: 'preview_project',
    title: 'PRD audience handoff',
    summary: 'Source bundle for aligning PRD audience notes before deterministic YOps apply.',
    status: 'ready_for_yops',
    updatedAt: '2026-06-29T09:30:00.000Z',
    baseCommitHash: 'sha256:base-prd',
    targetBranch: 'feature/prd-audience',
    sourceBundle: [
      { id: 'src_prd_chat', type: 'chat', title: 'Audience chat', conversationId: 'conv_prd' },
      { id: 'src_prd_doc', type: 'document', title: 'PRD import', fileName: 'prd.md' },
    ],
    schemaBindings: [{ schemaName: 'PRD Schema', version: 'v2', mode: 'pinned' }],
    schemaReview: {
      verdict: 'ready',
      summary: 'Ready for YOps apply after schema alignment.',
      gaps: [],
    },
    yopsDraft: {
      id: 'draft_prd_handoff',
      operations: [
        {
          id: 'op_prd_audience',
          op: 'set',
          path: '/audience/primary',
          summary: 'Set primary audience from source evidence.',
        },
        {
          id: 'op_prd_scope',
          op: 'add',
          path: '/scope/non_goals/-',
          summary: 'Add non-goal from PRD import notes.',
        },
      ],
    },
    outputTargets: [
      {
        id: 'target_prd_markdown',
        title: 'PRD Markdown export',
        type: 'document',
        format: 'markdown',
        status: 'draft_target',
      },
    ],
  },
  {
    id: 'workspace_release_notes',
    projectId: 'preview_project',
    title: 'Release note cleanup',
    summary: 'Draft workspace for collecting release-note source evidence.',
    status: 'draft',
    updatedAt: '2026-06-28T14:10:00.000Z',
    baseCommitHash: null,
    targetBranch: 'release/notes',
    sourceBundle: [
      {
        id: 'src_release_doc',
        type: 'document',
        title: 'Release note outline',
        fileName: 'notes.md',
      },
    ],
    schemaBindings: [{ schemaName: 'Release Note Schema', version: 'v1', mode: 'project_default' }],
    schemaReview: {
      verdict: 'needs_review',
      summary: 'Needs schema confirmation before YOps apply.',
      gaps: ['Confirm release-note required fields.'],
    },
    yopsDraft: {
      id: 'draft_release_notes',
      operations: [
        {
          id: 'op_release_section',
          op: 'add',
          path: '/sections/-',
          summary: 'Add release-note section placeholder.',
        },
      ],
    },
    outputTargets: [
      {
        id: 'target_release_notes',
        title: 'Release notes preview',
        type: 'document',
        format: 'markdown',
        status: 'draft_target',
      },
    ],
  },
];

export function getWorkspacePreviewCandidates(projectId: string): WorkspaceCandidate[] {
  return workspaceCandidates.map((candidate) => ({ ...candidate, projectId }));
}

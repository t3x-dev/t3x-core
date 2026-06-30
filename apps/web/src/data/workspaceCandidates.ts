import type { WorkspaceCandidate } from '@/types/workspaces';

const workspaceCandidates: WorkspaceCandidate[] = [
  {
    id: 'workspace_prd_handoff',
    projectId: 'preview_project',
    title: 'PRD audience handoff',
    summary: 'Source bundle for aligning PRD audience notes before deterministic YOps apply.',
    status: 'ready_for_yops',
    updatedAt: '2026-06-29T09:30:00.000Z',
    sourceBundle: [
      { id: 'src_prd_chat', type: 'chat', title: 'Audience chat', conversationId: 'conv_prd' },
      { id: 'src_prd_doc', type: 'document', title: 'PRD import', fileName: 'prd.md' },
    ],
    schemaBindings: [{ schemaName: 'PRD Schema', version: 'v2', mode: 'pinned' }],
  },
  {
    id: 'workspace_release_notes',
    projectId: 'preview_project',
    title: 'Release note cleanup',
    summary: 'Draft workspace for collecting release-note source evidence.',
    status: 'draft',
    updatedAt: '2026-06-28T14:10:00.000Z',
    sourceBundle: [
      {
        id: 'src_release_doc',
        type: 'document',
        title: 'Release note outline',
        fileName: 'notes.md',
      },
    ],
    schemaBindings: [{ schemaName: 'Release Note Schema', version: 'v1', mode: 'project_default' }],
  },
];

export function getWorkspacePreviewCandidates(projectId: string): WorkspaceCandidate[] {
  return workspaceCandidates.map((candidate) => ({ ...candidate, projectId }));
}

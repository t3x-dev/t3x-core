import type { Material } from '@/types/api';
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
    sourceBundle: [],
    schemaBindings: [{ schemaName: 'PRD Schema', version: 'v2', mode: 'pinned' }],
    schemaCandidate: {
      summary: 'Source evidence supports the PRD audience handoff fields.',
      fields: [
        {
          id: 'field_prd_summary',
          path: 'summary',
          label: 'Summary',
          type: 'object',
          required: true,
          status: 'covered',
          sourceRefs: 2,
          children: [
            {
              id: 'field_prd_summary_audience',
              path: 'summary.audience',
              label: 'Audience',
              type: 'string',
              required: true,
              status: 'covered',
              value: 'Product and engineering reviewers',
              evidence: 'Audience chat and PRD import both name product and engineering reviewers.',
              sourceRefs: 2,
            },
            {
              id: 'field_prd_summary_goal',
              path: 'summary.goal',
              label: 'Goal',
              type: 'string',
              required: true,
              status: 'covered',
              value: 'Prepare a YSchema-ready PRD candidate before YOps handoff.',
              evidence: 'The chat asks to turn the PRD draft into a YSchema-ready candidate.',
              sourceRefs: 1,
            },
          ],
        },
        {
          id: 'field_prd_scope',
          path: 'scope',
          label: 'Scope',
          type: 'object',
          required: true,
          status: 'covered',
          sourceRefs: 1,
          children: [
            {
              id: 'field_prd_scope_non_goals',
              path: 'scope.non_goals',
              label: 'Non-goals',
              type: 'string[]',
              required: false,
              status: 'covered',
              value: 'Keep requirement identity stable while moving status to ready.',
              evidence: 'The source chat explicitly keeps req-yops-handoff identity unchanged.',
              sourceRefs: 1,
            },
          ],
        },
      ],
    },
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
          beforeValue: 'Internal reviewers',
          afterValue: 'Product and engineering reviewers',
          reason: 'Source evidence confirms product and engineering reviewers as the PRD audience.',
          sourceRefs: [],
        },
        {
          id: 'op_prd_scope',
          op: 'add',
          path: '/scope/non_goals/-',
          summary: 'Add non-goal from PRD import notes.',
          beforeValue: 'No non-goal recorded',
          afterValue: 'Keep requirement identity stable while moving status to ready.',
          reason:
            'The candidate includes an identity constraint that should be preserved in state.',
          sourceRefs: [],
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
    sourceBundle: [],
    schemaBindings: [{ schemaName: 'Release Note Schema', version: 'v1', mode: 'project_default' }],
    schemaCandidate: {
      summary: 'Release-note candidate still needs required release metadata.',
      fields: [
        {
          id: 'field_release_title',
          path: 'title',
          label: 'Title',
          type: 'string',
          required: true,
          status: 'covered',
          value: 'Release note cleanup',
          evidence: 'Workspace title and release outline provide the candidate title.',
          sourceRefs: 1,
        },
        {
          id: 'field_release_version',
          path: 'release.version',
          label: 'Release version',
          type: 'string',
          required: true,
          status: 'missing',
          sourceRefs: 0,
        },
        {
          id: 'field_release_sections',
          path: 'sections',
          label: 'Sections',
          type: 'array',
          required: true,
          status: 'needs_confirmation',
          value: 'One placeholder section',
          evidence:
            'The imported outline suggests a section, but the required section type is not confirmed.',
          sourceRefs: 1,
        },
      ],
    },
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
          beforeValue: 'No section placeholder',
          afterValue: 'One draft release-note section',
          reason:
            'The release-note source outline suggests a section, but still needs confirmation.',
          sourceRefs: [],
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

export function getWorkspacePreviewCandidates(
  projectId: string,
  materials: Material[] = []
): WorkspaceCandidate[] {
  const materialSources = materials.map(materialToSourceBundleItem);

  return workspaceCandidates.map((candidate) => ({
    ...candidate,
    projectId,
    sourceBundle:
      candidate.id === 'workspace_prd_handoff' ? materialSources : candidate.sourceBundle,
    yopsDraft:
      candidate.id === 'workspace_prd_handoff'
        ? {
            ...candidate.yopsDraft,
            operations: candidate.yopsDraft.operations.map((operation) => ({
              ...operation,
              sourceRefs: operation.sourceRefs?.length
                ? operation.sourceRefs
                : materialSources.map((source) => source.id),
            })),
          }
        : candidate.yopsDraft,
  }));
}

function materialToSourceBundleItem(material: Material) {
  return {
    id: materialSourceId(material.id),
    type: material.source_type === 'document' ? ('document' as const) : ('import' as const),
    title: material.title,
    description: material.content_excerpt,
    materialId: material.id,
    contentHash: material.content_hash,
    tokenEstimate: material.token_estimate,
    fileName: material.filename ?? undefined,
    previewText: material.content_excerpt,
  };
}

export function materialSourceId(materialId: string): string {
  return `material:${materialId}`;
}

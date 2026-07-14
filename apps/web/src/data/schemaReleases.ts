import type { SchemaRegistryPreview, SchemaReleasePreview } from '@/types/schemas';

const CURRENT_RELEASE_ID = 'schema_prd_v2';

const schemaReleases: SchemaReleasePreview[] = [
  {
    id: 'schema_prd_v3',
    projectId: 'preview_project',
    name: 'PRD Schema',
    version: 'v3',
    description:
      'Draft version adds explicit acceptance coverage and keeps the existing PRD summary contract.',
    status: 'draft',
    usedByCommitCount: 0,
    usedByWorkspaceCount: 1,
    breakingChangeLevel: 'minor',
    source: 'official',
    category: 'Product',
    rootKey: 'prd',
    requiredFields: ['summary.problem', 'summary.audience', 'summary.outcome', 'requirements.*'],
    compatibleWith: ['YSchema review', 'YOps apply', 'Leaf document'],
    migrationSummary:
      'Comparison only. Existing v2 commits remain valid; one workspace is testing this draft without changing the current version.',
    canonicalName: 't3x/prd',
    schemaHash: 'sha256:91ef3f8b4ca7',
    updatedLabel: 'Updated 2026-07-10',
    structure: [
      { path: 'summary', type: 'object', required: true, constraint: 'prose section', depth: 0 },
      {
        path: 'summary.problem',
        type: 'string',
        required: true,
        constraint: 'max 80 words',
        depth: 1,
      },
      {
        path: 'summary.audience',
        type: 'string',
        required: true,
        constraint: 'max 40 words',
        depth: 1,
      },
      {
        path: 'summary.outcome',
        type: 'string',
        required: true,
        constraint: 'max 60 words',
        depth: 1,
      },
      {
        path: 'requirements',
        type: 'array',
        required: true,
        constraint: 'repeated nodes',
        depth: 0,
      },
      {
        path: 'requirements.*.title',
        type: 'string',
        required: true,
        constraint: 'max 24 words',
        depth: 1,
      },
      {
        path: 'requirements.*.priority',
        type: 'enum',
        required: true,
        constraint: 'must | should | could',
        depth: 1,
      },
      {
        path: 'requirements.*.acceptance',
        type: 'array',
        required: true,
        constraint: 'at least 1 item',
        depth: 1,
      },
      {
        path: 'requirements.*.evidence',
        type: 'array',
        required: true,
        constraint: 'source refs required',
        depth: 1,
      },
    ],
    canonicalYaml: `yschema: 0.1
name: t3x/prd
version: 3
strict: true
nodes:
  summary:
    required: true
    requiredSlots: [problem, audience, outcome]
  requirements:
    required: true
    repeated: true
    requiredSlots: [title, priority, acceptance, evidence]
    slots:
      acceptance:
        type: array
        minItems: 1
      evidence:
        type: array
        provenanceRequired: true`,
    changesBaseReleaseId: CURRENT_RELEASE_ID,
    changes: [
      {
        kind: 'ADD',
        path: 'requirements.*.evidence',
        summary: 'Requires source references for each requirement.',
      },
      {
        kind: 'CHANGE',
        path: 'requirements.*.acceptance',
        summary: 'Requires at least one acceptance item.',
      },
      {
        kind: 'KEEP',
        path: 'summary.*',
        summary: 'Retains the v2 summary contract without migration.',
      },
    ],
  },
  {
    id: 'schema_prd_v2',
    projectId: 'preview_project',
    name: 'PRD Schema',
    version: 'v2',
    description:
      'Current project contract for product requirements, source-backed summaries, and structured requirement nodes.',
    status: 'active',
    releasedAt: '2026-06-20T00:00:00.000Z',
    releasedBy: 'HLQ',
    usedByCommitCount: 8,
    usedByWorkspaceCount: 2,
    breakingChangeLevel: 'none',
    source: 'official',
    category: 'Product',
    rootKey: 'prd',
    requiredFields: ['summary.problem', 'summary.audience', 'summary.outcome'],
    compatibleWith: ['YSchema review', 'YOps apply', 'Leaf document'],
    migrationSummary:
      'Current version. New workspaces use v2; existing commits retain the exact version they were validated against.',
    canonicalName: 't3x/prd',
    schemaHash: 'sha256:4d7b69f5e021',
    updatedLabel: '2026-06-20',
    structure: [
      { path: 'summary', type: 'object', required: true, constraint: 'prose section', depth: 0 },
      {
        path: 'summary.problem',
        type: 'string',
        required: true,
        constraint: 'max 80 words',
        depth: 1,
      },
      {
        path: 'summary.audience',
        type: 'string',
        required: true,
        constraint: 'max 40 words',
        depth: 1,
      },
      {
        path: 'summary.outcome',
        type: 'string',
        required: true,
        constraint: 'max 60 words',
        depth: 1,
      },
      {
        path: 'requirements',
        type: 'array',
        required: true,
        constraint: 'repeated nodes',
        depth: 0,
      },
      {
        path: 'requirements.*.title',
        type: 'string',
        required: true,
        constraint: 'max 24 words',
        depth: 1,
      },
      {
        path: 'requirements.*.priority',
        type: 'enum',
        required: true,
        constraint: 'must | should | could',
        depth: 1,
      },
      {
        path: 'requirements.*.acceptance',
        type: 'array',
        required: true,
        constraint: 'source-backed',
        depth: 1,
      },
    ],
    canonicalYaml: `yschema: 0.1
name: t3x/prd
version: 2
strict: true
nodes:
  summary:
    required: true
    contentKind: prose
    requiredSlots: [problem, audience, outcome]
  requirements:
    required: true
    repeated: true
    requiredSlots: [title, priority, acceptance]
    slots:
      priority:
        enum: [must, should, could]
        default: should
      acceptance:
        type: array
        provenanceRequired: true`,
    changesBaseReleaseId: CURRENT_RELEASE_ID,
    changes: [],
  },
  {
    id: 'schema_prd_v1',
    projectId: 'preview_project',
    name: 'PRD Schema',
    version: 'v1',
    description:
      'Historical PRD contract kept for commits created before audience and outcome became required summary fields.',
    status: 'deprecated',
    releasedAt: '2026-05-30T00:00:00.000Z',
    releasedBy: 'T3X',
    usedByCommitCount: 3,
    usedByWorkspaceCount: 0,
    breakingChangeLevel: 'breaking',
    source: 'official',
    category: 'Product',
    rootKey: 'prd',
    requiredFields: ['summary.problem', 'requirements.*.title'],
    compatibleWith: ['YSchema review'],
    migrationSummary:
      'Read-only historical version. Existing v1 commits remain inspectable; new workspaces use the current v2 contract.',
    canonicalName: 't3x/prd',
    schemaHash: 'sha256:0c833f19be6a',
    updatedLabel: '2026-05-30',
    structure: [
      { path: 'summary', type: 'object', required: true, constraint: 'prose section', depth: 0 },
      {
        path: 'summary.problem',
        type: 'string',
        required: true,
        constraint: 'max 100 words',
        depth: 1,
      },
      {
        path: 'summary.audience',
        type: 'string',
        required: false,
        constraint: 'optional',
        depth: 1,
      },
      {
        path: 'requirements',
        type: 'array',
        required: true,
        constraint: 'repeated nodes',
        depth: 0,
      },
      {
        path: 'requirements.*.title',
        type: 'string',
        required: true,
        constraint: 'max 32 words',
        depth: 1,
      },
      {
        path: 'requirements.*.priority',
        type: 'enum',
        required: false,
        constraint: 'must | should | could',
        depth: 1,
      },
    ],
    canonicalYaml: `yschema: 0.1
name: t3x/prd
version: 1
strict: false
nodes:
  summary:
    required: true
    requiredSlots: [problem]
  requirements:
    required: true
    repeated: true
    requiredSlots: [title]`,
    changesBaseReleaseId: CURRENT_RELEASE_ID,
    changes: [
      {
        kind: 'REMOVE',
        path: 'summary.outcome',
        summary: 'v1 does not require a measurable outcome.',
      },
      {
        kind: 'CHANGE',
        path: 'summary.audience',
        summary: 'Audience is optional in this historical version.',
      },
      {
        kind: 'REMOVE',
        path: 'requirements.*.acceptance',
        summary: 'Acceptance criteria are not required in v1.',
      },
    ],
  },
];

export function getSchemaRegistryPreview(projectId: string): SchemaRegistryPreview {
  return {
    currentReleaseId: CURRENT_RELEASE_ID,
    releases: schemaReleases.map((release) => ({ ...release, projectId })),
  };
}

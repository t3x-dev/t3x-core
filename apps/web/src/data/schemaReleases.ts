import type {
  SchemaFamilyPreview,
  SchemaRegistryPreview,
  SchemaReleasePreview,
} from '@/types/schemas';

const PRD_CURRENT_RELEASE_ID = 'schema_prd_v2';
const SKILL_CURRENT_RELEASE_ID = 'schema_skill_v1';

const prdSchemaReleases: SchemaReleasePreview[] = [
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
    relationTypes: [],
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
    changesBaseReleaseId: PRD_CURRENT_RELEASE_ID,
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
    relationTypes: [],
    schemaHash: 'sha256:40a09e96859420df665ad14dcde306886ddfbf7775febb0b749690b350c5337a',
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
version: "v2"
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
    changesBaseReleaseId: PRD_CURRENT_RELEASE_ID,
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
    relationTypes: [],
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
    changesBaseReleaseId: PRD_CURRENT_RELEASE_ID,
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

const skillSchemaReleases: SchemaReleasePreview[] = [
  {
    id: SKILL_CURRENT_RELEASE_ID,
    projectId: 'preview_project',
    name: 'Skill Schema',
    version: 'v1',
    description:
      'Portable workflow-routed agent skill with explicit resources, failure behavior, and deterministic delivery checks.',
    status: 'active',
    releasedAt: '2026-07-28T00:00:00.000Z',
    releasedBy: 'T3X',
    usedByCommitCount: 0,
    usedByWorkspaceCount: 0,
    breakingChangeLevel: 'none',
    source: 'official',
    category: 'Agent capability',
    rootKey: '9 nodes',
    requiredFields: [
      'manifest.name',
      'activation.should_trigger',
      'contract.goal',
      'workflows.*',
      'instructions.*',
      'checks.*',
    ],
    compatibleWith: ['YSchema validation', 'SKILL.md adapter', 'T3X artifact compiler'],
    migrationSummary:
      'Current portable Skill contract. Host-specific metadata is generated by deterministic release adapters instead of entering core Skill state.',
    canonicalName: 't3x/skill',
    schemaHash: 'sha256:93833de6b9585d3094217b8ee178917aefe7326952ac0087bb345ec67d4e5f32',
    updatedLabel: '2026-07-28',
    structure: [
      {
        path: 'manifest',
        type: 'object',
        required: true,
        constraint: 'identity and discovery',
        depth: 0,
      },
      {
        path: 'manifest.name',
        type: 'string',
        required: true,
        constraint: 'lowercase hyphen-case',
        depth: 1,
      },
      {
        path: 'manifest.summary',
        type: 'string',
        required: true,
        constraint: 'max 60 words',
        depth: 1,
      },
      {
        path: 'activation',
        type: 'object',
        required: true,
        constraint: 'positive and negative boundaries',
        depth: 0,
      },
      {
        path: 'activation.implicit',
        type: 'boolean',
        required: true,
        constraint: 'host activation policy',
        depth: 1,
      },
      {
        path: 'activation.should_trigger',
        type: 'array',
        required: true,
        constraint: 'positive examples',
        depth: 1,
      },
      {
        path: 'activation.should_not_trigger',
        type: 'array',
        required: true,
        constraint: 'negative examples',
        depth: 1,
      },
      {
        path: 'contract',
        type: 'object',
        required: true,
        constraint: 'inputs, outputs, and truth policy',
        depth: 0,
      },
      {
        path: 'contract.truth_policy',
        type: 'enum',
        required: true,
        constraint: 'evidence | inference | generation',
        depth: 1,
      },
      {
        path: 'contract.default_freedom',
        type: 'enum',
        required: false,
        constraint: 'UI authoring default only',
        depth: 1,
      },
      {
        path: 'workflows.*',
        type: 'object[]',
        required: true,
        constraint: 'routable capability modes',
        depth: 0,
      },
      {
        path: 'workflows.*.kind',
        type: 'enum',
        required: true,
        constraint: 'primary | supporting | persistence | review',
        depth: 1,
      },
      {
        path: 'workflows.*.when',
        type: 'string',
        required: true,
        constraint: 'routing condition',
        depth: 1,
      },
      {
        path: 'workflows.*.on_failure',
        type: 'enum',
        required: true,
        constraint: 'continue | fallback | ask | stop',
        depth: 1,
      },
      {
        path: 'instructions.*',
        type: 'object[]',
        required: true,
        constraint: 'ordered executable guidance',
        depth: 0,
      },
      {
        path: 'instructions.*.freedom',
        type: 'enum',
        required: true,
        constraint: 'high | medium | low',
        depth: 1,
      },
      {
        path: 'instructions.*.effect',
        type: 'enum',
        required: true,
        constraint: 'none | read | write | external',
        depth: 1,
      },
      {
        path: 'resources.*',
        type: 'object[]',
        required: false,
        constraint: 'scripts, data, references, assets, templates',
        depth: 0,
      },
      {
        path: 'resources.*.load_policy',
        type: 'enum',
        required: true,
        constraint: 'always | on demand | execute | output',
        depth: 1,
      },
      {
        path: 'dependencies.*',
        type: 'object[]',
        required: false,
        constraint: 'tools, MCP, plugins, runtimes, packages',
        depth: 0,
      },
      {
        path: 'checks.*',
        type: 'object[]',
        required: true,
        constraint: 'deterministic delivery gates',
        depth: 0,
      },
      {
        path: 'checks.*.kind',
        type: 'enum',
        required: true,
        constraint: 'command | checklist | smoke test',
        depth: 1,
      },
      {
        path: 'checks.*.blocking',
        type: 'boolean',
        required: true,
        constraint: 'mutation or export gate',
        depth: 1,
      },
      {
        path: 'evals.*',
        type: 'object[]',
        required: false,
        constraint: 'model behavior quality signals',
        depth: 0,
      },
    ],
    relationTypes: [
      {
        id: 'has_step',
        from: 'workflows/*',
        to: 'instructions/*',
        description: 'Workflow owns an ordered instruction step.',
        constraints: [],
      },
      {
        id: 'precedes',
        from: 'instructions/*',
        to: 'instructions/*',
        description: 'Source instruction must execute before target instruction.',
        constraints: ['acyclic'],
      },
      {
        id: 'workflow_uses_resource',
        from: 'workflows/*',
        to: 'resources/*',
        description: 'Workflow routes to a bundled resource.',
        constraints: [],
      },
      {
        id: 'instruction_uses_resource',
        from: 'instructions/*',
        to: 'resources/*',
        description: 'Instruction loads or executes a bundled resource.',
        constraints: [],
      },
      {
        id: 'requires',
        from: 'workflows/*',
        to: 'dependencies/*',
        description: 'Workflow requires an external capability.',
        constraints: [],
      },
      {
        id: 'verifies',
        from: 'checks/*',
        to: 'workflows/*',
        description: 'Deterministic check gates a workflow.',
        constraints: ['blocking check before export or delivery'],
      },
    ],
    canonicalYaml: `yschema: "0.1"
name: t3x/skill
version: "v1"
description: Portable workflow-routed agent skill with deterministic delivery checks.
strict: true
nodes:
  manifest:
    required: true
    required_slots: [name, summary]
  activation:
    required: true
    required_slots: [implicit, should_trigger, should_not_trigger]
  contract:
    required: true
    required_slots: [goal, inputs, outputs, non_goals, truth_policy]
  workflows:
    required: true
    repeated: true
    required_slots: [title, kind, when, output_formats, persistence, on_empty, on_failure]
  instructions:
    required: true
    repeated: true
    required_slots: [sequence, kind, title, body, freedom, effect, approval, success_criteria]
  resources:
    repeated: true
    required_slots: [kind, path, description, load_policy, use_when]
  dependencies:
    repeated: true
    required_slots: [kind, identifier, required, permissions]
  checks:
    required: true
    repeated: true
    required_slots: [kind, run_when, blocking]
  evals:
    repeated: true
    required_slots: [kind, prompt, assertions]
relation_types:
  has_step: { from: workflows/*, to: instructions/* }
  precedes: { from: instructions/*, to: instructions/*, acyclic: true }
  workflow_uses_resource: { from: workflows/*, to: resources/* }
  instruction_uses_resource: { from: instructions/*, to: resources/* }
  requires: { from: workflows/*, to: dependencies/* }
  verifies: { from: checks/*, to: workflows/* }`,
    changesBaseReleaseId: SKILL_CURRENT_RELEASE_ID,
    changes: [],
  },
];

const schemaFamilies: SchemaFamilyPreview[] = [
  {
    id: 'prd',
    name: 'PRD Schema',
    canonicalName: 't3x/prd',
    description: 'Product requirements, source-backed summaries, and acceptance contracts.',
    currentReleaseId: PRD_CURRENT_RELEASE_ID,
    releases: prdSchemaReleases,
  },
  {
    id: 'skill',
    name: 'Skill Schema',
    canonicalName: 't3x/skill',
    description: 'Portable agent capabilities, workflow routing, resources, checks, and evals.',
    currentReleaseId: SKILL_CURRENT_RELEASE_ID,
    releases: skillSchemaReleases,
  },
];

export function getSchemaRegistryPreview(projectId: string): SchemaRegistryPreview {
  return {
    defaultFamilyId: 'prd',
    families: schemaFamilies.map((family) => ({
      ...family,
      releases: family.releases.map((release) => ({ ...release, projectId })),
    })),
  };
}

import type {
  SchemaFamilyPreview,
  SchemaRegistryPreview,
  SchemaReleasePreview,
} from '@/types/schemas';

const PRD_V2_RELEASE_ID = 'schema_prd_v2';
const PRD_V1_RELEASE_ID = 'schema_prd_v1';
const PROMPT_V1_RELEASE_ID = 'schema_prompt_v1';
const SKILL_V1_RELEASE_ID = 'schema_skill_v1';
const ESPHOME_DEVICE_V1_RELEASE_ID = 'schema_esphome_device_v1';

const prdSchemaReleases: SchemaReleasePreview[] = [
  {
    id: 'schema_prd_v3',
    projectId: 'preview_project',
    name: 'PRD Schema',
    version: 'v3',
    description:
      'Published version adds explicit acceptance coverage and keeps the existing PRD summary contract.',
    status: 'published',
    runtimeAvailable: true,
    usedByCommitCount: 0,
    usedByWorkspaceCount: 1,
    breakingChangeLevel: 'minor',
    source: 'official',
    category: 'Product',
    rootKey: 'prd',
    requiredFields: ['summary.problem', 'summary.audience', 'summary.outcome', 'requirements.*'],
    compatibleWith: ['YSchema review', 'YOps apply', 'Leaf document'],
    migrationSummary:
      'Existing v2 commits remain valid; Workspaces adopt this version only when it is explicitly applied.',
    canonicalName: 't3x/prd',
    relationTypes: [],
    rules: [],
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
    changesBaseReleaseId: PRD_V2_RELEASE_ID,
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
      'Published contract for product requirements, source-backed summaries, and structured requirement nodes.',
    status: 'active',
    runtimeAvailable: true,
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
      'Apply this exact version to a Workspace when its contract matches the work being performed.',
    canonicalName: 't3x/prd',
    relationTypes: [],
    rules: [],
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
    changesBaseReleaseId: PRD_V1_RELEASE_ID,
    changes: [],
  },
  {
    id: PRD_V1_RELEASE_ID,
    projectId: 'preview_project',
    name: 'PRD Schema',
    version: 'v1',
    description:
      'Historical PRD contract kept for commits created before audience and outcome became required summary fields.',
    status: 'deprecated',
    runtimeAvailable: false,
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
    rules: [],
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
    changesBaseReleaseId: '',
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
    id: SKILL_V1_RELEASE_ID,
    projectId: 'preview_project',
    name: 'Skill Schema',
    version: 'v1',
    description:
      'Portable workflow-routed agent skill with explicit resources, failure behavior, and deterministic delivery checks.',
    status: 'active',
    runtimeAvailable: true,
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
        constraintTags: ['pattern'],
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
        constraintTags: ['enum'],
        depth: 1,
      },
      {
        path: 'contract.default_freedom',
        type: 'enum',
        required: false,
        constraint: 'UI authoring default only',
        constraintTags: ['enum'],
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
        constraintTags: ['enum'],
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
        constraintTags: ['enum'],
        depth: 1,
      },
      {
        path: 'instructions.*',
        type: 'object[]',
        required: true,
        constraint: 'ordered executable guidance',
        constraintTags: ['executable'],
        depth: 0,
      },
      {
        path: 'instructions.*.freedom',
        type: 'enum',
        required: true,
        constraint: 'high | medium | low',
        constraintTags: ['enum'],
        depth: 1,
      },
      {
        path: 'instructions.*.effect',
        type: 'enum',
        required: true,
        constraint: 'none | read | write | external',
        constraintTags: ['enum'],
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
        constraintTags: ['enum'],
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
        constraintTags: ['blocking', 'executable'],
        depth: 0,
      },
      {
        path: 'checks.*.kind',
        type: 'enum',
        required: true,
        constraint: 'command | checklist | smoke test',
        constraintTags: ['enum', 'executable'],
        depth: 1,
      },
      {
        path: 'checks.*.blocking',
        type: 'boolean',
        required: true,
        constraint: 'mutation or export gate',
        constraintTags: ['blocking'],
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
    rules: [
      {
        id: 'skill.workflow-routing',
        kind: 'executable',
        description: 'Every workflow owns steps and every instruction belongs to a workflow.',
        scope: 'workflows/* → instructions/*',
        blocking: true,
        signals: ['relation coverage', 'orphan steps'],
      },
      {
        id: 'skill.side-effect-approval',
        kind: 'executable',
        description: 'Write and external effects require an explicit approval gate.',
        scope: 'instructions/*',
        blocking: true,
        signals: ['effect', 'approval'],
      },
      {
        id: 'skill.generated-trigger-description',
        kind: 'descriptive',
        description: 'Host descriptions should summarize the manifest and activation boundaries.',
        scope: 'manifest + activation',
        blocking: false,
        signals: ['adapter guidance'],
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
    changesBaseReleaseId: '',
    changes: [],
  },
];

const promptSchemaReleases: SchemaReleasePreview[] = [
  {
    id: PROMPT_V1_RELEASE_ID,
    projectId: 'preview_project',
    name: 'Prompt Schema',
    version: 'v1',
    description:
      'Portable, typed, and testable contract for compiling one model invocation without calling a model.',
    status: 'active',
    runtimeAvailable: true,
    releasedAt: '2026-07-30T00:00:00.000Z',
    releasedBy: 'T3X',
    usedByCommitCount: 0,
    usedByWorkspaceCount: 0,
    breakingChangeLevel: 'none',
    source: 'official',
    category: 'Prompt runtime',
    rootKey: 'prompt',
    requiredFields: [
      'manifest.name',
      'contract.goal',
      'variables.*',
      'messages.*',
      'runtime',
      'output',
      'checks.*',
    ],
    compatibleWith: ['YSchema validation', 'Prompt compiler', 'Compile Preview API'],
    migrationSummary:
      'Current Prompt contract. Compilation is deterministic and does not invoke an LLM, network, or provider adapter.',
    canonicalName: 't3x/prompt',
    schemaHash: 'sha256:1d05f6c4ae0aeef34f15714e166377e4fd4c08644c885a2ddc7c2e50bf39f930',
    updatedLabel: '2026-07-30',
    structure: [
      {
        path: 'manifest',
        type: 'object',
        required: true,
        constraint: 'stable identity and discovery',
        depth: 0,
      },
      {
        path: 'manifest.name',
        type: 'string',
        required: true,
        constraint: 'lowercase hyphen-case, max 64 chars',
        constraintTags: ['pattern'],
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
        path: 'contract',
        type: 'object',
        required: true,
        constraint: 'goal, boundaries, and truth policy',
        depth: 0,
      },
      {
        path: 'contract.truth_policy',
        type: 'enum',
        required: true,
        constraint: 'evidence only | approved inference | open generation',
        constraintTags: ['enum'],
        depth: 1,
      },
      {
        path: 'variables.*',
        type: 'object[]',
        required: true,
        constraint: 'typed template inputs',
        depth: 0,
      },
      {
        path: 'variables.*.value_type',
        type: 'enum',
        required: true,
        constraint: 'string | number | integer | boolean | array | object',
        constraintTags: ['enum'],
        depth: 1,
      },
      {
        path: 'variables.*.source',
        type: 'enum',
        required: true,
        constraint: 'user | context | runtime | default',
        constraintTags: ['enum'],
        depth: 1,
      },
      {
        path: 'variables.*.value_pattern',
        type: 'string',
        required: false,
        constraint: 'compiler-applied regular expression',
        constraintTags: ['pattern', 'executable'],
        depth: 1,
      },
      {
        path: 'variables.*.on_missing',
        type: 'enum',
        required: true,
        constraint: 'ask | default | empty | stop',
        constraintTags: ['enum', 'executable'],
        depth: 1,
      },
      {
        path: 'messages.*',
        type: 'object[]',
        required: true,
        constraint: 'ordered text message templates',
        constraintTags: ['executable'],
        depth: 0,
      },
      {
        path: 'messages.*.sequence',
        type: 'integer',
        required: true,
        constraint: 'unique, minimum 1',
        constraintTags: ['executable'],
        depth: 1,
      },
      {
        path: 'messages.*.role',
        type: 'enum',
        required: true,
        constraint: 'system | developer | user | assistant',
        constraintTags: ['enum'],
        depth: 1,
      },
      {
        path: 'messages.*.template',
        type: 'string',
        required: true,
        constraint: 'declared double-brace variables',
        constraintTags: ['pattern', 'executable'],
        depth: 1,
      },
      {
        path: 'contexts.*',
        type: 'object[]',
        required: false,
        constraint: 'runtime context sources and budgets',
        depth: 0,
      },
      {
        path: 'contexts.*.load_policy',
        type: 'enum',
        required: true,
        constraint: 'always | on demand',
        constraintTags: ['enum'],
        depth: 1,
      },
      {
        path: 'contexts.*.resource_key',
        type: 'string',
        required: false,
        constraint: 'declared resource key',
        constraintTags: ['pattern', 'executable'],
        depth: 1,
      },
      {
        path: 'runtime',
        type: 'object',
        required: true,
        constraint: 'portable adapter requirements',
        depth: 0,
      },
      {
        path: 'runtime.mode',
        type: 'enum',
        required: true,
        constraint: 'chat | completion',
        constraintTags: ['enum'],
        depth: 1,
      },
      {
        path: 'runtime.response_format',
        type: 'enum',
        required: true,
        constraint: 'text | markdown | json | json schema',
        constraintTags: ['enum'],
        depth: 1,
      },
      {
        path: 'output',
        type: 'object',
        required: true,
        constraint: 'response parsing and failure behavior',
        depth: 0,
      },
      {
        path: 'output.format',
        type: 'enum',
        required: true,
        constraint: 'must match runtime response format',
        constraintTags: ['enum', 'executable'],
        depth: 1,
      },
      {
        path: 'output.schema_resource',
        type: 'string',
        required: false,
        constraint: 'required for JSON Schema output',
        constraintTags: ['pattern', 'blocking', 'executable'],
        depth: 1,
      },
      {
        path: 'resources.*',
        type: 'object[]',
        required: false,
        constraint: 'schemas, fixtures, data, references, templates',
        depth: 0,
      },
      {
        path: 'resources.*.kind',
        type: 'enum',
        required: true,
        constraint: 'schema | fixture | data | reference | template',
        constraintTags: ['enum'],
        depth: 1,
      },
      {
        path: 'resources.*.path',
        type: 'string',
        required: true,
        constraint: 'safe relative bundle path',
        constraintTags: ['pattern', 'blocking'],
        depth: 1,
      },
      {
        path: 'resources.*.load_policy',
        type: 'enum',
        required: true,
        constraint: 'always | on demand | execute only | output only',
        constraintTags: ['enum'],
        depth: 1,
      },
      {
        path: 'dependencies.*',
        type: 'object[]',
        required: false,
        constraint: 'external runtime capabilities',
        depth: 0,
      },
      {
        path: 'dependencies.*.kind',
        type: 'enum',
        required: true,
        constraint: 'tool | MCP | plugin | runtime | package',
        constraintTags: ['enum'],
        depth: 1,
      },
      {
        path: 'checks.*',
        type: 'object[]',
        required: true,
        constraint: 'deterministic compile and delivery gates',
        constraintTags: ['blocking', 'executable'],
        depth: 0,
      },
      {
        path: 'checks.*.kind',
        type: 'enum',
        required: true,
        constraint: 'template | fixture | output schema | checklist',
        constraintTags: ['enum', 'executable'],
        depth: 1,
      },
      {
        path: 'checks.*.blocking',
        type: 'boolean',
        required: true,
        constraint: 'blocks compilation when true',
        constraintTags: ['blocking', 'executable'],
        depth: 1,
      },
      {
        path: 'evals.*',
        type: 'object[]',
        required: false,
        constraint: 'behavior and quality signals',
        depth: 0,
      },
      {
        path: 'evals.*.kind',
        type: 'enum',
        required: true,
        constraint: 'behavior | quality | safety | regression',
        constraintTags: ['enum'],
        depth: 1,
      },
    ],
    rules: [
      {
        id: 'prompt.placeholders_declared',
        kind: 'executable',
        description: 'Every template placeholder must resolve to a declared variable.',
        scope: 'messages/*/template',
        blocking: true,
        signals: ['undeclared', 'malformed'],
      },
      {
        id: 'prompt.required_variables_used',
        kind: 'executable',
        description: 'Every required variable must be referenced by at least one message.',
        scope: 'variables/*',
        blocking: true,
        signals: ['unused required variable'],
      },
      {
        id: 'prompt.message_sequence_unique',
        kind: 'executable',
        description: 'Message sequence values must be unique and compile in ascending order.',
        scope: 'messages/*/sequence',
        blocking: true,
        signals: ['duplicate sequence'],
      },
      {
        id: 'prompt.resources_resolvable',
        kind: 'executable',
        description: 'Referenced context, fixture, and message resources must exist.',
        scope: 'contexts + messages + resources',
        blocking: true,
        signals: ['missing resource', 'stale relation'],
      },
      {
        id: 'prompt.output_schema_resolvable',
        kind: 'executable',
        description: 'JSON Schema output must resolve to a valid bundled schema resource.',
        scope: 'output/schema_resource',
        blocking: true,
        signals: ['missing schema', 'invalid JSON Schema'],
      },
      {
        id: 'prompt.blocking_check_required',
        kind: 'executable',
        description: 'A ready prompt requires a blocking compile or output check.',
        scope: 'checks/*',
        blocking: true,
        signals: ['missing gate'],
      },
    ],
    relationTypes: [
      {
        id: 'precedes',
        from: 'messages/*',
        to: 'messages/*',
        description: 'Source message compiles before the target message.',
        constraints: ['acyclic'],
      },
      {
        id: 'uses_variable',
        from: 'messages/*',
        to: 'variables/*',
        description: 'Message template references a declared variable.',
        constraints: ['derived from placeholders'],
      },
      {
        id: 'uses_resource',
        from: 'messages/*',
        to: 'resources/*',
        description: 'Message loads or references a bundled resource.',
        constraints: [],
      },
      {
        id: 'provides_context',
        from: 'contexts/*',
        to: 'messages/*',
        description: 'Context contributes content to a compiled message.',
        constraints: [],
      },
      {
        id: 'requires',
        from: 'messages/*',
        to: 'dependencies/*',
        description: 'Message requires an external runtime capability.',
        constraints: [],
      },
      {
        id: 'uses_output_schema',
        from: 'output',
        to: 'resources/*',
        description: 'Output resolves its JSON Schema from a bundled resource.',
        constraints: ['blocking'],
      },
      {
        id: 'verifies_message',
        from: 'checks/*',
        to: 'messages/*',
        description: 'Deterministic check validates a compiled message.',
        constraints: ['blocking'],
      },
      {
        id: 'verifies_output',
        from: 'checks/*',
        to: 'output',
        description: 'Deterministic check validates the output contract.',
        constraints: ['blocking'],
      },
      {
        id: 'evaluates',
        from: 'evals/*',
        to: 'messages/*',
        description: 'Model evaluation covers behavior driven by a message.',
        constraints: ['non-blocking quality signal'],
      },
    ],
    canonicalYaml: `yschema: "0.1"
name: t3x/prompt
version: "v1"
description: Portable, typed, and testable contract for one model invocation.
strict: true
nodes:
  manifest:
    required: true
    required_slots: [name, summary]
  contract:
    required: true
    required_slots: [goal, inputs, outputs, non_goals, truth_policy]
  variables:
    required: true
    repeated: true
    required_slots: [value_type, required, source, description, on_missing]
  messages:
    required: true
    repeated: true
    required_slots: [sequence, role, template, purpose, optional, on_missing_variable]
  contexts:
    repeated: true
    required_slots: [kind, required, load_policy, placement, on_empty]
  runtime:
    required: true
    required_slots: [mode, response_format, streaming, tool_policy]
  output:
    required: true
    required_slots: [format, strict, on_parse_failure]
  resources:
    repeated: true
    required_slots: [kind, path, description, load_policy]
  dependencies:
    repeated: true
    required_slots: [kind, identifier, required, permissions]
  checks:
    required: true
    repeated: true
    required_slots: [kind, run_when, blocking]
  evals:
    repeated: true
    required_slots: [kind, fixture_resource, assertions]
relation_types:
  precedes: { from: messages/*, to: messages/*, acyclic: true }
  uses_variable: { from: messages/*, to: variables/* }
  uses_resource: { from: messages/*, to: resources/* }
  provides_context: { from: contexts/*, to: messages/* }
  requires: { from: messages/*, to: dependencies/* }
  uses_output_schema: { from: output, to: resources/* }
  verifies_message: { from: checks/*, to: messages/* }
  verifies_output: { from: checks/*, to: output }
  evaluates: { from: evals/*, to: messages/* }
rules:
  - id: prompt.placeholders_declared
  - id: prompt.required_variables_used
  - id: prompt.message_sequence_unique
  - id: prompt.resources_resolvable
  - id: prompt.output_schema_resolvable
  - id: prompt.blocking_check_required`,
    changesBaseReleaseId: '',
    changes: [],
  },
];

const esphomeDeviceSchemaReleases: SchemaReleasePreview[] = [
  {
    id: ESPHOME_DEVICE_V1_RELEASE_ID,
    projectId: 'preview_project',
    name: 'ESPHome Device',
    version: 'v1',
    description:
      'Supported ESPHome device configuration subset for config validation and extra checks.',
    status: 'active',
    runtimeAvailable: true,
    releasedAt: '2026-07-30T00:00:00.000Z',
    releasedBy: 'T3X',
    usedByCommitCount: 0,
    usedByWorkspaceCount: 0,
    breakingChangeLevel: 'none',
    source: 'official',
    category: 'Device runtime',
    rootKey: 'device',
    requiredFields: ['esphome.name', 'esp32.board'],
    compatibleWith: ['YSchema validation', 'ESPHome config', 'Extra checks'],
    migrationSummary:
      'Current ESPHome Device contract. YAML source is materialized into device state before local ESPHome config checks.',
    canonicalName: 't3x/esphome-device',
    schemaHash: 'sha256:4dadbf6d65b4bd1f0310be317b9b0cfb90edfbcf293fe1d8bc60a0b07f05675d',
    updatedLabel: '2026-07-30',
    structure: [
      {
        path: 'esphome',
        type: 'object',
        required: true,
        constraint: 'core device identity',
        depth: 0,
      },
      {
        path: 'esphome.name',
        type: 'string',
        required: true,
        constraint: 'lowercase device id, max 24 chars',
        constraintTags: ['pattern'],
        depth: 1,
      },
      {
        path: 'esphome.friendly_name',
        type: 'string',
        required: false,
        constraint: 'human-readable name',
        depth: 1,
      },
      {
        path: 'esp32',
        type: 'object',
        required: true,
        constraint: 'ESP32 target configuration',
        depth: 0,
      },
      {
        path: 'esp32.board',
        type: 'string',
        required: true,
        constraint: 'ESPHome board id',
        depth: 1,
      },
      {
        path: 'wifi',
        type: 'object',
        required: false,
        constraint: 'local credential references',
        depth: 0,
      },
      {
        path: 'logger',
        type: 'object',
        required: false,
        constraint: 'ESPHome logger options',
        depth: 0,
      },
      {
        path: 'api',
        type: 'object',
        required: false,
        constraint: 'native ESPHome API options',
        depth: 0,
      },
    ],
    rules: [],
    relationTypes: [],
    canonicalYaml: `yschema: "0.1"
name: t3x/esphome-device
version: "v1"
description: Supported ESPHome device configuration subset for the T3X reference workflow.
strict: false
nodes:
  esphome:
    required: true
    required_slots: [name]
  esp32:
    required: true
    required_slots: [board]
  wifi:
    required: false
    required_slots: [ssid, password]
  logger:
    required: false
  api:
    required: false
rules: []`,
    changesBaseReleaseId: '',
    changes: [],
  },
];

const schemaFamilies: SchemaFamilyPreview[] = [
  {
    id: 'prd',
    name: 'PRD Schema',
    canonicalName: 't3x/prd',
    description: 'Product requirements, source-backed summaries, and acceptance contracts.',
    releases: prdSchemaReleases,
  },
  {
    id: 'skill',
    name: 'Skill Schema',
    canonicalName: 't3x/skill',
    description: 'Portable agent capabilities, workflow routing, resources, checks, and evals.',
    releases: skillSchemaReleases,
  },
  {
    id: 'prompt',
    name: 'Prompt Schema',
    canonicalName: 't3x/prompt',
    description: 'Typed messages, variables, resources, output contracts, checks, and evals.',
    releases: promptSchemaReleases,
  },
  {
    id: 'esphome-device',
    name: 'ESPHome Device',
    canonicalName: 't3x/esphome-device',
    description: 'ESPHome device YAML state for config validation and local runtime checks.',
    releases: esphomeDeviceSchemaReleases,
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

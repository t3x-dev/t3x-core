import type { YSchema } from './types';

export const normalizedT3xSkillYSchema: YSchema = {
  yschema: '0.1',
  name: 't3x/skill',
  version: 'v1',
  description: 'Portable workflow-routed agent skill with deterministic delivery checks.',
  strict: true,
  nodes: {
    manifest: {
      required: true,
      contentKind: 'structured',
      description: 'Stable identity and discovery metadata for the skill.',
      requiredSlots: ['name', 'summary'],
      slots: {
        name: {
          type: 'string',
          pattern: '^[a-z0-9]+(?:-[a-z0-9]+)*$',
          maxLength: 64,
          provenanceRequired: true,
          description: 'Lowercase hyphen-case skill name.',
          gapQuestion: 'What concise, action-oriented name should identify this skill?',
        },
        summary: {
          type: 'string',
          maxWords: 60,
          provenanceRequired: true,
          description:
            'Portable capability summary; host trigger text is generated with activation boundaries.',
          gapQuestion: 'What portable capability does this skill provide?',
        },
      },
    },
    activation: {
      required: true,
      contentKind: 'structured',
      description: 'Positive and negative activation boundaries.',
      requiredSlots: ['implicit', 'should_trigger', 'should_not_trigger'],
      slots: {
        implicit: {
          type: 'boolean',
          description: 'Whether the host may activate the skill without an explicit mention.',
        },
        should_trigger: {
          type: 'array',
          provenanceRequired: true,
          description: 'Concrete user requests that should activate the skill.',
          gapQuestion: 'Give at least one request that should trigger this skill.',
        },
        should_not_trigger: {
          type: 'array',
          provenanceRequired: true,
          description: 'Nearby requests that should not activate the skill.',
          gapQuestion: 'Give at least one similar request that should not trigger this skill.',
        },
      },
    },
    contract: {
      required: true,
      contentKind: 'structured',
      description: 'Inputs, outputs, boundaries, and truth policy.',
      requiredSlots: ['goal', 'inputs', 'outputs', 'non_goals', 'truth_policy'],
      slots: {
        goal: {
          type: 'string',
          maxWords: 80,
          provenanceRequired: true,
          gapQuestion: 'What concrete outcome should this skill produce?',
        },
        inputs: {
          type: 'array',
          provenanceRequired: true,
          gapQuestion: 'What inputs does this skill require or accept?',
        },
        outputs: {
          type: 'array',
          provenanceRequired: true,
          gapQuestion: 'What outputs should this skill produce?',
        },
        non_goals: {
          type: 'array',
          provenanceRequired: true,
          gapQuestion: 'What adjacent work is explicitly outside this skill?',
        },
        truth_policy: {
          enum: ['evidence_only', 'approved_inference', 'open_generation'],
          description: 'How generated claims must be grounded or approved.',
        },
        default_freedom: {
          enum: ['high', 'medium', 'low'],
          description:
            'Optional authoring default; every instruction still declares its own freedom.',
        },
      },
    },
    workflows: {
      required: true,
      repeated: true,
      contentKind: 'structured',
      description:
        'Routable capability modes that own steps, resources, dependencies, and failure behavior.',
      requiredSlots: [
        'title',
        'kind',
        'when',
        'output_formats',
        'persistence',
        'on_empty',
        'on_failure',
      ],
      slots: {
        title: { type: 'string', maxWords: 16, provenanceRequired: true },
        kind: { enum: ['primary', 'supporting', 'persistence', 'review'] },
        when: {
          type: 'string',
          maxWords: 60,
          provenanceRequired: true,
          description: 'Concrete routing condition for choosing this workflow.',
        },
        output_formats: { type: 'array' },
        persistence: { enum: ['none', 'optional', 'required'] },
        on_empty: { enum: ['continue', 'use_builtin_defaults', 'ask_user', 'report_and_stop'] },
        on_failure: { enum: ['continue', 'fallback', 'ask_user', 'report_and_stop'] },
        fallback_workflow: {
          type: 'string',
          pattern: '^[a-z0-9]+(?:_[a-z0-9]+)*$',
        },
      },
    },
    instructions: {
      required: true,
      repeated: true,
      contentKind: 'structured',
      description: 'Ordered executable guidance for the agent.',
      contentGuidance: 'Keep core instructions concise and move detailed material into resources.',
      requiredSlots: [
        'sequence',
        'kind',
        'title',
        'body',
        'freedom',
        'effect',
        'approval',
        'success_criteria',
      ],
      slots: {
        sequence: {
          type: 'integer',
          minimum: 1,
          description: 'Stable display and execution order.',
        },
        kind: {
          enum: [
            'principle',
            'procedure',
            'constraint',
            'output_format',
            'example',
            'verification',
            'recovery',
          ],
        },
        title: {
          type: 'string',
          maxWords: 16,
          provenanceRequired: true,
        },
        body: {
          type: 'string',
          provenanceRequired: true,
          description: 'Concise imperative instruction.',
          gapQuestion: 'What should the agent do at this step?',
        },
        freedom: { enum: ['high', 'medium', 'low'] },
        effect: { enum: ['none', 'read', 'write', 'external'] },
        approval: { enum: ['none', 'before_write', 'before_external'] },
        success_criteria: { type: 'array' },
        on_failure: { type: 'string' },
      },
    },
    resources: {
      required: false,
      repeated: true,
      contentKind: 'structured',
      description:
        'Scripts, data, references, assets, and templates with explicit context-loading policy.',
      requiredSlots: ['kind', 'path', 'description', 'load_policy', 'use_when'],
      slots: {
        kind: { enum: ['script', 'data', 'reference', 'asset', 'template'] },
        path: {
          type: 'string',
          pattern: '^(?![A-Za-z]:)(?!/)(?!.*(?:^|/)\\.\\.(?:/|$)).+$',
          description: 'Safe relative path inside the generated skill bundle.',
        },
        use_when: { type: 'string', maxWords: 60 },
        description: { type: 'string', maxWords: 60 },
        load_policy: { enum: ['always', 'on_demand', 'execute_only', 'output_only'] },
        media_type: { type: 'string' },
        source_url: { type: 'string', format: 'uri' },
        revision: { type: 'string' },
        content_hash: { type: 'string', pattern: '^sha256:[a-f0-9]{64}$' },
      },
    },
    dependencies: {
      required: false,
      repeated: true,
      contentKind: 'structured',
      description: 'External capabilities required by instructions.',
      requiredSlots: ['kind', 'identifier', 'required', 'permissions'],
      slots: {
        kind: { enum: ['tool', 'mcp', 'plugin', 'runtime', 'package'] },
        identifier: { type: 'string' },
        required: { type: 'boolean' },
        permissions: { type: 'array' },
        description: { type: 'string' },
        version_constraint: { type: 'string' },
        use_when: { type: 'string' },
      },
    },
    checks: {
      required: true,
      repeated: true,
      contentKind: 'structured',
      description: 'Deterministic commands, smoke tests, and human-verifiable delivery checklists.',
      requiredSlots: ['kind', 'run_when', 'blocking'],
      slots: {
        kind: { enum: ['command', 'checklist', 'smoke_test'] },
        run_when: {
          enum: ['preflight', 'before_workflow', 'after_workflow', 'pre_export', 'before_delivery'],
        },
        blocking: { type: 'boolean' },
        command_resource: { type: 'string' },
        assertions: { type: 'array' },
        success_criteria: { type: 'array' },
      },
    },
    evals: {
      required: false,
      repeated: true,
      contentKind: 'structured',
      description: 'Triggering, behavior, and safety checks for the skill.',
      requiredSlots: ['kind', 'prompt', 'assertions'],
      slots: {
        kind: { enum: ['trigger_positive', 'trigger_negative', 'behavior', 'safety'] },
        prompt: { type: 'string', provenanceRequired: true },
        expected_output: { type: 'string' },
        assertions: { type: 'array' },
        files: { type: 'array' },
      },
    },
  },
  relationTypes: {
    has_step: {
      from: 'workflows/*',
      to: 'instructions/*',
      description: 'Workflow owns an ordered instruction step.',
    },
    precedes: {
      from: 'instructions/*',
      to: 'instructions/*',
      description: 'Source instruction must execute before target instruction.',
      acyclic: true,
    },
    workflow_uses_resource: {
      from: 'workflows/*',
      to: 'resources/*',
      description: 'Workflow routes to a bundled resource.',
    },
    instruction_uses_resource: {
      from: 'instructions/*',
      to: 'resources/*',
      description: 'Instruction loads or executes a bundled resource.',
    },
    requires: {
      from: 'workflows/*',
      to: 'dependencies/*',
      description: 'Workflow requires an external capability.',
    },
    verifies: {
      from: 'checks/*',
      to: 'workflows/*',
      description: 'Deterministic check gates a workflow.',
    },
  },
  rules: [
    {
      id: 'implicit-trigger-examples',
      description: 'Implicit skills require positive and negative trigger examples.',
    },
    {
      id: 'generated-trigger-description',
      description:
        'Exported host description is generated from manifest summary and activation boundaries.',
    },
    {
      id: 'workflow-routing',
      description:
        'Every workflow owns steps and every instruction belongs to at least one workflow.',
    },
    {
      id: 'resource-load-policy',
      description:
        'Resource use must honor always, on-demand, execute-only, or output-only loading.',
    },
    {
      id: 'low-freedom-verification',
      description: 'Low-freedom instructions require deterministic success criteria.',
    },
    {
      id: 'side-effect-approval',
      description: 'Write and external effects require an explicit approval gate.',
    },
    {
      id: 'deterministic-check-gate',
      description:
        'Every workflow requires a blocking deterministic check before export or delivery.',
    },
    {
      id: 'publish-eval-coverage',
      description: 'Ready skills also require non-deterministic behavior evaluation coverage.',
    },
  ],
};

export const validSkillCandidateTree = {
  manifest: {
    name: 'review-code',
    summary: 'Review code changes for defects, regressions, and missing tests.',
  },
  activation: {
    implicit: true,
    should_trigger: ['Review this pull request for defects.'],
    should_not_trigger: ['Implement the feature described in this issue.'],
  },
  contract: {
    goal: 'Produce an evidence-backed review ordered by severity.',
    inputs: ['Repository changes', 'Project instructions'],
    outputs: ['Actionable findings', 'Verification summary'],
    non_goals: ['Implement fixes without an explicit request'],
    truth_policy: 'evidence_only',
    default_freedom: 'medium',
  },
  workflows: {
    review_changes: {
      title: 'Review changes',
      kind: 'primary',
      when: 'Reviewing a patch, pull request, or committed change for defects.',
      output_formats: ['markdown'],
      persistence: 'none',
      on_empty: 'continue',
      on_failure: 'report_and_stop',
    },
    pre_delivery_review: {
      title: 'Review delivery',
      kind: 'review',
      when: 'Preparing the final review response for delivery.',
      output_formats: ['markdown'],
      persistence: 'none',
      on_empty: 'report_and_stop',
      on_failure: 'report_and_stop',
    },
  },
  instructions: {
    inspect_changes: {
      sequence: 1,
      kind: 'procedure',
      title: 'Inspect changes',
      body: 'Read the diff and the surrounding implementation before reporting findings.',
      freedom: 'medium',
      effect: 'read',
      approval: 'none',
      success_criteria: ['Every finding points to changed code or a concrete regression path.'],
    },
    verify_findings: {
      sequence: 2,
      kind: 'verification',
      title: 'Verify findings',
      body: 'Run focused checks that can confirm or falsify each suspected defect.',
      freedom: 'low',
      effect: 'read',
      approval: 'none',
      success_criteria: ['Unverified suspicions are omitted or explicitly qualified.'],
    },
  },
  resources: {
    review_policy: {
      kind: 'reference',
      path: 'references/review-policy.md',
      description: 'Severity and evidence policy for actionable review findings.',
      load_policy: 'on_demand',
      use_when: 'Read when severity or review scope is ambiguous.',
    },
    severity_rules: {
      kind: 'data',
      path: 'data/severity-rules.csv',
      description: 'Structured severity rules used by the review workflow.',
      load_policy: 'on_demand',
      media_type: 'text/csv',
      use_when: 'Search when classifying a suspected defect.',
    },
    validate_review: {
      kind: 'script',
      path: 'scripts/validate-review.py',
      description: 'Deterministically validates the review output structure.',
      load_policy: 'execute_only',
      media_type: 'text/x-python',
      use_when: 'Execute before exporting the final review.',
    },
  },
  dependencies: {
    git: {
      kind: 'tool',
      identifier: 'git',
      required: true,
      permissions: ['read_repository'],
      description: 'Read repository history and changed files.',
      use_when: 'Inspecting the review target and its parents.',
    },
  },
  checks: {
    validate_review_output: {
      kind: 'command',
      run_when: 'pre_export',
      blocking: true,
      command_resource: 'scripts/validate-review.py',
      success_criteria: ['exit_code == 0'],
    },
    delivery_checklist: {
      kind: 'checklist',
      run_when: 'before_delivery',
      blocking: true,
      assertions: [
        'Every finding cites a concrete path.',
        'Verification results and limitations are reported.',
      ],
    },
  },
  evals: {
    finds_regression: {
      kind: 'behavior',
      prompt: 'Review a patch that removes authorization from a protected route.',
      expected_output: 'Report the authorization regression as a high-severity finding.',
      assertions: ['Mentions unauthorized access', 'Points to the changed route'],
      files: [],
    },
    positive_trigger: {
      kind: 'trigger_positive',
      prompt: 'Review this pull request for defects.',
      assertions: ['Skill activates'],
      files: [],
    },
    negative_trigger: {
      kind: 'trigger_negative',
      prompt: 'Implement this feature.',
      assertions: ['Skill does not activate'],
      files: [],
    },
  },
} as const;

export const validSkillRelations = [
  {
    type: 'has_step',
    from: 'workflows/review_changes',
    to: 'instructions/inspect_changes',
  },
  {
    type: 'has_step',
    from: 'workflows/review_changes',
    to: 'instructions/verify_findings',
  },
  {
    type: 'has_step',
    from: 'workflows/pre_delivery_review',
    to: 'instructions/verify_findings',
  },
  {
    type: 'precedes',
    from: 'instructions/inspect_changes',
    to: 'instructions/verify_findings',
  },
  {
    type: 'workflow_uses_resource',
    from: 'workflows/review_changes',
    to: 'resources/severity_rules',
  },
  {
    type: 'instruction_uses_resource',
    from: 'instructions/inspect_changes',
    to: 'resources/review_policy',
  },
  {
    type: 'requires',
    from: 'workflows/review_changes',
    to: 'dependencies/git',
  },
  {
    type: 'verifies',
    from: 'checks/validate_review_output',
    to: 'workflows/review_changes',
  },
  {
    type: 'verifies',
    from: 'checks/delivery_checklist',
    to: 'workflows/pre_delivery_review',
  },
] as const;

export const t3xSkillP0Fixtures = {
  normalizedYSchema: normalizedT3xSkillYSchema,
  validCandidateTree: validSkillCandidateTree,
  validRelations: validSkillRelations,
} as const;

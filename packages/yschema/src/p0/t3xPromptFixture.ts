import type { YSchema } from './types';

export const normalizedT3xPromptYSchema: YSchema = {
  yschema: '0.1',
  name: 't3x/prompt',
  version: 'v1',
  description: 'Portable, typed, and testable contract for one model invocation.',
  strict: true,
  nodes: {
    manifest: {
      required: true,
      contentKind: 'structured',
      description: 'Stable identity and discovery metadata for the prompt.',
      requiredSlots: ['name', 'summary'],
      slots: {
        name: {
          type: 'string',
          pattern: '^[a-z0-9]+(?:-[a-z0-9]+)*$',
          maxLength: 64,
          provenanceRequired: true,
          description: 'Lowercase hyphen-case prompt name.',
          gapQuestion: 'What concise name should identify this prompt?',
        },
        summary: {
          type: 'string',
          maxWords: 60,
          provenanceRequired: true,
          description: 'Portable summary of the model invocation.',
          gapQuestion: 'What model task does this prompt perform?',
        },
      },
    },
    contract: {
      required: true,
      contentKind: 'structured',
      description: 'Goal, inputs, outputs, boundaries, and truth policy.',
      requiredSlots: ['goal', 'inputs', 'outputs', 'non_goals', 'truth_policy'],
      slots: {
        goal: {
          type: 'string',
          maxWords: 80,
          provenanceRequired: true,
          gapQuestion: 'What concrete outcome should this prompt produce?',
        },
        inputs: {
          type: 'array',
          minLength: 1,
          provenanceRequired: true,
          gapQuestion: 'What inputs does this prompt accept?',
        },
        outputs: {
          type: 'array',
          minLength: 1,
          provenanceRequired: true,
          gapQuestion: 'What outputs must this prompt produce?',
        },
        non_goals: {
          type: 'array',
          provenanceRequired: true,
          gapQuestion: 'What work is explicitly outside this prompt?',
        },
        truth_policy: {
          enum: ['evidence_only', 'approved_inference', 'open_generation'],
          description: 'How generated claims must be grounded or approved.',
        },
      },
    },
    variables: {
      required: true,
      repeated: true,
      contentKind: 'structured',
      description: 'Typed template inputs and their resolution behavior.',
      requiredSlots: ['value_type', 'required', 'source', 'description', 'on_missing'],
      slots: {
        value_type: { enum: ['string', 'number', 'integer', 'boolean', 'array', 'object'] },
        required: { type: 'boolean' },
        source: { enum: ['user', 'context', 'runtime', 'default'] },
        description: { type: 'string', maxWords: 40, provenanceRequired: true },
        default_value: {
          description: 'Optional default whose type is checked by the Prompt compiler.',
        },
        enum_values: { type: 'array' },
        value_pattern: {
          type: 'string',
          description: 'Optional regex applied to resolved string values by the Prompt compiler.',
        },
        sensitive: { type: 'boolean', default: false },
        on_missing: { enum: ['ask_user', 'use_default', 'use_empty', 'report_and_stop'] },
      },
    },
    messages: {
      required: true,
      repeated: true,
      contentKind: 'structured',
      description: 'Ordered text messages compiled for one model invocation.',
      requiredSlots: ['sequence', 'role', 'template', 'purpose', 'optional', 'on_missing_variable'],
      slots: {
        sequence: { type: 'integer', minimum: 1 },
        role: { enum: ['system', 'developer', 'user', 'assistant'] },
        template: {
          type: 'string',
          minLength: 1,
          provenanceRequired: true,
          description: 'Text template using declared double-brace variables.',
          gapQuestion: 'What message content should be compiled at this position?',
        },
        purpose: { type: 'string', maxWords: 40, provenanceRequired: true },
        optional: { type: 'boolean' },
        condition: { type: 'string' },
        on_missing_variable: {
          enum: ['omit_message', 'use_empty', 'ask_user', 'report_and_stop'],
        },
      },
    },
    contexts: {
      required: false,
      repeated: true,
      contentKind: 'structured',
      description: 'Runtime context sources and explicit loading budgets.',
      requiredSlots: ['kind', 'required', 'load_policy', 'placement', 'on_empty'],
      slots: {
        kind: { enum: ['static', 'retrieval', 'conversation', 'runtime'] },
        required: { type: 'boolean' },
        load_policy: { enum: ['always', 'on_demand'] },
        placement: { enum: ['before_system', 'after_system', 'before_user', 'inline'] },
        max_tokens: { type: 'integer', minimum: 1 },
        resource_key: { type: 'string', pattern: '^[a-z][a-z0-9_]*$' },
        on_empty: { enum: ['continue', 'use_default', 'ask_user', 'report_and_stop'] },
      },
    },
    runtime: {
      required: true,
      contentKind: 'structured',
      description: 'Portable runtime requirements resolved by a host adapter.',
      requiredSlots: ['mode', 'response_format', 'streaming', 'tool_policy'],
      slots: {
        mode: { enum: ['chat', 'completion'] },
        response_format: { enum: ['text', 'markdown', 'json', 'json_schema'] },
        streaming: { type: 'boolean' },
        tool_policy: { enum: ['none', 'optional', 'required'] },
        max_output_tokens: { type: 'integer', minimum: 1 },
      },
    },
    output: {
      required: true,
      contentKind: 'structured',
      description: 'Response parsing contract and deterministic failure behavior.',
      requiredSlots: ['format', 'strict', 'on_parse_failure'],
      slots: {
        format: { enum: ['text', 'markdown', 'json', 'json_schema'] },
        schema_resource: { type: 'string', pattern: '^[a-z][a-z0-9_]*$' },
        strict: { type: 'boolean' },
        on_parse_failure: { enum: ['retry_once', 'return_raw', 'report_and_stop'] },
        max_retries: { type: 'integer', minimum: 0, maximum: 3 },
      },
    },
    resources: {
      required: false,
      repeated: true,
      contentKind: 'structured',
      description: 'Bundled schemas, fixtures, data, references, and templates.',
      requiredSlots: ['kind', 'path', 'description', 'load_policy'],
      slots: {
        kind: { enum: ['schema', 'fixture', 'data', 'reference', 'template'] },
        path: {
          type: 'string',
          pattern: '^(?![A-Za-z]:)(?!/)(?!.*(?:^|/)\\.\\.(?:/|$)).+$',
          description: 'Safe relative path inside the prompt bundle.',
        },
        description: { type: 'string', maxWords: 60 },
        load_policy: { enum: ['always', 'on_demand', 'execute_only', 'output_only'] },
        media_type: { type: 'string' },
        content_hash: { type: 'string', pattern: '^sha256:[a-f0-9]{64}$' },
      },
    },
    dependencies: {
      required: false,
      repeated: true,
      contentKind: 'structured',
      description: 'External capabilities required to compile or execute messages.',
      requiredSlots: ['kind', 'identifier', 'required', 'permissions'],
      slots: {
        kind: { enum: ['tool', 'mcp', 'plugin', 'runtime', 'package'] },
        identifier: { type: 'string' },
        required: { type: 'boolean' },
        permissions: { type: 'array' },
        description: { type: 'string' },
        version_constraint: { type: 'string' },
      },
    },
    checks: {
      required: true,
      repeated: true,
      contentKind: 'structured',
      description:
        'Deterministic gates for compiling, exporting, running, or committing the prompt.',
      requiredSlots: ['kind', 'run_when', 'blocking'],
      slots: {
        kind: { enum: ['template_compile', 'fixture_render', 'output_schema', 'checklist'] },
        run_when: { enum: ['preflight', 'pre_compile', 'post_compile', 'pre_run', 'pre_commit'] },
        blocking: { type: 'boolean' },
        fixture_resource: { type: 'string', pattern: '^[a-z][a-z0-9_]*$' },
        assertions: { type: 'array' },
        success_criteria: { type: 'array' },
      },
    },
    evals: {
      required: false,
      repeated: true,
      contentKind: 'structured',
      description: 'Non-deterministic behavior, quality, safety, and regression evaluations.',
      requiredSlots: ['kind', 'fixture_resource', 'assertions'],
      slots: {
        kind: { enum: ['behavior', 'quality', 'safety', 'regression'] },
        fixture_resource: { type: 'string', pattern: '^[a-z][a-z0-9_]*$' },
        expected_output: { type: 'string' },
        assertions: { type: 'array' },
        minimum_score: { type: 'number', minimum: 0, maximum: 1 },
      },
    },
  },
  relationTypes: {
    precedes: {
      from: 'messages/*',
      to: 'messages/*',
      description: 'Source message must be compiled before target message.',
      acyclic: true,
    },
    uses_variable: {
      from: 'messages/*',
      to: 'variables/*',
      description: 'Message template references a declared variable.',
    },
    uses_resource: {
      from: 'messages/*',
      to: 'resources/*',
      description: 'Message loads or references a bundled resource.',
    },
    provides_context: {
      from: 'contexts/*',
      to: 'messages/*',
      description: 'Context source contributes content to a message.',
    },
    requires: {
      from: 'messages/*',
      to: 'dependencies/*',
      description: 'Message requires an external runtime capability.',
    },
    uses_output_schema: {
      from: 'output',
      to: 'resources/*',
      description: 'Output contract resolves its schema from a bundled resource.',
    },
    verifies_message: {
      from: 'checks/*',
      to: 'messages/*',
      description: 'Deterministic check validates a compiled message.',
    },
    verifies_output: {
      from: 'checks/*',
      to: 'output',
      description: 'Deterministic check validates the output contract.',
    },
    evaluates: {
      from: 'evals/*',
      to: 'messages/*',
      description: 'Model evaluation covers behavior driven by a message.',
    },
  },
  rules: [
    {
      id: 'prompt.placeholders_declared',
      description: 'Every template placeholder must resolve to a declared variable.',
    },
    {
      id: 'prompt.required_variables_used',
      description: 'Every required variable must be referenced by at least one message.',
    },
    {
      id: 'prompt.message_sequence_unique',
      description: 'Message sequence values must be unique and compile in ascending order.',
    },
    {
      id: 'prompt.resources_resolvable',
      description: 'Referenced context, fixture, and message resources must exist.',
    },
    {
      id: 'prompt.output_schema_resolvable',
      description: 'JSON Schema output must resolve to a schema resource.',
    },
    {
      id: 'prompt.blocking_check_required',
      description: 'A ready prompt requires a blocking compile or output check.',
    },
  ],
};

export const validPromptCandidateTree = {
  manifest: {
    name: 'extract-requirements',
    summary: 'Extract source-backed product requirements into a strict JSON response.',
  },
  contract: {
    goal: 'Produce structured requirements grounded in the supplied source material.',
    inputs: ['User request', 'Source material'],
    outputs: ['JSON object matching the bundled response schema'],
    non_goals: ['Invent requirements absent from the supplied evidence'],
    truth_policy: 'evidence_only',
  },
  variables: {
    user_request: {
      value_type: 'string',
      required: true,
      source: 'user',
      description: 'The product request to analyze.',
      on_missing: 'ask_user',
      sensitive: false,
    },
    source_material: {
      value_type: 'string',
      required: true,
      source: 'context',
      description: 'Evidence used to ground extracted requirements.',
      on_missing: 'report_and_stop',
      sensitive: false,
    },
    response_style: {
      value_type: 'string',
      required: false,
      source: 'default',
      description: 'Requested response style.',
      default_value: 'concise',
      enum_values: ['concise', 'detailed'],
      value_pattern: '^(concise|detailed)$',
      on_missing: 'use_default',
      sensitive: false,
    },
  },
  messages: {
    system_policy: {
      sequence: 1,
      role: 'system',
      template:
        'Extract only source-backed requirements. Use the {{response_style}} response style.',
      purpose: 'Establish grounding and output behavior.',
      optional: false,
      on_missing_variable: 'report_and_stop',
    },
    user_task: {
      sequence: 2,
      role: 'user',
      template: 'Request:\n{{user_request}}\n\nSource material:\n{{source_material}}',
      purpose: 'Supply the task and its supporting evidence.',
      optional: false,
      on_missing_variable: 'report_and_stop',
    },
  },
  contexts: {
    project_sources: {
      kind: 'retrieval',
      required: true,
      load_policy: 'on_demand',
      placement: 'before_user',
      max_tokens: 6000,
      resource_key: 'basic_fixture',
      on_empty: 'report_and_stop',
    },
  },
  runtime: {
    mode: 'chat',
    response_format: 'json_schema',
    streaming: false,
    tool_policy: 'none',
    max_output_tokens: 2000,
  },
  output: {
    format: 'json_schema',
    schema_resource: 'response_schema',
    strict: true,
    on_parse_failure: 'report_and_stop',
    max_retries: 0,
  },
  resources: {
    response_schema: {
      kind: 'schema',
      path: 'schemas/requirements-response.json',
      description: 'JSON Schema for the structured requirements response.',
      load_policy: 'output_only',
      media_type: 'application/schema+json',
    },
    basic_fixture: {
      kind: 'fixture',
      path: 'fixtures/basic-extraction.json',
      description: 'Deterministic inputs used for render and behavior tests.',
      load_policy: 'on_demand',
      media_type: 'application/json',
    },
    extraction_policy: {
      kind: 'reference',
      path: 'references/extraction-policy.md',
      description: 'Grounding policy referenced by the system message.',
      load_policy: 'on_demand',
      media_type: 'text/markdown',
    },
  },
  dependencies: {
    json_schema_adapter: {
      kind: 'runtime',
      identifier: 'json-schema-response',
      required: true,
      permissions: [],
      description: 'Host adapter capable of strict JSON Schema responses.',
      version_constraint: '>=1',
    },
  },
  checks: {
    compile_templates: {
      kind: 'template_compile',
      run_when: 'pre_compile',
      blocking: true,
      fixture_resource: 'basic_fixture',
      success_criteria: ['No unresolved template variables remain.'],
    },
    validate_output: {
      kind: 'output_schema',
      run_when: 'post_compile',
      blocking: true,
      assertions: ['The output schema resource resolves.'],
      success_criteria: ['Compiled output accepts only schema-valid JSON.'],
    },
  },
  evals: {
    extracts_requirements: {
      kind: 'behavior',
      fixture_resource: 'basic_fixture',
      expected_output: 'A JSON object containing only source-backed requirements.',
      assertions: ['Output matches the response schema', 'Every requirement is source-backed'],
      minimum_score: 0.9,
    },
  },
} as const;

export const promptCandidateWithGaps = {
  ...validPromptCandidateTree,
  contract: {
    goal: validPromptCandidateTree.contract.goal,
    inputs: validPromptCandidateTree.contract.inputs,
    non_goals: validPromptCandidateTree.contract.non_goals,
    truth_policy: validPromptCandidateTree.contract.truth_policy,
  },
} as const;

export const promptCandidateWithHardErrors = {
  ...validPromptCandidateTree,
  manifest: {
    ...validPromptCandidateTree.manifest,
    name: 'Extract Requirements',
  },
  variables: {
    ...validPromptCandidateTree.variables,
    user_request: {
      ...validPromptCandidateTree.variables.user_request,
      required: 'yes',
    },
  },
  messages: {
    ...validPromptCandidateTree.messages,
    user_task: {
      ...validPromptCandidateTree.messages.user_task,
      role: 'operator',
    },
  },
} as const;

export const validPromptRelations = [
  { type: 'precedes', from: 'messages/system_policy', to: 'messages/user_task' },
  {
    type: 'uses_variable',
    from: 'messages/system_policy',
    to: 'variables/response_style',
  },
  { type: 'uses_variable', from: 'messages/user_task', to: 'variables/user_request' },
  { type: 'uses_variable', from: 'messages/user_task', to: 'variables/source_material' },
  {
    type: 'uses_resource',
    from: 'messages/system_policy',
    to: 'resources/extraction_policy',
  },
  {
    type: 'provides_context',
    from: 'contexts/project_sources',
    to: 'messages/user_task',
  },
  {
    type: 'requires',
    from: 'messages/user_task',
    to: 'dependencies/json_schema_adapter',
  },
  { type: 'uses_output_schema', from: 'output', to: 'resources/response_schema' },
  {
    type: 'verifies_message',
    from: 'checks/compile_templates',
    to: 'messages/system_policy',
  },
  {
    type: 'verifies_message',
    from: 'checks/compile_templates',
    to: 'messages/user_task',
  },
  { type: 'verifies_output', from: 'checks/validate_output', to: 'output' },
  {
    type: 'evaluates',
    from: 'evals/extracts_requirements',
    to: 'messages/user_task',
  },
] as const;

export const t3xPromptP0Fixtures = {
  normalizedYSchema: normalizedT3xPromptYSchema,
  validCandidateTree: validPromptCandidateTree,
  candidateWithGaps: promptCandidateWithGaps,
  candidateWithHardErrors: promptCandidateWithHardErrors,
  validRelations: validPromptRelations,
} as const;

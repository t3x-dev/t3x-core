import { type ProvenanceIndex, t3xPromptP0Fixtures } from '@t3x-dev/yschema';
import { describe, expect, it } from 'vitest';
import {
  compilePrompt,
  parsePromptPlaceholders,
  renderPromptTemplate,
  serializeCompiledPrompt,
  validatePromptPolicy,
} from '..';

function acceptedEvidenceForLeaves(value: unknown, prefix = ''): ProvenanceIndex {
  if (value === null || value === undefined) return {};
  if (Array.isArray(value) || typeof value !== 'object') {
    return prefix
      ? {
          [prefix]: [{ origin: 'user_evidence', sourceId: `fixture:${prefix}` }],
        }
      : {};
  }

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).flatMap(([key, child]) =>
      Object.entries(acceptedEvidenceForLeaves(child, prefix ? `${prefix}/${key}` : key))
    )
  );
}

const responseSchema = JSON.stringify({
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  type: 'object',
  properties: {
    requirements: {
      type: 'array',
      items: {
        type: 'object',
        properties: { title: { type: 'string' } },
        required: ['title'],
      },
    },
  },
  required: ['requirements'],
  additionalProperties: false,
});

function validCompileInput() {
  const tree = t3xPromptP0Fixtures.validCandidateTree;
  return {
    tree,
    relations: t3xPromptP0Fixtures.validRelations,
    provenanceByPath: acceptedEvidenceForLeaves(tree),
    variableValues: {
      user_request: 'Extract the requirements for schema-backed prompt workspaces.',
    },
    contextContents: {
      project_sources: 'The source requires versioned prompts and deterministic validation.',
      source_material: 'The source requires versioned prompts and deterministic validation.',
    },
    resourceContents: {
      response_schema: responseSchema,
      extraction_policy: '# Extraction policy\nUse only supplied evidence.\n',
    },
  } as const;
}

describe('Prompt placeholders', () => {
  it('parses valid placeholders and reports malformed syntax deterministically', () => {
    expect(parsePromptPlaceholders('Hello {{ user_name }} {{bad-key}} {{open')).toEqual({
      placeholders: [
        {
          key: 'user_name',
          raw: '{{ user_name }}',
          start: 6,
          end: 21,
        },
      ],
      issues: [
        {
          offset: 22,
          raw: '{{bad-key}}',
          message: 'Placeholder {{bad-key}} must contain one snake_case variable key.',
        },
        {
          offset: 34,
          raw: '{{open',
          message: 'Placeholder starting at offset 34 is not valid double-brace syntax.',
        },
      ],
    });
  });

  it('renders scalar and structured values with stable serialization', () => {
    expect(
      renderPromptTemplate('{{title}} {{metadata}} {{missing}}', {
        title: 'Prompt',
        metadata: { z: 2, a: 1 },
      })
    ).toMatchObject({
      content: 'Prompt {"a":1,"z":2} {{missing}}',
      unresolvedKeys: ['missing'],
    });
  });
});

describe('validatePromptPolicy', () => {
  it('accepts the complete Prompt fixture', () => {
    expect(
      validatePromptPolicy(
        t3xPromptP0Fixtures.validCandidateTree,
        t3xPromptP0Fixtures.validRelations
      )
    ).toEqual({ valid: true, ready: true, errors: [], gaps: [] });
  });

  it('rejects undeclared variables at the message template path', () => {
    const tree = structuredClone(t3xPromptP0Fixtures.validCandidateTree) as Record<string, unknown>;
    const messages = tree.messages as Record<string, Record<string, unknown>>;
    messages.system_policy.template = `${String(messages.system_policy.template)} {{missing_input}}`;

    const result = validatePromptPolicy(tree, t3xPromptP0Fixtures.validRelations);

    expect(result.valid).toBe(false);
    expect(result.errors).toContainEqual({
      code: 'PROMPT_UNDECLARED_VARIABLE',
      path: 'messages/system_policy/template',
      message: 'Template variable missing_input is not declared.',
      source: 'policy',
      blocking: true,
      details: { variableKey: 'missing_input' },
    });
  });

  it('rejects duplicate message sequence values at a stable path', () => {
    const tree = structuredClone(t3xPromptP0Fixtures.validCandidateTree) as Record<string, unknown>;
    const messages = tree.messages as Record<string, Record<string, unknown>>;
    messages.user_task.sequence = 1;

    const result = validatePromptPolicy(tree, t3xPromptP0Fixtures.validRelations);

    expect(result.errors).toContainEqual({
      code: 'PROMPT_DUPLICATE_MESSAGE_SEQUENCE',
      path: 'messages/user_task/sequence',
      message: 'Message sequence 1 is used by both system_policy and user_task.',
      source: 'policy',
      blocking: true,
      details: { sequence: 1, previous: 'system_policy', current: 'user_task' },
    });
  });

  it('rejects a missing output resource at the referencing field', () => {
    const tree = structuredClone(t3xPromptP0Fixtures.validCandidateTree) as Record<string, unknown>;
    const resources = tree.resources as Record<string, unknown>;
    delete resources.response_schema;

    const result = validatePromptPolicy(tree, t3xPromptP0Fixtures.validRelations);

    expect(result.errors).toContainEqual({
      code: 'PROMPT_OUTPUT_SCHEMA_UNKNOWN',
      path: 'output/schema_resource',
      message: 'Output schema resource response_schema is not declared.',
      source: 'policy',
      blocking: true,
      details: { resourceKey: 'response_schema' },
    });
  });
});

describe('compilePrompt', () => {
  it('produces a deterministic, fully resolved CompiledPrompt', () => {
    const input = validCompileInput();
    const first = compilePrompt(input);
    const second = compilePrompt({
      ...input,
      resourceContents: {
        extraction_policy: input.resourceContents.extraction_policy,
        response_schema: input.resourceContents.response_schema,
      },
      contextContents: {
        source_material: input.contextContents.source_material,
        project_sources: input.contextContents.project_sources,
      },
    });

    expect(first).toEqual(second);
    expect(serializeCompiledPrompt(first)).toBe(serializeCompiledPrompt(second));
    expect(first.compiled).toBe(true);
    expect(first.issues).toEqual([]);
    expect(first.compileHash).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(first.messages.map((message) => message.key)).toEqual(['system_policy', 'user_task']);
    expect(first.messages[0]).toMatchObject({
      sequence: 1,
      role: 'system',
      variableKeys: ['response_style'],
      resourceKeys: ['extraction_policy'],
    });
    expect(first.messages[0]?.content).toContain('concise response style');
    expect(first.messages[1]).toMatchObject({
      sequence: 2,
      role: 'user',
      variableKeys: ['source_material', 'user_request'],
      contextKeys: ['project_sources'],
    });
    expect(first.messages[1]?.content).not.toContain('{{');
    expect(first.variables.find((variable) => variable.key === 'response_style')).toMatchObject({
      status: 'defaulted',
      value: 'concise',
    });
    expect(first.contexts[0]).toMatchObject({
      key: 'project_sources',
      status: 'resolved',
      targetMessageKeys: ['user_task'],
    });
    expect(first.output).toMatchObject({
      format: 'json_schema',
      strict: true,
      schemaResource: 'response_schema',
      schemaHash: expect.stringMatching(/^sha256:[a-f0-9]{64}$/),
    });
  });

  it('blocks compilation when a referenced variable cannot be resolved', () => {
    const input = validCompileInput();
    const result = compilePrompt({
      ...input,
      variableValues: {},
    });

    expect(result.compiled).toBe(false);
    expect(result.compileHash).toBeUndefined();
    expect(result.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'PROMPT_VARIABLE_UNRESOLVED',
          path: 'variables/user_request',
          blocking: true,
        }),
        expect.objectContaining({
          code: 'PROMPT_MESSAGE_VARIABLE_UNRESOLVED',
          path: 'messages/user_task/template',
          blocking: true,
        }),
      ])
    );
  });

  it('blocks compilation when referenced resource content is missing', () => {
    const input = validCompileInput();
    const result = compilePrompt({
      ...input,
      resourceContents: {
        response_schema: responseSchema,
      },
    });

    expect(result.compiled).toBe(false);
    expect(result.issues).toContainEqual({
      code: 'PROMPT_RESOURCE_CONTENT_MISSING',
      path: 'resources/extraction_policy/path',
      message: 'Referenced resource extraction_policy has no compiler content.',
      source: 'compile',
      blocking: true,
      details: {
        resourceKey: 'extraction_policy',
        bundlePath: 'references/extraction-policy.md',
      },
    });
  });

  it('blocks compilation when the output schema is invalid', () => {
    const input = validCompileInput();
    const result = compilePrompt({
      ...input,
      resourceContents: {
        ...input.resourceContents,
        response_schema: '{"title":"No schema keywords"}',
      },
    });

    expect(result.compiled).toBe(false);
    expect(result.output.schema).toBeUndefined();
    expect(result.issues).toContainEqual({
      code: 'PROMPT_OUTPUT_SCHEMA_INVALID',
      path: 'resources/response_schema/path',
      message: 'JSON Schema must contain at least one recognized schema keyword.',
      source: 'compile',
      blocking: true,
      details: { resourceKey: 'response_schema' },
    });
  });

  it('includes YSchema failures before domain compilation can succeed', () => {
    const tree = t3xPromptP0Fixtures.candidateWithHardErrors as unknown as Record<string, unknown>;
    const input = validCompileInput();
    const result = compilePrompt({
      ...input,
      tree,
      provenanceByPath: acceptedEvidenceForLeaves(tree),
    });

    expect(result.compiled).toBe(false);
    expect(result.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'INVALID_PATTERN',
          path: 'manifest/name',
          source: 'yschema',
        }),
        expect.objectContaining({
          code: 'INVALID_TYPE',
          path: 'variables/user_request/required',
          source: 'yschema',
        }),
      ])
    );
  });
});

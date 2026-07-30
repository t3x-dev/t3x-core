import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { generatePromptContract, parseYSchema, t3xPromptP0Fixtures, validateTree } from '../src';

const schemaPath = fileURLToPath(new URL('../examples/t3x-prompt.yschema.yaml', import.meta.url));

function acceptedEvidenceForLeaves(value: unknown, prefix = ''): Record<string, unknown[]> {
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

describe('t3x/prompt P0 schema', () => {
  it('parses and normalizes the canonical authoring YAML', () => {
    const yaml = readFileSync(schemaPath, 'utf8');

    expect(parseYSchema(yaml)).toEqual(t3xPromptP0Fixtures.normalizedYSchema);
  });

  it('generates the generic PromptContract used for Prompt extraction', () => {
    const contract = generatePromptContract(t3xPromptP0Fixtures.normalizedYSchema);

    expect(contract).toMatchObject({
      schemaName: 't3x/prompt',
      schemaVersion: 'v1',
      description: 'Portable, typed, and testable contract for one model invocation.',
    });
    expect(contract.nodes.map((node) => node.path)).toEqual([
      'manifest',
      'contract',
      'variables',
      'messages',
      'contexts',
      'runtime',
      'output',
      'resources',
      'dependencies',
      'checks',
      'evals',
    ]);
    expect(contract.nodes.find((node) => node.path === 'variables')).toMatchObject({
      repeated: true,
      required: true,
      requiredSlots: ['value_type', 'required', 'source', 'description', 'on_missing'],
    });
    expect(contract.nodes.find((node) => node.path === 'messages')).toMatchObject({
      repeated: true,
      required: true,
      requiredSlots: ['sequence', 'role', 'template', 'purpose', 'optional', 'on_missing_variable'],
    });
    expect(contract.nodes.find((node) => node.path === 'output')?.slots).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: 'output/format',
          enum: ['text', 'markdown', 'json', 'json_schema'],
        }),
        expect.objectContaining({
          path: 'output/schema_resource',
          type: 'string',
          pattern: '^[a-z][a-z0-9_]*$',
        }),
      ])
    );
    expect(contract.relationTypes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'precedes',
          from: 'messages/*',
          to: 'messages/*',
          acyclic: true,
        }),
        expect.objectContaining({
          type: 'uses_variable',
          from: 'messages/*',
          to: 'variables/*',
        }),
        expect.objectContaining({
          type: 'uses_output_schema',
          from: 'output',
          to: 'resources/*',
        }),
        expect.objectContaining({
          type: 'verifies_output',
          from: 'checks/*',
          to: 'output',
        }),
      ])
    );
  });

  it('accepts the complete, evidence-backed candidate and relation fixture', () => {
    const candidate = t3xPromptP0Fixtures.validCandidateTree;
    const result = validateTree({
      schema: t3xPromptP0Fixtures.normalizedYSchema,
      tree: candidate,
      provenanceByPath: acceptedEvidenceForLeaves(candidate),
      relations: [...t3xPromptP0Fixtures.validRelations],
    });

    expect(result).toEqual({ valid: true, ready: true, errors: [], gaps: [], fixes: [] });
  });

  it('returns stable required and provenance gaps', () => {
    const candidate = t3xPromptP0Fixtures.candidateWithGaps;
    const provenanceByPath = acceptedEvidenceForLeaves(candidate);
    delete provenanceByPath['manifest/summary'];

    const result = validateTree({
      schema: t3xPromptP0Fixtures.normalizedYSchema,
      tree: candidate,
      provenanceByPath,
      relations: [...t3xPromptP0Fixtures.validRelations],
    });

    expect(result).toEqual({
      valid: true,
      ready: false,
      errors: [],
      gaps: [
        {
          code: 'REQUIRED_SLOT_MISSING',
          path: 'contract/outputs',
          message: 'contract/outputs is required before commit.',
          gapQuestion: 'What outputs must this prompt produce?',
        },
        {
          code: 'REQUIRED_EVIDENCE_MISSING',
          path: 'manifest/summary',
          message: 'manifest/summary needs accepted source evidence.',
          gapQuestion: 'What model task does this prompt perform?',
        },
      ],
      fixes: [],
    });
  });

  it('returns stable type, enum, and pattern hard errors', () => {
    const candidate = t3xPromptP0Fixtures.candidateWithHardErrors;
    const result = validateTree({
      schema: t3xPromptP0Fixtures.normalizedYSchema,
      tree: candidate,
      provenanceByPath: acceptedEvidenceForLeaves(candidate),
      relations: [...t3xPromptP0Fixtures.validRelations],
    });

    expect(result).toEqual({
      valid: false,
      ready: false,
      errors: [
        {
          code: 'INVALID_PATTERN',
          path: 'manifest/name',
          message: 'name must match ^[a-z0-9]+(?:-[a-z0-9]+)*$.',
          details: {
            pattern: '^[a-z0-9]+(?:-[a-z0-9]+)*$',
            actual: 'Extract Requirements',
          },
        },
        {
          code: 'INVALID_TYPE',
          path: 'variables/user_request/required',
          message: 'required must be a boolean',
          details: { expected: 'boolean', actual: 'string' },
        },
        {
          code: 'INVALID_ENUM',
          path: 'messages/user_task/role',
          message: 'role must be one of system, developer, user, assistant',
          details: {
            allowed: ['system', 'developer', 'user', 'assistant'],
            actual: 'operator',
          },
        },
      ],
      gaps: [],
      fixes: [],
    });
  });
});

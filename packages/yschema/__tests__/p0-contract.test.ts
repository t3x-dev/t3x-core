import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  candidateWithGaps,
  candidateWithHardErrors,
  candidateWithRelations,
  expectedGapValidationResult,
  expectedHardErrorValidationResult,
  expectedPromptContract,
  expectedReadyValidationResult,
  normalizedT3xPrdYSchema,
  validCandidateTree,
} from '../__fixtures__/t3x-prd';
import {
  type FixProposal,
  normalizeYSchemaObject,
  type PromptContract,
  parseYSchema,
  t3xPrdP0Fixtures,
  type ValidationResult,
  type YSchema,
  type YSchemaFixOp,
} from '../src/index';

const referenceYSchemaPath = fileURLToPath(
  new URL('../__fixtures__/t3x-prd/reference.yschema.yaml', import.meta.url)
);

describe('YSchema P0 contract exports', () => {
  it('exports runtime P0 contract types for downstream packages', () => {
    const schema: YSchema = normalizedT3xPrdYSchema;
    const prompt: PromptContract = expectedPromptContract;
    const readyResult: ValidationResult = expectedReadyValidationResult;
    const relationFix: YSchemaFixOp = {
      relate: {
        from: 'requirements/review_gate',
        type: 'depends_on',
        to: 'requirements/schema_contract',
      },
    };
    const fix: FixProposal = {
      id: 'relate-review-gate',
      code: 'RELATION_SUGGESTION',
      path: '$relations',
      title: 'Add dependency relation',
      applyMode: 'automatic_after_review',
      ops: [relationFix],
    };

    expect(schema.name).toBe('t3x/prd');
    expect(prompt.schemaName).toBe('t3x/prd');
    expect(t3xPrdP0Fixtures.normalizedYSchema).toEqual(normalizedT3xPrdYSchema);
    expect(readyResult).toEqual({ valid: true, ready: true, errors: [], gaps: [], fixes: [] });
    expect(fix.ops).toEqual([relationFix]);
  });
});

describe('normalizeYSchemaObject', () => {
  it('normalizes P0 authoring names to deterministic runtime camelCase', () => {
    const schema = normalizeYSchemaObject({
      yschema: '0.1',
      name: 't3x/prd',
      version: '0.1.0',
      description: 'Product requirements document reference workflow.',
      nodes: {
        summary: {
          required: true,
          content_kind: 'prose',
          required_slots: ['problem'],
          slots: {
            problem: {
              type: 'string',
              max_words: 80,
              provenance_required: true,
              content_guidance: 'State the user problem only.',
              gap_question: 'What problem should this PRD solve?',
            },
            priority: ['must', 'should', 'could'],
            acceptance: 'list',
            attachments: { type: 'list' },
          },
        },
      },
      relation_types: {
        depends_on: {
          from: 'summary',
          to: 'summary',
          content_guidance: 'Use only for true prerequisite relationships.',
          acyclic: true,
        },
      },
    });

    expect(schema).toEqual({
      yschema: '0.1',
      name: 't3x/prd',
      version: '0.1.0',
      description: 'Product requirements document reference workflow.',
      strict: false,
      nodes: {
        summary: {
          required: true,
          contentKind: 'prose',
          requiredSlots: ['problem'],
          slots: {
            problem: {
              type: 'string',
              maxWords: 80,
              provenanceRequired: true,
              contentGuidance: 'State the user problem only.',
              gapQuestion: 'What problem should this PRD solve?',
            },
            priority: {
              enum: ['must', 'should', 'could'],
            },
            acceptance: {
              type: 'array',
            },
            attachments: {
              type: 'array',
            },
          },
        },
      },
      relationTypes: {
        depends_on: {
          from: 'summary',
          to: 'summary',
          contentGuidance: 'Use only for true prerequisite relationships.',
          acyclic: true,
        },
      },
      rules: [],
    });
  });

  it('rejects invalid P0 schema contracts before candidate validation', () => {
    expect(() =>
      normalizeYSchemaObject({
        yschema: '0.1',
        name: 'bad-required-slots',
        nodes: {
          summary: {
            required_slots: ['missing_slot'],
            slots: {
              problem: { type: 'string' },
            },
          },
        },
      })
    ).toThrow(/INVALID_SCHEMA.*requiredSlots.*missing_slot/);

    expect(() =>
      normalizeYSchemaObject({
        yschema: '0.1',
        name: 'bad-repeated-children',
        nodes: {
          requirements: {
            repeated: true,
            children: {
              nested: {},
            },
          },
        },
      })
    ).toThrow(/INVALID_SCHEMA.*repeated.*children/);

    expect(() =>
      normalizeYSchemaObject({
        yschema: '0.1',
        name: 'bad-relation',
        nodes: {
          summary: {},
        },
        relation_types: {
          depends_on: {
            from: 'summary/*',
            to: 'summary',
          },
        },
      })
    ).toThrow(/INVALID_SCHEMA.*summary\/\*/);

    expect(() =>
      normalizeYSchemaObject({
        yschema: '0.1',
        name: 'ambiguous-aliases',
        nodes: {
          summary: {
            contentKind: 'prose',
            content_kind: 'structured',
          },
        },
      })
    ).toThrow(/INVALID_SCHEMA.*contentKind.*content_kind/);
  });
});

describe('t3x/prd P0 fixtures', () => {
  it('parses the reference authoring YAML into the normalized runtime fixture', () => {
    const yaml = readFileSync(referenceYSchemaPath, 'utf8');
    expect(parseYSchema(yaml)).toEqual(normalizedT3xPrdYSchema);
  });

  it('contains candidate and expected result fixtures for downstream workflow and UI work', () => {
    expect(validCandidateTree.summary.problem).toContain('schema-backed PRD extraction');
    expect(candidateWithHardErrors.summary.outcome).toBe('enterprise-ready');
    expect(candidateWithGaps.summary).not.toHaveProperty('audience');
    expect(candidateWithRelations.relations).toContainEqual({
      from: 'requirements/review_gate',
      type: 'depends_on',
      to: 'requirements/schema_contract',
    });

    expect(expectedPromptContract.nodes.find((node) => node.path === 'summary')).toMatchObject({
      contentKind: 'prose',
      requiredSlots: ['problem', 'audience', 'outcome'],
    });
    expect(expectedHardErrorValidationResult.errors.map((error) => error.code)).toEqual([
      'INVALID_ENUM',
      'INVALID_TYPE',
    ]);
    expect(expectedGapValidationResult).toMatchObject({
      valid: true,
      ready: false,
      gaps: [
        {
          code: 'REQUIRED_SLOT_MISSING',
          path: 'summary/audience',
        },
        {
          code: 'REQUIRED_EVIDENCE_MISSING',
          path: 'summary/problem',
        },
      ],
    });
  });
});

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
  generatePromptContract,
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

    expect(() =>
      normalizeYSchemaObject({
        yschema: '0.1',
        name: 'deprecated-alias',
        nodes: {
          summary: {
            guidance: 'Use the canonical field name.',
          },
        },
      })
    ).toThrow(/INVALID_SCHEMA.*guidance.*content_guidance/);

    expect(() =>
      normalizeYSchemaObject({
        yschema: '0.1',
        name: 'bad-pattern',
        nodes: {
          summary: {
            slots: {
              slug: { type: 'string', pattern: '[a-z+' },
            },
          },
        },
      })
    ).toThrow(/INVALID_SCHEMA.*pattern.*valid regex/);

    expect(() =>
      normalizeYSchemaObject({
        yschema: '0.1',
        name: 'bad-default',
        nodes: {
          summary: {
            slots: {
              priority: { enum: ['must', 'should'], default: 'could' },
            },
          },
        },
      })
    ).toThrow(/INVALID_SCHEMA.*default.*enum/);

    expect(() =>
      normalizeYSchemaObject({
        yschema: '0.1',
        name: 'bad-range',
        nodes: {
          summary: {
            slots: {
              score: { type: 'number', minimum: 10, maximum: 5 },
            },
          },
        },
      })
    ).toThrow(/INVALID_SCHEMA.*minimum.*maximum/);
  });

  it('rejects deprecated P0 metadata aliases wherever metadata is accepted', () => {
    expect(() =>
      normalizeYSchemaObject({
        yschema: '0.1',
        name: 'deprecated-slot-alias',
        nodes: {
          summary: {
            slots: {
              problem: {
                type: 'string',
                ask: 'What problem should this PRD solve?',
              },
            },
          },
        },
      })
    ).toThrow(/INVALID_SCHEMA.*ask.*gap_question/);

    expect(() =>
      normalizeYSchemaObject({
        yschema: '0.1',
        name: 'deprecated-relation-alias',
        nodes: {
          requirements: {
            repeated: true,
          },
        },
        relation_types: {
          depends_on: {
            from: 'requirements/*',
            to: 'requirements/*',
            zone: 'structured',
          },
        },
      })
    ).toThrow(/INVALID_SCHEMA.*zone.*content_kind/);
  });

  it('rejects contradictory slot defaults and const values', () => {
    expect(() =>
      normalizeYSchemaObject({
        yschema: '0.1',
        name: 'bad-const-enum',
        nodes: {
          summary: {
            slots: {
              status: { enum: ['draft', 'accepted'], const: 'rejected' },
            },
          },
        },
      })
    ).toThrow(/INVALID_SCHEMA.*const.*enum/);

    expect(() =>
      normalizeYSchemaObject({
        yschema: '0.1',
        name: 'bad-default-const',
        nodes: {
          summary: {
            slots: {
              status: { const: 'draft', default: 'accepted' },
            },
          },
        },
      })
    ).toThrow(/INVALID_SCHEMA.*default.*const/);
  });

  it('rejects invalid P0 slot length and word-count constraints', () => {
    expect(() =>
      normalizeYSchemaObject({
        yschema: '0.1',
        name: 'bad-length',
        nodes: {
          summary: {
            slots: {
              problem: { type: 'string', min_length: 20, max_length: 10 },
            },
          },
        },
      })
    ).toThrow(/INVALID_SCHEMA.*minLength.*maxLength/);

    expect(() =>
      normalizeYSchemaObject({
        yschema: '0.1',
        name: 'bad-max-words',
        nodes: {
          summary: {
            slots: {
              problem: { type: 'string', max_words: 0 },
            },
          },
        },
      })
    ).toThrow(/INVALID_SCHEMA.*maxWords.*positive integer/);
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
    expect(
      expectedPromptContract.nodes
        .find((node) => node.path === 'milestones')
        ?.slots.find((slot) => slot.path === 'milestones/*/sequence')
    ).toMatchObject({
      type: 'integer',
      minimum: 1,
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

describe('generatePromptContract', () => {
  it('derives the stable t3x/prd PromptContract fixture from normalized YSchema', () => {
    expect(generatePromptContract(normalizedT3xPrdYSchema)).toEqual(expectedPromptContract);
  });

  it('derives a generic PromptContract without hardcoding t3x/prd behavior', () => {
    const schema = normalizeYSchemaObject({
      yschema: '0.1',
      name: 'example/prd',
      version: '2026-06-18',
      description: 'Example PRD workflow.',
      nodes: {
        summary: {
          slots: {
            body: {
              type: 'string',
              content_kind: 'prose',
              yops_hint: {
                preferred_op: 'set',
                path: 'summary',
                slot: 'body',
              },
            },
          },
        },
        release: {
          children: {
            milestones: {
              repeated: true,
              content_kind: 'structured',
              required_slots: ['title'],
              slots: {
                title: {
                  type: 'string',
                  max_words: 12,
                },
              },
            },
            notes: {
              children: 'any',
              slots: {
                text: {
                  type: 'string',
                },
              },
            },
          },
        },
      },
      relation_types: {
        blocks: {
          from: 'release/milestones/*',
          to: 'release/milestones/*',
          acyclic: true,
        },
      },
    });

    const contract = generatePromptContract(schema);

    expect(contract).toMatchObject({
      schemaName: 'example/prd',
      schemaVersion: '2026-06-18',
      description: 'Example PRD workflow.',
    });
    expect(contract.nodes.map((node) => node.path)).toEqual([
      'summary',
      'release',
      'release/milestones',
      'release/notes',
    ]);
    expect(contract.nodes.find((node) => node.path === 'summary')?.slots).toEqual([
      {
        path: 'summary/body',
        key: 'body',
        type: 'string',
        contentKind: 'prose',
        yopsHint: {
          preferredOp: 'set',
          path: 'summary',
          slot: 'body',
        },
      },
    ]);
    expect(contract.nodes.find((node) => node.path === 'release/milestones')).toMatchObject({
      path: 'release/milestones',
      repeated: true,
      contentKind: 'structured',
      requiredSlots: ['title'],
      slots: [
        {
          path: 'release/milestones/*/title',
          key: 'title',
          type: 'string',
          maxWords: 12,
        },
      ],
    });
    expect(
      contract.nodes
        .find((node) => node.path === 'release/milestones')
        ?.slots.find((slot) => slot.key === 'title')
    ).not.toHaveProperty('enum');
    expect(contract.relationTypes).toEqual([
      {
        type: 'blocks',
        from: 'release/milestones/*',
        to: 'release/milestones/*',
        acyclic: true,
      },
    ]);
  });

  it('does not share mutable structured slot values with the source schema', () => {
    const schema = normalizeYSchemaObject({
      yschema: '0.1',
      name: 'example/clone',
      nodes: {
        settings: {
          slots: {
            mode: {
              enum: [{ label: 'review' }],
              default: { label: 'review' },
              examples: [{ label: 'review' }],
            },
            lock: {
              const: { locked: true },
            },
          },
        },
      },
    });

    const contract = generatePromptContract(schema);
    const modeSlot = contract.nodes[0]?.slots.find((slot) => slot.key === 'mode');
    const lockSlot = contract.nodes[0]?.slots.find((slot) => slot.key === 'lock');

    expect(modeSlot).toMatchObject({
      path: 'settings/mode',
      key: 'mode',
      enum: [{ label: 'review' }],
      default: { label: 'review' },
      examples: [{ label: 'review' }],
    });
    expect(lockSlot).toMatchObject({
      path: 'settings/lock',
      key: 'lock',
      const: { locked: true },
    });
    expect(modeSlot?.enum).not.toBe(schema.nodes.settings?.slots?.mode?.enum);
    expect(modeSlot?.default).not.toBe(schema.nodes.settings?.slots?.mode?.default);
    expect(modeSlot?.examples).not.toBe(schema.nodes.settings?.slots?.mode?.examples);
    expect(lockSlot?.const).not.toBe(schema.nodes.settings?.slots?.lock?.const);

    (modeSlot?.enum?.[0] as Record<string, unknown>).label = 'mutated';
    (modeSlot?.default as Record<string, unknown>).label = 'mutated';
    (modeSlot?.examples?.[0] as Record<string, unknown>).label = 'mutated';
    (lockSlot?.const as Record<string, unknown>).locked = false;

    expect(schema.nodes.settings?.slots?.mode?.enum).toEqual([{ label: 'review' }]);
    expect(schema.nodes.settings?.slots?.mode?.default).toEqual({ label: 'review' });
    expect(schema.nodes.settings?.slots?.mode?.examples).toEqual([{ label: 'review' }]);
    expect(schema.nodes.settings?.slots?.lock?.const).toEqual({ locked: true });
  });
});

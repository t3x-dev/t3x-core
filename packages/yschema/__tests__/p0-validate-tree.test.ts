import { describe, expect, it } from 'vitest';
import {
  type ProvenanceIndex,
  t3xPrdP0Fixtures,
  type ValidationResult,
  validateTree,
  type YSchema,
  type YSchemaRelation,
} from '../src/index';

const {
  candidateWithGaps,
  candidateWithHardErrors,
  candidateWithRelations,
  expectedGapValidationResult,
  expectedHardErrorValidationResult,
  expectedReadyValidationResult,
  normalizedYSchema,
  validCandidateTree,
} = t3xPrdP0Fixtures;

const acceptedEvidence = (paths: string[]): ProvenanceIndex =>
  Object.fromEntries(
    paths.map((path) => [
      path,
      [
        {
          origin: 'user_evidence',
          sourceId: `source:${path}`,
        },
      ],
    ])
  );

const requiredEvidence = acceptedEvidence([
  'summary/problem',
  'summary/audience',
  'summary/outcome',
  'requirements/schema_contract/title',
  'requirements/schema_contract/acceptance',
  'requirements/review_gate/title',
  'requirements/review_gate/acceptance',
  'milestones/contract_first/title',
  'milestones/workflow_second/title',
]);

const relationCodesFor = (relations: YSchemaRelation[]) =>
  validateTree({
    schema: normalizedYSchema,
    tree: validCandidateTree,
    provenanceByPath: requiredEvidence,
    relations,
  }).errors.map((error) => error.code);

describe('validateTree P0 result semantics', () => {
  it('matches the shared t3x/prd result fixtures exactly', () => {
    expect(
      validateTree({
        schema: normalizedYSchema,
        tree: validCandidateTree,
        provenanceByPath: requiredEvidence,
        relations: [...candidateWithRelations.relations],
      })
    ).toEqual(expectedReadyValidationResult);

    expect(
      validateTree({
        schema: normalizedYSchema,
        tree: candidateWithHardErrors,
        provenanceByPath: acceptedEvidence([
          'summary/problem',
          'summary/audience',
          'summary/outcome',
          'requirements/review_gate/title',
        ]),
      })
    ).toEqual(expectedHardErrorValidationResult);

    expect(
      validateTree({
        schema: normalizedYSchema,
        tree: candidateWithGaps,
        provenanceByPath: acceptedEvidence([
          'summary/outcome',
          'requirements/review_gate/title',
          'requirements/review_gate/acceptance',
        ]),
      })
    ).toEqual(expectedGapValidationResult);
  });

  it('returns ready=true for a valid PRD tree with required evidence and relations', () => {
    const result = validateTree({
      schema: normalizedYSchema,
      tree: candidateWithRelations.tree,
      provenanceByPath: requiredEvidence,
      relations: [...candidateWithRelations.relations],
    });

    expect(result).toEqual({
      valid: true,
      ready: true,
      errors: [],
      gaps: [],
      fixes: [],
    } satisfies ValidationResult);
  });

  it('reports invalid enum and type values as hard errors with reviewable fixes only', () => {
    const result = validateTree({
      schema: normalizedYSchema,
      tree: candidateWithHardErrors,
      provenanceByPath: acceptedEvidence([
        'summary/problem',
        'summary/audience',
        'summary/outcome',
        'requirements/review_gate/title',
      ]),
    });

    expect(result.valid).toBe(false);
    expect(result.ready).toBe(false);
    expect(result.gaps).toEqual([]);
    expect(result.errors).toMatchObject([
      {
        code: 'INVALID_ENUM',
        path: 'requirements/review_gate/priority',
        details: { allowed: ['must', 'should', 'could'], actual: 'critical' },
      },
      {
        code: 'INVALID_TYPE',
        path: 'requirements/review_gate/acceptance',
        details: { expected: 'array', actual: 'string' },
      },
    ]);
    expect(result.fixes).toEqual([
      {
        id: 'set-requirements-review_gate-priority-default',
        code: 'INVALID_ENUM',
        path: 'requirements/review_gate/priority',
        title: 'Use default priority',
        applyMode: 'automatic_after_review',
        ops: [
          {
            set: {
              path: 'requirements/review_gate/priority',
              value: 'should',
            },
          },
        ],
      },
    ]);
  });

  it('supports valid=true and ready=false for missing required slots and evidence', () => {
    const result = validateTree({
      schema: normalizedYSchema,
      tree: candidateWithGaps,
      provenanceByPath: acceptedEvidence([
        'summary/outcome',
        'requirements/review_gate/title',
        'requirements/review_gate/acceptance',
      ]),
    });

    expect(result).toMatchObject({
      valid: true,
      ready: false,
      errors: [],
      gaps: [
        {
          code: 'REQUIRED_SLOT_MISSING',
          path: 'summary/audience',
          gapQuestion: 'Who is this PRD for?',
        },
        {
          code: 'REQUIRED_EVIDENCE_MISSING',
          path: 'summary/problem',
          gapQuestion: 'What problem should this PRD solve?',
        },
      ],
    });
  });

  it('treats a missing required node as a readiness gap with a define fix', () => {
    const result = validateTree({
      schema: normalizedYSchema,
      tree: {
        requirements: validCandidateTree.requirements,
      },
      provenanceByPath: acceptedEvidence([
        'requirements/schema_contract/title',
        'requirements/schema_contract/acceptance',
        'requirements/review_gate/title',
        'requirements/review_gate/acceptance',
      ]),
    });

    expect(result.valid).toBe(true);
    expect(result.ready).toBe(false);
    expect(result.gaps).toMatchObject([
      {
        code: 'REQUIRED_NODE_MISSING',
        path: 'summary',
        fixIds: ['define-summary'],
      },
    ]);
    expect(result.fixes).toContainEqual({
      id: 'define-summary',
      code: 'REQUIRED_NODE_MISSING',
      path: 'summary',
      title: 'Create required node',
      applyMode: 'requires_user_input',
      ops: [{ define: { path: 'summary' } }],
    });
  });

  it('rejects repeated arrays and invalid repeated item keys deterministically', () => {
    const result = validateTree({
      schema: normalizedYSchema,
      tree: {
        ...validCandidateTree,
        requirements: {
          ...validCandidateTree.requirements,
          'Bad Key': {
            title: 'Invalid item key',
            priority: 'must',
            acceptance: ['Keys must stay machine-safe.'],
          },
        },
        milestones: [{ title: 'Arrays are not valid repeated node state', sequence: 1 }],
      },
      provenanceByPath: requiredEvidence,
    });

    expect(result.valid).toBe(false);
    expect(result.ready).toBe(false);
    expect(result.errors.map((error) => [error.code, error.path])).toEqual([
      ['INVALID_REPEATED_ITEM_KEY', 'requirements/Bad Key'],
      ['INVALID_TYPE', 'milestones'],
    ]);
  });

  it('enforces strict unexpected node and slot errors', () => {
    const strictSchema: YSchema = {
      ...normalizedYSchema,
      strict: true,
    };
    const result = validateTree({
      schema: strictSchema,
      tree: {
        ...validCandidateTree,
        summary: {
          ...validCandidateTree.summary,
          solution: 'Ship a specific implementation plan.',
        },
        appendix: {
          note: 'Out of contract.',
        },
      },
      provenanceByPath: requiredEvidence,
    });

    expect(result.valid).toBe(false);
    expect(result.errors.map((error) => [error.code, error.path])).toEqual([
      ['UNEXPECTED_NODE', 'appendix'],
      ['UNEXPECTED_SLOT', 'summary/solution'],
    ]);
  });

  it('requires children:any nodes to be objects', () => {
    const schema: YSchema = {
      yschema: '0.1',
      name: 'children-any',
      strict: true,
      nodes: {
        services: {
          required: true,
          children: 'any',
        },
      },
      rules: [],
    };

    const result = validateTree({
      schema,
      tree: {
        services: 'nginx:1',
      },
    });

    expect(result.valid).toBe(false);
    expect(result.ready).toBe(false);
    expect(result.errors).toEqual([
      {
        code: 'INVALID_TYPE',
        path: 'services',
        message: 'services must be an object.',
        details: {
          expected: 'object',
          actual: 'string',
        },
      },
    ]);
  });

  it('suggests optional defaults without blocking readiness', () => {
    const schema: YSchema = {
      yschema: '0.1',
      name: 'optional-default',
      strict: true,
      nodes: {
        summary: {
          required: true,
          slots: {
            tone: {
              enum: ['short', 'long'],
              default: 'short',
            },
          },
        },
      },
      rules: [],
    };

    const result = validateTree({
      schema,
      tree: {
        summary: {},
      },
    });

    expect(result.valid).toBe(true);
    expect(result.ready).toBe(true);
    expect(result.gaps).toEqual([]);
    expect(result.fixes).toEqual([
      {
        id: 'set-summary-tone-default',
        code: 'OPTIONAL_DEFAULT',
        path: 'summary/tone',
        title: 'Use default tone',
        applyMode: 'automatic_after_review',
        ops: [{ set: { path: 'summary/tone', value: 'short' } }],
      },
    ]);
  });

  it('requires approval before using a required default', () => {
    const result = validateTree({
      schema: normalizedYSchema,
      tree: {
        summary: validCandidateTree.summary,
        requirements: {
          review_gate: {
            title: 'Show validation before commit',
            acceptance: ['The review UI separates hard errors from readiness gaps.'],
          },
        },
      },
      provenanceByPath: acceptedEvidence([
        'summary/problem',
        'summary/audience',
        'summary/outcome',
        'requirements/review_gate/title',
        'requirements/review_gate/acceptance',
      ]),
    });

    expect(result.valid).toBe(true);
    expect(result.ready).toBe(false);
    expect(result.gaps).toEqual([
      {
        code: 'DEFAULT_REQUIRES_APPROVAL',
        path: 'requirements/review_gate/priority',
        message: 'requirements/review_gate/priority can use a schema default after review.',
        gapQuestion: 'How important is this requirement?',
        fixIds: ['set-requirements-review_gate-priority-default'],
      },
    ]);
    expect(result.fixes).toEqual([
      {
        id: 'set-requirements-review_gate-priority-default',
        code: 'DEFAULT_REQUIRES_APPROVAL',
        path: 'requirements/review_gate/priority',
        title: 'Use default priority',
        applyMode: 'automatic_after_review',
        ops: [
          {
            set: {
              path: 'requirements/review_gate/priority',
              value: 'should',
            },
          },
        ],
      },
    ]);
  });

  it('reports invalid schema contracts before treating a tree as ready', () => {
    const schema: YSchema = {
      yschema: '0.1',
      name: 'invalid-schema-contract',
      strict: true,
      nodes: {
        summary: {
          required: true,
          requiredSlots: ['missing_slot'],
          slots: {
            problem: { type: 'string' },
          },
        },
      },
      relationTypes: {
        bad_relation: {
          from: 'summary/*',
          to: 'missing_node',
        },
      },
      rules: [],
    };

    const result = validateTree({
      schema,
      tree: {
        summary: {
          problem: 'Schema errors should block readiness deterministically.',
        },
      },
    });

    expect(result.valid).toBe(false);
    expect(result.ready).toBe(false);
    expect(result.errors.map((error) => [error.code, error.path, error.message])).toEqual([
      [
        'INVALID_SCHEMA',
        'summary/missing_slot',
        'requiredSlots entry "missing_slot" is not declared in slots.',
      ],
      [
        'INVALID_SCHEMA',
        '$relations',
        'relationTypes.bad_relation.from endpoint "summary/*" requires a repeated node.',
      ],
      [
        'INVALID_SCHEMA',
        '$relations',
        'relationTypes.bad_relation.to endpoint "missing_node" does not resolve to a node.',
      ],
    ]);
  });

  it('accepts only explicit user or approved provenance for required evidence', () => {
    const accepted = validateTree({
      schema: normalizedYSchema,
      tree: validCandidateTree,
      provenanceByPath: {
        ...requiredEvidence,
        'summary/problem': [{ origin: 'ai_paraphrase_approved', approved: true }],
      },
    });
    const generatedOnly = validateTree({
      schema: normalizedYSchema,
      tree: validCandidateTree,
      provenanceByPath: {
        ...requiredEvidence,
        'summary/problem': [{ origin: 'system_generated' }],
      },
    });

    expect(accepted.gaps).not.toContainEqual(
      expect.objectContaining({ code: 'REQUIRED_EVIDENCE_MISSING', path: 'summary/problem' })
    );
    expect(generatedOnly.gaps).toContainEqual(
      expect.objectContaining({ code: 'REQUIRED_EVIDENCE_MISSING', path: 'summary/problem' })
    );
  });

  it('validates relation state errors deterministically', () => {
    expect(
      relationCodesFor([
        {
          from: 'requirements/review_gate',
          type: 'blocks',
          to: 'requirements/schema_contract',
        },
      ])
    ).toEqual(['INVALID_RELATION_TYPE']);

    expect(
      relationCodesFor([
        {
          from: 'Bad Path',
          type: 'depends_on',
          to: 'requirements/schema_contract',
        },
      ])
    ).toEqual(['INVALID_RELATION_ENDPOINT']);

    expect(
      relationCodesFor([
        {
          from: 'requirements/missing',
          type: 'depends_on',
          to: 'requirements/schema_contract',
        },
      ])
    ).toEqual(['BROKEN_RELATION_ENDPOINT']);

    expect(
      relationCodesFor([
        {
          from: 'milestones/contract_first',
          type: 'depends_on',
          to: 'requirements/schema_contract',
        },
      ])
    ).toEqual(['RELATION_ENDPOINT_MISMATCH']);

    expect(
      relationCodesFor([
        {
          from: 'requirements/review_gate',
          type: 'depends_on',
          to: 'requirements/review_gate',
        },
      ])
    ).toEqual(['SELF_RELATION', 'RELATION_CYCLE']);

    expect(
      relationCodesFor([
        {
          from: 'requirements/review_gate',
          type: 'depends_on',
          to: 'requirements/schema_contract',
        },
        {
          from: 'requirements/review_gate',
          type: 'depends_on',
          to: 'requirements/schema_contract',
        },
      ])
    ).toEqual(['DUPLICATE_RELATION']);

    expect(
      relationCodesFor([
        {
          from: 'requirements/review_gate',
          type: 'depends_on',
          to: 'requirements/schema_contract',
        },
        {
          from: 'requirements/schema_contract',
          type: 'depends_on',
          to: 'requirements/review_gate',
        },
      ])
    ).toEqual(['RELATION_CYCLE']);
  });

  it('validates a non-PRD project plan schema with the same P0 semantics', () => {
    const schema: YSchema = {
      yschema: '0.1',
      name: 't3x/project_plan',
      strict: true,
      nodes: {
        objective: {
          required: true,
          contentKind: 'prose',
          requiredSlots: ['summary'],
          slots: {
            summary: {
              type: 'string',
              maxWords: 16,
              provenanceRequired: true,
              gapQuestion: 'What outcome should this plan produce?',
            },
          },
        },
        tasks: {
          required: true,
          repeated: true,
          contentKind: 'structured',
          requiredSlots: ['title', 'owner', 'status'],
          slots: {
            title: {
              type: 'string',
              provenanceRequired: true,
            },
            owner: {
              type: 'string',
              provenanceRequired: true,
            },
            status: {
              enum: ['todo', 'doing', 'done'],
              default: 'todo',
            },
          },
        },
      },
      relationTypes: {
        blocks: {
          from: 'tasks/*',
          to: 'tasks/*',
          acyclic: true,
        },
      },
      rules: [],
    };

    const tree = {
      objective: {
        summary: 'Ship the YSchema P0 core contract.',
      },
      tasks: {
        schema_contract: {
          title: 'Publish shared YSchema contracts',
          owner: 'core',
          status: 'done',
        },
        relation_adapter: {
          title: 'Apply schema-defined relation fixes',
          owner: 'core',
        },
      },
    };

    const result = validateTree({
      schema,
      tree,
      relations: [
        {
          from: 'tasks/relation_adapter',
          type: 'blocks',
          to: 'tasks/schema_contract',
        },
      ],
      provenanceByPath: acceptedEvidence([
        'objective/summary',
        'tasks/schema_contract/title',
        'tasks/schema_contract/owner',
        'tasks/relation_adapter/title',
        'tasks/relation_adapter/owner',
      ]),
    });

    expect(result).toEqual({
      valid: true,
      ready: false,
      errors: [],
      gaps: [
        {
          code: 'DEFAULT_REQUIRES_APPROVAL',
          path: 'tasks/relation_adapter/status',
          message: 'tasks/relation_adapter/status can use a schema default after review.',
          fixIds: ['set-tasks-relation_adapter-status-default'],
        },
      ],
      fixes: [
        {
          id: 'set-tasks-relation_adapter-status-default',
          code: 'DEFAULT_REQUIRES_APPROVAL',
          path: 'tasks/relation_adapter/status',
          title: 'Use default status',
          applyMode: 'automatic_after_review',
          ops: [
            {
              set: {
                path: 'tasks/relation_adapter/status',
                value: 'todo',
              },
            },
          ],
        },
      ],
    });
  });
});

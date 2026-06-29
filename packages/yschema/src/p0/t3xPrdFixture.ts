import type { PromptContract, ValidationResult, YSchema } from './types';

export const normalizedT3xPrdYSchema: YSchema = {
  yschema: '0.1',
  name: 't3x/prd',
  version: '0.1.0',
  description: 'Product requirements document reference workflow.',
  strict: false,
  nodes: {
    summary: {
      required: true,
      contentKind: 'prose',
      description: 'Short PRD summary.',
      contentGuidance:
        'Keep this section factual and evidence-backed. Do not include roadmap language.',
      requiredSlots: ['problem', 'audience', 'outcome'],
      slots: {
        problem: {
          type: 'string',
          maxWords: 80,
          provenanceRequired: true,
          description: 'The product problem this PRD addresses.',
          contentGuidance: 'State the user problem only. Do not include proposed solutions.',
          gapQuestion: 'What problem should this PRD solve?',
        },
        audience: {
          type: 'string',
          maxWords: 40,
          provenanceRequired: true,
          description: 'Primary users or buyers for this PRD.',
          gapQuestion: 'Who is this PRD for?',
        },
        outcome: {
          type: 'string',
          maxWords: 60,
          provenanceRequired: true,
          description: 'The measurable outcome this PRD should produce.',
          gapQuestion: 'What outcome should this PRD drive?',
        },
      },
    },
    requirements: {
      required: true,
      repeated: true,
      contentKind: 'structured',
      description: 'User-facing requirements.',
      contentGuidance: 'Each item should describe one user-visible requirement.',
      requiredSlots: ['title', 'priority', 'acceptance'],
      slots: {
        title: {
          type: 'string',
          maxWords: 24,
          provenanceRequired: true,
          description: 'Human-readable requirement title.',
          gapQuestion: 'What requirement should be captured?',
        },
        priority: {
          enum: ['must', 'should', 'could'],
          default: 'should',
          description: 'Requirement priority.',
          gapQuestion: 'How important is this requirement?',
        },
        acceptance: {
          type: 'array',
          provenanceRequired: true,
          description: 'Acceptance criteria for the requirement.',
          gapQuestion: 'How will we know this requirement is satisfied?',
        },
      },
    },
    milestones: {
      required: false,
      repeated: true,
      contentKind: 'structured',
      description: 'Delivery milestones.',
      requiredSlots: ['title', 'sequence'],
      slots: {
        title: {
          type: 'string',
          provenanceRequired: true,
        },
        sequence: {
          type: 'integer',
          minimum: 1,
          description: 'Stable milestone order.',
        },
      },
    },
  },
  relationTypes: {
    depends_on: {
      from: 'requirements/*',
      to: 'requirements/*',
      description: 'Source requirement needs target requirement first.',
      contentGuidance: 'Use only for true prerequisite relationships.',
      acyclic: true,
    },
    precedes: {
      from: 'milestones/*',
      to: 'milestones/*',
      description: 'Source milestone should happen before target milestone.',
      contentGuidance: 'Use only when the order is explicit or strongly implied.',
      acyclic: true,
    },
  },
  rules: [],
};

export const validCandidateTree = {
  summary: {
    problem: 'Teams need schema-backed PRD extraction before committing structured state.',
    audience: 'Product and engineering collaborators',
    outcome: 'Every PRD candidate can be reviewed for validity, readiness, gaps, and fixes.',
  },
  requirements: {
    schema_contract: {
      title: 'Publish shared YSchema contracts',
      priority: 'must',
      acceptance: ['P0 types are exported from @t3x-dev/yschema.'],
    },
    review_gate: {
      title: 'Show validation before commit',
      priority: 'must',
      acceptance: ['The review UI separates hard errors from readiness gaps.'],
    },
  },
  milestones: {
    contract_first: {
      title: 'Land shared contract package',
      sequence: 1,
    },
    workflow_second: {
      title: 'Wire PRD workflow',
      sequence: 2,
    },
  },
} as const;

export const candidateWithHardErrors = {
  summary: {
    problem: 'Teams need schema-backed PRD extraction before committing structured state.',
    audience: 'Product and engineering collaborators',
    outcome: 'enterprise-ready',
  },
  requirements: {
    review_gate: {
      title: 'Show validation before commit',
      priority: 'critical',
      acceptance: 'The review UI separates hard errors from readiness gaps.',
    },
  },
} as const;

export const candidateWithGaps = {
  summary: {
    problem: 'Teams need schema-backed PRD extraction before committing structured state.',
    outcome: 'Every PRD candidate can be reviewed for validity, readiness, gaps, and fixes.',
  },
  requirements: {
    review_gate: {
      title: 'Show validation before commit',
      priority: 'must',
      acceptance: ['The review UI separates hard errors from readiness gaps.'],
    },
  },
} as const;

export const candidateWithRelations = {
  tree: validCandidateTree,
  relations: [
    {
      from: 'requirements/review_gate',
      type: 'depends_on',
      to: 'requirements/schema_contract',
    },
    {
      from: 'milestones/contract_first',
      type: 'precedes',
      to: 'milestones/workflow_second',
    },
  ],
} as const;

export const expectedPromptContract: PromptContract = {
  schemaName: 't3x/prd',
  schemaVersion: '0.1.0',
  description: 'Product requirements document reference workflow.',
  nodes: [
    {
      path: 'summary',
      contentKind: 'prose',
      required: true,
      description: 'Short PRD summary.',
      contentGuidance:
        'Keep this section factual and evidence-backed. Do not include roadmap language.',
      requiredSlots: ['problem', 'audience', 'outcome'],
      slots: [
        {
          path: 'summary/problem',
          key: 'problem',
          type: 'string',
          maxWords: 80,
          provenanceRequired: true,
          description: 'The product problem this PRD addresses.',
          contentGuidance: 'State the user problem only. Do not include proposed solutions.',
          gapQuestion: 'What problem should this PRD solve?',
        },
        {
          path: 'summary/audience',
          key: 'audience',
          type: 'string',
          maxWords: 40,
          provenanceRequired: true,
          description: 'Primary users or buyers for this PRD.',
          gapQuestion: 'Who is this PRD for?',
        },
        {
          path: 'summary/outcome',
          key: 'outcome',
          type: 'string',
          maxWords: 60,
          provenanceRequired: true,
          description: 'The measurable outcome this PRD should produce.',
          gapQuestion: 'What outcome should this PRD drive?',
        },
      ],
    },
    {
      path: 'requirements',
      contentKind: 'structured',
      repeated: true,
      required: true,
      description: 'User-facing requirements.',
      contentGuidance: 'Each item should describe one user-visible requirement.',
      requiredSlots: ['title', 'priority', 'acceptance'],
      slots: [
        {
          path: 'requirements/*/title',
          key: 'title',
          type: 'string',
          maxWords: 24,
          provenanceRequired: true,
          description: 'Human-readable requirement title.',
          gapQuestion: 'What requirement should be captured?',
        },
        {
          path: 'requirements/*/priority',
          key: 'priority',
          enum: ['must', 'should', 'could'],
          default: 'should',
          description: 'Requirement priority.',
          gapQuestion: 'How important is this requirement?',
        },
        {
          path: 'requirements/*/acceptance',
          key: 'acceptance',
          type: 'array',
          provenanceRequired: true,
          description: 'Acceptance criteria for the requirement.',
          gapQuestion: 'How will we know this requirement is satisfied?',
        },
      ],
    },
    {
      path: 'milestones',
      contentKind: 'structured',
      repeated: true,
      required: false,
      description: 'Delivery milestones.',
      requiredSlots: ['title', 'sequence'],
      slots: [
        {
          path: 'milestones/*/title',
          key: 'title',
          type: 'string',
          provenanceRequired: true,
        },
        {
          path: 'milestones/*/sequence',
          key: 'sequence',
          type: 'integer',
          minimum: 1,
          description: 'Stable milestone order.',
        },
      ],
    },
  ],
  relationTypes: [
    {
      type: 'depends_on',
      from: 'requirements/*',
      to: 'requirements/*',
      description: 'Source requirement needs target requirement first.',
      contentGuidance: 'Use only for true prerequisite relationships.',
      acyclic: true,
    },
    {
      type: 'precedes',
      from: 'milestones/*',
      to: 'milestones/*',
      description: 'Source milestone should happen before target milestone.',
      contentGuidance: 'Use only when the order is explicit or strongly implied.',
      acyclic: true,
    },
  ],
};

export const expectedReadyValidationResult: ValidationResult = {
  valid: true,
  ready: true,
  errors: [],
  gaps: [],
  fixes: [],
};

export const expectedHardErrorValidationResult: ValidationResult = {
  valid: false,
  ready: false,
  errors: [
    {
      code: 'INVALID_ENUM',
      path: 'requirements/review_gate/priority',
      message: 'priority must be one of must, should, could',
      details: {
        allowed: ['must', 'should', 'could'],
        actual: 'critical',
      },
    },
    {
      code: 'INVALID_TYPE',
      path: 'requirements/review_gate/acceptance',
      message: 'acceptance must be an array',
      details: {
        expected: 'array',
        actual: 'string',
      },
    },
  ],
  gaps: [],
  fixes: [
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
  ],
};

export const expectedGapValidationResult: ValidationResult = {
  valid: true,
  ready: false,
  errors: [],
  gaps: [
    {
      code: 'REQUIRED_SLOT_MISSING',
      path: 'summary/audience',
      message: 'summary/audience is required before commit.',
      gapQuestion: 'Who is this PRD for?',
    },
    {
      code: 'REQUIRED_EVIDENCE_MISSING',
      path: 'summary/problem',
      message: 'summary/problem needs accepted source evidence.',
      gapQuestion: 'What problem should this PRD solve?',
    },
  ],
  fixes: [],
};

export const t3xPrdP0Fixtures = {
  normalizedYSchema: normalizedT3xPrdYSchema,
  validCandidateTree,
  candidateWithHardErrors,
  candidateWithGaps,
  candidateWithRelations,
  expectedPromptContract,
  expectedReadyValidationResult,
  expectedHardErrorValidationResult,
  expectedGapValidationResult,
} as const;

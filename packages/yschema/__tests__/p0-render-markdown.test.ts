import { describe, expect, it } from 'vitest';
import { renderYSchemaMarkdown, t3xPrdP0Fixtures, validateTree } from '../src/index';

const { candidateWithRelations, normalizedYSchema } = t3xPrdP0Fixtures;

const acceptedEvidence = {
  'summary/problem': [{ origin: 'user_evidence' as const, sourceId: 'test:summary/problem' }],
  'summary/audience': [{ origin: 'user_evidence' as const, sourceId: 'test:summary/audience' }],
  'summary/outcome': [{ origin: 'user_evidence' as const, sourceId: 'test:summary/outcome' }],
  'requirements/schema_contract/title': [
    { origin: 'user_evidence' as const, sourceId: 'test:requirements/schema_contract/title' },
  ],
  'requirements/schema_contract/acceptance': [
    { origin: 'user_evidence' as const, sourceId: 'test:requirements/schema_contract/acceptance' },
  ],
  'requirements/review_gate/title': [
    { origin: 'user_evidence' as const, sourceId: 'test:requirements/review_gate/title' },
  ],
  'requirements/review_gate/acceptance': [
    { origin: 'user_evidence' as const, sourceId: 'test:requirements/review_gate/acceptance' },
  ],
  'milestones/contract_first/title': [
    { origin: 'user_evidence' as const, sourceId: 'test:milestones/contract_first/title' },
  ],
  'milestones/workflow_second/title': [
    { origin: 'user_evidence' as const, sourceId: 'test:milestones/workflow_second/title' },
  ],
};

describe('renderYSchemaMarkdown', () => {
  it('renders the PRD candidate as readable Markdown instead of debug YAML', () => {
    const validation = validateTree({
      schema: normalizedYSchema,
      tree: candidateWithRelations.tree,
      relations: candidateWithRelations.relations,
      provenanceByPath: acceptedEvidence,
    });

    const markdown = renderYSchemaMarkdown({
      schema: normalizedYSchema,
      tree: candidateWithRelations.tree,
      relations: candidateWithRelations.relations,
      validation,
    });

    expect(markdown).toContain('# t3x/prd');
    expect(markdown).toContain('Product requirements document reference workflow.');
    expect(markdown).toContain('## Summary');
    expect(markdown).toContain(
      '**Problem:** Teams need schema-backed PRD extraction before committing structured state.'
    );
    expect(markdown).toContain('## Requirements');
    expect(markdown).toContain('### Publish shared YSchema contracts');
    expect(markdown).toContain('- P0 types are exported from @t3x-dev/yschema.');
    expect(markdown).toContain('### Show validation before commit');
    expect(markdown).toContain('## Milestones');
    expect(markdown).toContain('1. Land shared contract package');
    expect(markdown).toContain('2. Wire PRD workflow');
    expect(markdown).toContain('## Relations');
    expect(markdown).toContain(
      '- Show validation before commit depends on Publish shared YSchema contracts.'
    );
    expect(markdown).toContain('- Land shared contract package precedes Wire PRD workflow.');
    expect(markdown).toContain('## Validation');
    expect(markdown).toContain('Ready: true');
    expect(markdown).toContain('Errors: 0');
    expect(markdown).toContain('Gaps: 0');
    expect(markdown).not.toContain('candidate:');
    expect(markdown).not.toContain('prompt_contract:');
    expect(markdown).not.toContain('summary/problem');
  });

  it('keeps validation errors and gaps visible for review', () => {
    const tree = {
      summary: {
        problem: 'Teams need schema-backed PRD review.',
        outcome: 'Reviewers can rerun validation.',
      },
      requirements: {
        review_gate: {
          title: 'Show validation before commit',
          priority: 'critical',
          acceptance: 'The review UI separates hard errors from readiness gaps.',
        },
      },
    };
    const validation = validateTree({
      schema: normalizedYSchema,
      tree,
      relations: [],
      provenanceByPath: {
        'summary/problem': [{ origin: 'user_evidence' as const, sourceId: 'test:summary/problem' }],
        'summary/outcome': [{ origin: 'user_evidence' as const, sourceId: 'test:summary/outcome' }],
        'requirements/review_gate/title': [
          { origin: 'user_evidence' as const, sourceId: 'test:requirements/review_gate/title' },
        ],
      },
    });

    const markdown = renderYSchemaMarkdown({
      schema: normalizedYSchema,
      tree,
      validation,
    });

    expect(markdown).toContain('## Validation');
    expect(markdown).toContain('Valid: false');
    expect(markdown).toContain('Ready: false');
    expect(markdown).toContain('Errors: 2');
    expect(markdown).toContain('- `requirements/review_gate/priority`:');
    expect(markdown).toContain('- `requirements/review_gate/acceptance`:');
    expect(markdown).toContain('Gaps: 1');
    expect(markdown).toContain('- `summary/audience`: summary/audience is required before commit.');
  });
});

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { type ProvenanceIndex, parseYSchema } from '@t3x-dev/yschema';
import { describe, expect, it } from 'vitest';
import type { SemanticContent, TreeNode } from '../../semantic/types';
import { applyYSchemaFixOps } from '../yschemaFixOps';

const referenceYSchemaPath = fileURLToPath(
  new URL('../../../../yschema/__fixtures__/t3x-prd/reference.yschema.yaml', import.meta.url)
);

const node = (key: string, slots: TreeNode['slots'] = {}, children: TreeNode[] = []): TreeNode => ({
  key,
  slots,
  children,
});

const prdContent: SemanticContent = {
  trees: [
    node('summary', {
      problem: 'PRD candidates do not expose schema readiness clearly enough.',
      audience: 'Product and engineering reviewers',
      outcome: 'Every PRD can be reviewed before commit.',
    }),
    node('requirements', {}, [
      node('schema_contract', {
        title: 'Define schema contract',
        priority: 'must',
        acceptance: ['Schema contract describes required PRD fields.'],
      }),
      node('review_gate', {
        title: 'Show schema verdict',
        priority: 'must',
        acceptance: ['Review UI shows verdict, gaps, fixes, and provenance.'],
      }),
    ]),
  ],
  relations: [],
};

const evidence: ProvenanceIndex = {
  'summary/problem': [{ origin: 'user_evidence', quote: 'schema readiness is unclear' }],
  'summary/audience': [{ origin: 'user_evidence', quote: 'reviewers need it' }],
  'summary/outcome': [{ origin: 'user_evidence', quote: 'review before commit' }],
  'requirements/schema_contract/title': [{ origin: 'user_evidence', quote: 'schema contract' }],
  'requirements/schema_contract/acceptance': [
    { origin: 'user_evidence', quote: 'required fields' },
  ],
  'requirements/review_gate/title': [{ origin: 'user_evidence', quote: 'schema verdict' }],
  'requirements/review_gate/acceptance': [{ origin: 'user_evidence', quote: 'verdict gaps fixes' }],
};

describe('YSchema PRD relation fix smoke test', () => {
  it('applies a schema-defined PRD dependency and validates the commit candidate as ready', () => {
    const schema = parseYSchema(readFileSync(referenceYSchemaPath, 'utf8'));

    const result = applyYSchemaFixOps({
      content: prdContent,
      schema,
      ops: [
        {
          relate: {
            from: 'requirements/review_gate',
            to: 'requirements/schema_contract',
            type: 'depends_on',
          },
        },
      ],
      provenanceByPath: evidence,
      requireReady: true,
    });

    expect(result.ok).toBe(true);
    expect(result.validation.ready).toBe(true);
    expect(result.validation.errors).toEqual([]);
    expect(result.validation.gaps).toEqual([]);
    expect(result.content.relations).toEqual([
      {
        from: 'requirements/review_gate',
        to: 'requirements/schema_contract',
        type: 'depends_on',
      },
    ]);
  });
});

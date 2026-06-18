import type { YSchema, YSchemaFixOp } from '@t3x-dev/yschema';
import { describe, expect, it } from 'vitest';
import type { SemanticContent, TreeNode } from '../../semantic/types';
import { applyYSchemaFixOps } from '../yschemaFixOps';

const node = (key: string, slots: TreeNode['slots'] = {}, children: TreeNode[] = []): TreeNode => ({
  key,
  slots,
  children,
});

const schema: YSchema = {
  yschema: '0.1',
  name: 'relation-fix-test',
  strict: true,
  nodes: {
    requirements: {
      required: true,
      repeated: true,
      slots: {
        title: { type: 'string' },
      },
    },
  },
  relationTypes: {
    depends_on: {
      from: 'requirements/*',
      to: 'requirements/*',
      acyclic: true,
    },
  },
  rules: [],
};

const content = (relations: SemanticContent['relations'] = []): SemanticContent => ({
  trees: [
    node('requirements', {}, [
      node('schema_contract', { title: 'Define schema contract' }),
      node('review_gate', { title: 'Review schema verdict before commit' }),
    ]),
  ],
  relations,
});

describe('applyYSchemaFixOps', () => {
  it('applies schema-defined relation fix ops through the core YOps engine', () => {
    const ops: YSchemaFixOp[] = [
      {
        relate: {
          from: 'requirements/review_gate',
          to: 'requirements/schema_contract',
          type: 'depends_on',
        },
      },
    ];

    const result = applyYSchemaFixOps({
      content: content(),
      schema,
      ops,
    });

    expect(result.ok).toBe(true);
    expect(result.content.relations).toEqual([
      {
        from: 'requirements/review_gate',
        to: 'requirements/schema_contract',
        type: 'depends_on',
      },
    ]);
    expect(result.validation.valid).toBe(true);
  });

  it('applies schema-defined unrelate fix ops', () => {
    const ops: YSchemaFixOp[] = [
      {
        unrelate: {
          from: 'requirements/review_gate',
          to: 'requirements/schema_contract',
          type: 'depends_on',
        },
      },
    ];

    const result = applyYSchemaFixOps({
      content: content([
        {
          from: 'requirements/review_gate',
          to: 'requirements/schema_contract',
          type: 'depends_on',
        },
      ]),
      schema,
      ops,
    });

    expect(result.ok).toBe(true);
    expect(result.content.relations).toEqual([]);
  });

  it('applies a relation fix after earlier ops create its endpoint in the same batch', () => {
    const result = applyYSchemaFixOps({
      content: content(),
      schema,
      ops: [
        { define: { path: 'requirements/evidence_capture' } },
        {
          populate: {
            path: 'requirements/evidence_capture',
            values: { title: 'Capture accepted evidence' },
          },
        },
        {
          relate: {
            from: 'requirements/review_gate',
            to: 'requirements/evidence_capture',
            type: 'depends_on',
          },
        },
      ],
    });

    expect(result.ok).toBe(true);
    expect(result.applied).toBe(3);
    expect(result.content.relations).toEqual([
      {
        from: 'requirements/review_gate',
        to: 'requirements/evidence_capture',
        type: 'depends_on',
      },
    ]);
  });

  it('allows unrelate fixes to remove stale relations that are invalid under the current schema', () => {
    const result = applyYSchemaFixOps({
      content: content([
        {
          from: 'requirements/review_gate',
          to: 'requirements/schema_contract',
          type: 'blocks',
        },
      ]),
      schema,
      ops: [
        {
          unrelate: {
            from: 'requirements/review_gate',
            to: 'requirements/schema_contract',
            type: 'blocks',
          },
        },
      ],
    });

    expect(result.ok).toBe(true);
    expect(result.content.relations).toEqual([]);
    expect(result.validation.valid).toBe(true);
  });

  it('rejects relation fix ops with undeclared schema relation types', () => {
    const result = applyYSchemaFixOps({
      content: content(),
      schema,
      ops: [
        {
          relate: {
            from: 'requirements/review_gate',
            to: 'requirements/schema_contract',
            type: 'blocks',
          },
        },
      ],
    });

    expect(result.ok).toBe(false);
    expect(result.error.code).toBe('INVALID_RELATION_TYPE');
    expect(result.error.op_index).toBe(0);
  });

  it('rejects relation fix ops with broken schema endpoints', () => {
    const result = applyYSchemaFixOps({
      content: content(),
      schema,
      ops: [
        {
          relate: {
            from: 'requirements/missing',
            to: 'requirements/schema_contract',
            type: 'depends_on',
          },
        },
      ],
    });

    expect(result.ok).toBe(false);
    expect(result.error.code).toBe('BROKEN_RELATION_ENDPOINT');
    expect(result.error.op_index).toBe(0);
  });

  it('rejects relation fix ops whose endpoints do not match schema endpoint patterns', () => {
    const result = applyYSchemaFixOps({
      content: {
        trees: [
          ...content().trees,
          node('milestones', {}, [
            node('contract_first', { title: 'Contract first', sequence: 1 }),
          ]),
        ],
        relations: [],
      },
      schema: {
        ...schema,
        nodes: {
          ...schema.nodes,
          milestones: {
            required: false,
            repeated: true,
            slots: {
              title: { type: 'string' },
              sequence: { type: 'integer' },
            },
          },
        },
      },
      ops: [
        {
          relate: {
            from: 'milestones/contract_first',
            to: 'requirements/schema_contract',
            type: 'depends_on',
          },
        },
      ],
    });

    expect(result.ok).toBe(false);
    expect(result.error.code).toBe('RELATION_ENDPOINT_MISMATCH');
    expect(result.error.op_index).toBe(0);
  });

  it('rejects relation fixes that would violate acyclic schema relation rules', () => {
    const result = applyYSchemaFixOps({
      content: content([
        {
          from: 'requirements/schema_contract',
          to: 'requirements/review_gate',
          type: 'depends_on',
        },
      ]),
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
    });

    expect(result.ok).toBe(false);
    expect(result.error.code).toBe('RELATION_CYCLE');
    expect(result.error.op_index).toBe(0);
    expect(result.applied).toBe(0);
    expect(result.content.relations).toEqual([
      {
        from: 'requirements/schema_contract',
        to: 'requirements/review_gate',
        type: 'depends_on',
      },
    ]);
  });
});

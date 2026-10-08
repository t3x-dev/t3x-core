import { applyNativeYOps } from '@t3x-dev/core';
import { validateTree, type YSchema } from '@t3x-dev/yschema';
import { describe, expect, it } from 'vitest';
import { semanticSchemaLayout, workspaceSemanticSchemaLayout } from '../lib/semantic-schema-layout';

const productBrief = {
  yschema: '0.1',
  name: 't3x/product-brief',
  nodes: {
    product: {
      required: true,
      slots: {
        title: { type: 'string', minLength: 1 },
        problem: { type: 'string', minLength: 1 },
      },
      requiredSlots: ['title', 'problem'],
    },
    requirements: {
      required: true,
      repeated: true,
      slots: {
        title: { type: 'string', minLength: 1 },
        acceptance: { type: 'string', minLength: 1 },
        priority: { type: 'string', enum: ['must', 'should', 'could'] },
      },
      requiredSlots: ['title', 'acceptance'],
    },
  },
} satisfies YSchema;

type Tree = { key: string; slots: Record<string, unknown>; children: Tree[] };
const plain = (tree: Tree): Record<string, unknown> => ({
  ...tree.slots,
  ...Object.fromEntries(tree.children.map((child) => [child.key, plain(child)])),
});

describe('semanticSchemaLayout', () => {
  it('places schema nodes under the bound root and repeated items under their collection', () => {
    const layout = semanticSchemaLayout(productBrief, 'candidate');

    expect(layout.rootPath).toBe('content/trees/[key=candidate]');
    expect(layout.nodes).toEqual([
      expect.objectContaining({
        node: 'product',
        path: 'content/trees/[key=candidate]/children/[key=product]',
        repeated: false,
        slotsPath: 'content/trees/[key=candidate]/children/[key=product]/slots',
        slots: [
          { key: 'title', required: true, type: 'string' },
          { key: 'problem', required: true, type: 'string' },
        ],
      }),
      expect.objectContaining({
        node: 'requirements',
        path: 'content/trees/[key=candidate]/children/[key=requirements]',
        repeated: true,
        itemPath:
          'content/trees/[key=candidate]/children/[key=requirements]/children/[key=<item_key>]',
        slotsPath:
          'content/trees/[key=candidate]/children/[key=requirements]/children/[key=<item_key>]/slots',
      }),
    ]);
    expect(layout.nodes[1]?.slots).toContainEqual({
      key: 'priority',
      required: false,
      type: 'string',
      enum: ['must', 'should', 'could'],
    });
  });

  it('nests declared child nodes and marks open children', () => {
    const layout = semanticSchemaLayout(
      {
        yschema: '0.1',
        name: 'nested',
        nodes: {
          summary: { children: { details: { slots: { body: { type: 'string' } } } } },
          notes: { children: 'any' },
        },
      },
      'doc'
    );

    expect(layout.nodes.map(({ node, path }) => [node, path])).toEqual([
      ['summary', 'content/trees/[key=doc]/children/[key=summary]'],
      ['summary/details', 'content/trees/[key=doc]/children/[key=summary]/children/[key=details]'],
      ['notes', 'content/trees/[key=doc]/children/[key=notes]'],
    ]);
    expect(layout.nodes[2]?.openChildren).toBe(true);
  });

  it('uses the Workspace binding root key, matching Review', () => {
    const workspace = {
      schemaBindings: [{ rootKey: 'candidate', schemaName: 't3x/product-brief' }],
    };
    expect(workspaceSemanticSchemaLayout(workspace, productBrief).rootKey).toBe('candidate');
    expect(workspaceSemanticSchemaLayout({ schemaBindings: [] }, productBrief).rootKey).toBe(
      'candidate'
    );
  });

  it('produces paths whose materialized result satisfies the YSchema', () => {
    const layout = semanticSchemaLayout(productBrief, 'candidate');
    const [product, requirements] = layout.nodes;
    const itemsPath = requirements!.itemPath!.replace('/[key=<item_key>]', '');
    const operations: Parameters<typeof applyNativeYOps>[1] = [
      { set: { path: 'domain', value: 't3x.dev/semantic-content' } },
      { set: { path: 'version', value: 1 } },
      { set: { path: 'content', value: { trees: [], relations: [] } } },
      { append: { path: 'content/trees', value: { key: 'candidate', slots: {}, children: [] } } },
      {
        append: {
          path: `${layout.rootPath}/children`,
          value: { key: 'product', slots: { title: 'Minutes', problem: 'Slow' }, children: [] },
        },
      },
      {
        append: {
          path: `${layout.rootPath}/children`,
          value: { key: 'requirements', slots: {}, children: [] },
        },
      },
      {
        append: {
          path: itemsPath,
          value: {
            key: 'share',
            slots: { title: 'Share', acceptance: 'Recipients can read', priority: 'could' },
            children: [],
          },
        },
      },
      { set: { path: `${product!.slotsPath}/title`, value: 'Meeting minutes' } },
    ];

    const applied = applyNativeYOps({}, operations);
    expect(applied.ok).toBe(true);
    const content = (applied.doc as { content: { trees: Tree[] } }).content;
    expect(content.trees.map((tree) => tree.key)).toEqual(['candidate']);
    const result = validateTree({ schema: productBrief, tree: plain(content.trees[0]!) as never });
    expect(result.errors).toEqual([]);
    expect(result.gaps).toEqual([]);
  });
});

import { compileSchemaContentMigration, createDraftActionLedger } from '@t3x-dev/application';
import { createYOpsState, describeTransitionObject } from '@t3x-dev/core';
import { normalizeYSchemaObject } from '@t3x-dev/yschema';
import { expect, it } from 'vitest';
import {
  removalContentMappings,
  renameContentMappings,
} from '../lib/workspace-assistant/schema-rename-migration';

const schema = normalizeYSchemaObject({
  yschema: '0.1',
  name: 'rename',
  nodes: {
    product: { children: { owner: { slots: { phone: { type: 'string' } } } } },
    requirements: { repeated: true, slots: { phone: { type: 'string' } } },
  },
});
const node = (key: string, slots: Record<string, string>, children: unknown[] = []) => ({
  key,
  slots,
  children,
});
const document = {
  domain: 't3x.dev/semantic-content',
  version: 1,
  content: {
    trees: [
      node('candidate', {}, [
        node('product', {}, [node('owner', { phone: '123', retained: 'Keep' })]),
        node('requirements', {}, [
          node('first', { phone: '456' }),
          node('second', { phone: '789' }),
        ]),
      ]),
    ],
    relations: [],
  },
};
function workspace(value = document) {
  return {
    authoringLedger: createDraftActionLedger(value as never),
    schemaBindings: [{ rootKey: 'candidate' }],
    authoringBasis: {
      schema: 't3x.application/workspace-authoring-basis/v1',
      refName: 'test',
      refHead: null,
      baseDigest: describeTransitionObject(createYOpsState(value as never)).digest,
    },
  };
}
const settings = {
  action: 'rename_slot' as const,
  nodePath: 'product/owner',
  name: 'phone',
  newName: 'mail',
  definition: {},
  intent: 'Rename',
};
it('builds editable native mappings that preserve or clear semantic slot values', () => {
  const plans = renameContentMappings(workspace(), schema, settings)!;
  const preserved = compileSchemaContentMigration(document as never, 'candidate', plans.preserve)
    .document as typeof document;
  const cleared = compileSchemaContentMigration(document as never, 'candidate', plans.clear)
    .document as typeof document;
  expect(
    (preserved.content.trees[0].children[0] as ReturnType<typeof node>).children[0]
  ).toMatchObject({ slots: { mail: '123', retained: 'Keep' } });
  expect(JSON.stringify(preserved)).not.toContain('"phone":"123"');
  expect(JSON.stringify(cleared)).not.toContain('"123"');
  expect(document.content.trees[0].children[0]).toEqual(
    node('product', {}, [node('owner', { phone: '123', retained: 'Keep' })])
  );
});
it('expands repeated definitions into all concrete instances, without wildcards', () => {
  const plans = renameContentMappings(workspace(), schema, {
    ...settings,
    nodePath: 'requirements',
  })!;
  expect(plans.preserve).toHaveLength(2);
  const result = compileSchemaContentMigration(
    document as never,
    'candidate',
    plans.preserve
  ).document;
  expect(JSON.stringify(result)).toContain('"mail":"456"');
  expect(JSON.stringify(result)).toContain('"mail":"789"');
});
it('removes a slot from every repeated instance without changing sibling values', () => {
  const commands = removalContentMappings(workspace(), schema, {
    ...settings,
    action: 'remove_slot',
    nodePath: 'requirements',
  })!;
  expect(commands).toHaveLength(2);
  const result = compileSchemaContentMigration(document as never, 'candidate', commands)
    .document as typeof document;
  expect(result.content.trees[0].children[1]).toEqual(
    node('requirements', {}, [node('first', {}), node('second', {})])
  );
  expect(result.content.trees[0].children[0]).toEqual(document.content.trees[0].children[0]);
});
it('removes a whole semantic subtree and leaves other array entries intact', () => {
  const commands = removalContentMappings(workspace(), schema, {
    ...settings,
    action: 'remove_node',
    nodePath: '',
    name: 'product',
  })!;
  const result = compileSchemaContentMigration(document as never, 'candidate', commands)
    .document as typeof document;
  expect(result.content.trees[0].children).toEqual([document.content.trees[0].children[1]]);
});
it('renames semantic nodes, updates relation endpoints and guards destination collisions', () => {
  const related = structuredClone(document);
  (related.content.relations as unknown[]) = [
    { from: 'candidate/product/owner', to: 'candidate/product', type: 'links' },
  ];
  const plans = renameContentMappings(workspace(related), schema, {
    ...settings,
    action: 'rename_node',
    nodePath: 'product',
    name: 'owner',
    newName: 'manager',
  })!;
  const result = compileSchemaContentMigration(
    related as never,
    'candidate',
    plans.preserve
  ).document;
  expect(JSON.stringify(result)).toContain('"from":"candidate/product/manager"');
  const cleared = compileSchemaContentMigration(related as never, 'candidate', plans.clear)
    .document as typeof document;
  expect((cleared.content.trees[0].children[0] as ReturnType<typeof node>).children).toEqual([
    node('manager', {}),
  ]);
  expect(JSON.stringify(cleared)).toContain('"from":"candidate/product/manager"');
  expect(JSON.stringify(cleared)).not.toContain('"phone":"123"');
  const collision = structuredClone(document);
  (
    (collision.content.trees[0].children[0] as ReturnType<typeof node>).children[0] as ReturnType<
      typeof node
    >
  ).slots.mail = 'Do not overwrite';
  expect(() => renameContentMappings(workspace(collision), schema, settings)).toThrow(
    'already has content'
  );
});

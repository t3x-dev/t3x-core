import { expect, it } from 'vitest';
import {
  applyWorkspaceSchemaYOps,
  compileWorkspaceSchemaDefinition,
} from '../transition-adapters/schemaAuthoring';

const base = {
  yschema: '0.1',
  name: 'test/strict',
  version: '1.0.0',
  strict: true,
  nodes: { product: { slots: { title: { type: 'string' }, obsolete: { type: 'string' } } } },
};
it('changes existing fields, removes and renames through one deterministic guarded Effect without touching Base', async () => {
  const before = structuredClone(base);
  const desired = {
    ...base,
    nodes: { overview: { slots: { title: { type: 'string', minLength: 1 } } } },
  };
  const result = await compileWorkspaceSchemaDefinition(base, desired);
  expect(result.schema).toMatchObject({ strict: true, nodes: desired.nodes });
  expect(result.schema.nodes.product).toBeUndefined();
  expect(base).toEqual(before);
  expect(await applyWorkspaceSchemaYOps(base, result.operations)).toEqual(result);
  expect((await compileWorkspaceSchemaDefinition(base, desired)).schemaHash).toBe(
    result.schemaHash
  );
  await expect(
    applyWorkspaceSchemaYOps({ ...base, nodes: {} }, result.operations)
  ).rejects.toMatchObject({ code: 'APPLY_FAILED' });
});
it('does not silently change root constraints or apply a partially invalid definition', async () => {
  await expect(
    compileWorkspaceSchemaDefinition(base, { ...base, strict: false })
  ).rejects.toMatchObject({ code: 'INVALID_COMMAND' });
  await expect(
    compileWorkspaceSchemaDefinition(base, {
      ...base,
      nodes: { product: { slots: { title: { type: 'unsupported' } } } },
    })
  ).rejects.toThrow();
  expect(base.strict).toBe(true);
});

import type { AnyDB } from '@t3x-dev/storage';
import { normalizeYSchemaObject, validateTree } from '@t3x-dev/yschema';
import { expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ materials: vi.fn() }));
vi.mock('@t3x-dev/storage', async (original) => ({
  ...(await original<typeof import('@t3x-dev/storage')>()),
  findMaterialsByIds: mocks.materials,
}));

import { workspaceProvenance } from '../lib/workspace-provenance';

const tree = { product: { title: 'Supported title' } };
const schema = normalizeYSchemaObject({
  yschema: '0.1',
  name: 'Evidence',
  nodes: { product: { slots: { title: { type: 'string', provenanceRequired: true } } } },
});
it('uses the same server-resolved evidence for preparation and complete Review, rejecting foreign or stale materials', async () => {
  const workspace = { sourceBundle: [{ materialId: 'source', contentHash: 'hash' }] };
  mocks.materials.mockResolvedValue([{ id: 'source', project_id: 'target', content_hash: 'hash' }]);
  const evidence = await workspaceProvenance({} as AnyDB, 'target', workspace, tree);
  expect(validateTree({ schema, tree, provenanceByPath: evidence }).ready).toBe(true);
  for (const material of [
    { id: 'source', project_id: 'foreign', content_hash: 'hash' },
    { id: 'source', project_id: 'target', content_hash: 'different' },
  ]) {
    mocks.materials.mockResolvedValue([material]);
    const denied = await workspaceProvenance({} as AnyDB, 'target', workspace, tree);
    expect(denied).toEqual({});
    expect(validateTree({ schema, tree, provenanceByPath: denied })).toMatchObject({
      ready: false,
      gaps: [expect.objectContaining({ code: 'REQUIRED_EVIDENCE_MISSING' })],
    });
  }
});

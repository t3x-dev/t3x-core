import { createDraftActionLedger, publishDraftAction } from '@t3x-dev/application';
import { createYOpsState, describeTransitionObject } from '@t3x-dev/core';
import type { AnyDB } from '@t3x-dev/storage';
import { normalizeYSchemaObject, type YSchema } from '@t3x-dev/yschema';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { assessWorkspaceSchemaImpact } from '../lib/schema-evolution-impact';
import { resolveWorkspaceYSchema } from '../lib/workspace-yschema';

vi.mock('../lib/workspace-yschema', () => ({ resolveWorkspaceYSchema: vi.fn() }));
const base = normalizeYSchemaObject({
  yschema: '0.1',
  name: 'Product',
  strict: false,
  nodes: {
    product: { required: true, slots: { title: { type: 'string' } }, requiredSlots: ['title'] },
    requirements: { repeated: true, slots: { title: { type: 'string' } } },
  },
});
const db = {} as AnyDB;
function workspace() {
  return {
    schemaBindings: [{ rootKey: 'candidate', canonicalName: 'team/product', version: '1' }],
    schemaCandidate: {
      fields: [
        { path: 'product.title', value: 'Existing product' },
        { path: 'requirements.first.title', value: 'Existing requirement' },
      ],
    },
  };
}
function target(edit: (schema: YSchema) => void) {
  const value = structuredClone(base);
  edit(value);
  return normalizeYSchemaObject(value);
}
beforeEach(() => {
  vi.mocked(resolveWorkspaceYSchema).mockResolvedValue({
    canonicalName: 'team/product',
    schema: base,
  });
});

describe('Schema evolution impact', () => {
  it('allows optional additions and deterministically reports the same content hash', async () => {
    const next = target((schema) => {
      schema.nodes.advantage = { slots: { title: { type: 'string' } } };
    });
    const current = workspace();
    const before = structuredClone(current);
    const first = await assessWorkspaceSchemaImpact(db, 'project', current, next);
    expect(first).toMatchObject({ status: 'safe', canAdopt: true, canPublish: true });
    expect(first.items).toContainEqual(
      expect.objectContaining({ kind: 'safe_addition', path: 'nodes.advantage' })
    );
    expect(await assessWorkspaceSchemaImpact(db, 'project', current, next)).toEqual(first);
    expect(current).toEqual(before);
  });

  it('shows required input gaps and permits preparation after adoption, without manufacturing values', async () => {
    const next = target((schema) => {
      schema.nodes.advantage = {
        required: true,
        slots: { title: { type: 'string' } },
        requiredSlots: ['title'],
      };
    });
    const impact = await assessWorkspaceSchemaImpact(db, 'project', workspace(), next);
    expect(impact).toMatchObject({ status: 'needs_input', canAdopt: true, canPublish: false });
    expect(impact.items).toContainEqual(
      expect.objectContaining({
        kind: 'needs_input',
        code: 'REQUIRED_NODE_MISSING',
        path: 'advantage',
      })
    );
  });

  it.each([
    'remove',
    'rename',
    'type',
    'repeated',
  ] as const)('blocks %s without explicit content mapping even for a non-strict Schema', async (edit) => {
    const next = target((schema) => {
      if (edit === 'remove') delete schema.nodes.product;
      if (edit === 'rename') {
        schema.nodes.overview = schema.nodes.product!;
        delete schema.nodes.product;
      }
      if (edit === 'type') schema.nodes.product!.slots!.title = { type: 'number' };
      if (edit === 'repeated') schema.nodes.requirements!.repeated = false;
    });
    const impact = await assessWorkspaceSchemaImpact(db, 'project', workspace(), next);
    expect(impact).toMatchObject({ status: 'needs_mapping', canAdopt: false, canPublish: false });
    expect(
      impact.items.some((item) => item.kind === 'needs_mapping' && item.affectedPaths.length > 0)
    ).toBe(true);
  });

  it('detects constraints that invalidate an existing value', async () => {
    const next = target((schema) => {
      schema.nodes.product!.slots!.title.maxLength = 2;
    });
    const impact = await assessWorkspaceSchemaImpact(db, 'project', workspace(), next);
    expect(impact.canAdopt).toBe(false);
    expect(impact.items).toContainEqual(
      expect.objectContaining({
        kind: 'needs_mapping',
        code: 'INVALID_LENGTH',
        path: 'product/title',
      })
    );
  });

  it('validates the replayed whole Ledger rather than the stale field projection', async () => {
    const document = {
      domain: 't3x.dev/semantic-content',
      version: 1,
      content: {
        trees: [
          {
            key: 'candidate',
            slots: {},
            children: [{ key: 'product', slots: { title: 'Before' }, children: [] }],
          },
        ],
        relations: [],
      },
    };
    const ledger = createDraftActionLedger(document);
    const result = publishDraftAction(ledger, {
      actionId: 'edit',
      actor: { kind: 'human', id: 'user' },
      channel: 'manual',
      expectedRevision: 0,
      publishedAt: '2026-10-15T00:00:00.000Z',
      operations: [
        {
          set: {
            path: 'content/trees/[key=candidate]/children/[key=product]/slots/title',
            value: 'Longer current title',
          },
        },
      ],
    });
    if (result.kind !== 'published') throw new Error(`Unexpected result: ${result.kind}`);
    const current = {
      ...workspace(),
      authoringLedger: result.ledger,
      authoringBasis: {
        schema: 't3x.application/workspace-authoring-basis/v1',
        refName: 'main',
        refHead: null,
        baseDigest: describeTransitionObject(createYOpsState(ledger.base)).digest,
        initialization: { requestId: 'init', facts: 'test' },
      },
      schemaCandidate: { fields: [{ path: 'product.title', value: 'Ok' }] },
    };
    const next = target((schema) => {
      schema.nodes.product!.slots!.title.maxLength = 5;
    });
    const impact = await assessWorkspaceSchemaImpact(db, 'project', current, next);
    expect(impact.content.source).toBe('authoring_ledger');
    expect(impact.status).toBe('needs_mapping');
    expect(impact.items).toContainEqual(
      expect.objectContaining({ code: 'INVALID_LENGTH', path: 'product/title' })
    );
    const again = await assessWorkspaceSchemaImpact(
      db,
      'project',
      { ...current, authoringLedger: {} },
      next
    );
    expect(again).toMatchObject({
      status: 'blocked',
      canAdopt: false,
      canPublish: false,
      content: { source: 'unavailable' },
    });
  });

  it('fails closed on an unresolved binding and prototype-path candidate fields', async () => {
    vi.mocked(resolveWorkspaceYSchema).mockResolvedValueOnce({
      canonicalName: 'missing',
      schema: null,
    });
    expect(await assessWorkspaceSchemaImpact(db, 'project', workspace(), base)).toMatchObject({
      status: 'blocked',
    });
    const malformed = {
      ...workspace(),
      schemaCandidate: { fields: [{ path: '__proto__.polluted', value: true }] },
    };
    expect(await assessWorkspaceSchemaImpact(db, 'project', malformed, base)).toMatchObject({
      status: 'blocked',
    });
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });
});

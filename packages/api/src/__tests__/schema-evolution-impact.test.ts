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
  it.each([
    'node rename',
    'slot rename',
    'absent slot type',
  ])('does not invent a migration for %s when only unrelated content exists', async (edit) => {
    const before = target((schema) => {
      schema.nodes.scratchpad = { slots: { note: { type: 'string' } } };
      schema.nodes.product!.slots!.unused = { type: 'integer' };
    });
    vi.mocked(resolveWorkspaceYSchema).mockResolvedValueOnce({
      canonicalName: 'team/product',
      schema: before,
    });
    const next = structuredClone(before);
    if (edit === 'node rename') {
      next.nodes.lab = next.nodes.scratchpad;
      delete next.nodes.scratchpad;
    }
    if (edit === 'slot rename') {
      next.nodes.product!.slots!.memo = next.nodes.product!.slots!.unused;
      delete next.nodes.product!.slots!.unused;
    }
    if (edit === 'absent slot type') next.nodes.product!.slots!.unused.type = 'number';
    const impact = await assessWorkspaceSchemaImpact(
      db,
      'project',
      workspace(),
      normalizeYSchemaObject(next)
    );
    expect(impact).toMatchObject({ canAdopt: true, status: 'safe', content: { valid: true } });
  });
  it('does not ask to migrate absent values when replacing the default Schema on an empty Draft', async () => {
    const current = { ...workspace(), schemaCandidate: { fields: [] } };
    const next = target((schema) => {
      delete schema.nodes.product;
      schema.nodes.requirements!.slots!.title = { type: 'number' };
    });
    const impact = await assessWorkspaceSchemaImpact(db, 'project', current, next);
    expect(impact.canAdopt).toBe(true);
    expect(impact.items.some((item) => item.kind === 'needs_mapping')).toBe(false);
  });
  it.each([
    'remove_node',
    'remove_slot',
  ] as const)('allows an exact explicitly confirmed %s while retaining valid non-strict content', async (action) => {
    const settings = {
      action,
      nodePath: action === 'remove_slot' ? 'product' : '',
      name: action === 'remove_slot' ? 'title' : 'product',
      definition: {},
      intent: 'Remove this definition only',
    };
    const next = target((schema) => {
      if (action === 'remove_node') delete schema.nodes.product;
      else {
        delete schema.nodes.product!.slots!.title;
        schema.nodes.product!.requiredSlots = [];
      }
    });
    const current = workspace();
    const before = structuredClone(current);
    const impact = await assessWorkspaceSchemaImpact(db, 'project', current, next, true, settings);
    expect(impact).toMatchObject({ status: 'safe', canAdopt: true, content: { valid: true } });
    expect(current).toEqual(before);
  });

  it('never lets a confirmed removal authorize an unrelated rename or type change', async () => {
    const next = target((schema) => {
      schema.nodes.overview = schema.nodes.product!;
      delete schema.nodes.product;
    });
    const impact = await assessWorkspaceSchemaImpact(db, 'project', workspace(), next, true, {
      action: 'remove_node',
      nodePath: '',
      name: 'product',
      definition: {},
      intent: 'Remove this definition only',
    });
    expect(impact.canAdopt).toBe(false);
  });

  it('still blocks an explicitly confirmed removal when strict content would become invalid', async () => {
    const strict = normalizeYSchemaObject({ ...base, strict: true });
    vi.mocked(resolveWorkspaceYSchema).mockResolvedValueOnce({
      canonicalName: 'team/product',
      schema: strict,
    });
    const next = normalizeYSchemaObject({
      ...strict,
      nodes: { requirements: strict.nodes.requirements! },
    });
    const impact = await assessWorkspaceSchemaImpact(db, 'project', workspace(), next, true, {
      action: 'remove_node',
      nodePath: '',
      name: 'product',
      definition: {},
      intent: 'Remove this definition only',
    });
    expect(impact.canAdopt).toBe(false);
    expect(impact.content.valid).toBe(false);
  });
  it('does not require content migration for explicit repeated:false alongside safe additions', async () => {
    const current = workspace();
    const before = structuredClone(current);
    const next = target((schema) => {
      schema.nodes.product!.repeated = false;
      schema.nodes.product!.contentKind = 'structured';
      schema.nodes.requirements!.slots!.advantage = { type: 'string' };
    });
    const impact = await assessWorkspaceSchemaImpact(db, 'project', current, next);
    expect(impact).toMatchObject({
      status: 'safe',
      canAdopt: true,
      canPublish: true,
      content: { valid: true, ready: true, issues: [] },
    });
    expect(impact.changes.map((change) => change.path)).toEqual([
      'nodes.product.contentKind',
      'nodes.requirements.slots.advantage',
    ]);
    expect(impact.items.some((item) => item.kind === 'needs_mapping')).toBe(false);
    expect(impact.content.hash).toBe(
      (await assessWorkspaceSchemaImpact(db, 'project', current, base)).content.hash
    );
    expect(current).toEqual(before);
  });

  it('does not require migration when removing an explicit repeated:false', async () => {
    const explicit = target((schema) => {
      schema.nodes.product!.repeated = false;
    });
    vi.mocked(resolveWorkspaceYSchema).mockResolvedValueOnce({
      canonicalName: 'team/product',
      schema: explicit,
    });
    const impact = await assessWorkspaceSchemaImpact(db, 'project', workspace(), base);
    expect(impact).toMatchObject({ status: 'safe', changes: [], canAdopt: true, canPublish: true });
  });

  it('still requires conversion when a single product really becomes repeated', async () => {
    const next = target((schema) => {
      schema.nodes.product!.repeated = true;
    });
    const impact = await assessWorkspaceSchemaImpact(db, 'project', workspace(), next);
    expect(impact).toMatchObject({ status: 'needs_mapping', canAdopt: false });
    expect(impact.items).toContainEqual(
      expect.objectContaining({
        code: 'SHAPE_CHANGE_REQUIRES_MAPPING',
        path: 'nodes.product.repeated',
        affectedPaths: expect.arrayContaining(['product', 'product/title']),
      })
    );
  });

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

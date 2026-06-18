import { describe, expect, it } from 'vitest';
import type { Relation, SemanticContent, TreeNode } from '../../semantic/types';
import { applySourcedYOps, applyYOps } from '../engine';
import { YOpSchema } from '../schema';
import type { SourcedYOp, YOp } from '../types';

// ── Helpers ──

const node = (key: string, slots: TreeNode['slots'] = {}, children: TreeNode[] = []): TreeNode => ({
  key,
  slots,
  children,
});

const content = (trees: TreeNode[] = [], relations: Relation[] = []): SemanticContent => ({
  trees,
  relations,
});

// ── Tests ──

describe('applyYOps (t3x adapter engine)', () => {
  it('applies define + populate via generic engine', () => {
    const result = applyYOps(content(), [
      { define: { path: 'trip' } },
      { populate: { path: 'trip', values: { budget: 5000, destination: 'Tokyo' } } },
    ]);

    expect(result.ok).toBe(true);
    expect(result.applied).toBe(2);
    expect(result.trees).toHaveLength(1);
    expect(result.trees[0].key).toBe('trip');
    expect(result.trees[0].slots).toEqual({ budget: 5000, destination: 'Tokyo' });
  });

  it('applies set on existing tree', () => {
    const input = content([node('trip', { budget: 5000, destination: 'Tokyo' })]);

    const result = applyYOps(input, [{ set: { path: 'trip/budget', value: 8000 } }]);

    expect(result.ok).toBe(true);
    expect(result.applied).toBe(1);
    expect(result.trees[0].slots.budget).toBe(8000);
    expect(result.trees[0].slots.destination).toBe('Tokyo');
  });

  it('returns error for invalid path', () => {
    const input = content([node('trip', { budget: 5000 })]);

    // populate on a non-existent path returns PATH_NOT_FOUND
    const result = applyYOps(input, [{ populate: { path: 'nonexistent', values: { x: 1 } } }]);

    expect(result.ok).toBe(false);
    expect(result.error).toBeDefined();
    expect(result.applied).toBe(0);
  });

  it('applies relate operation', () => {
    const input = content([
      node('budget', { amount: 5000 }),
      node('trip', { destination: 'Tokyo' }),
    ]);

    const result = applyYOps(input, [
      { relate: { from: 'budget', to: 'trip', type: 'conditions' } },
    ]);

    expect(result.ok).toBe(true);
    expect(result.applied).toBe(1);
    expect(result.relations).toEqual([{ from: 'budget', to: 'trip', type: 'conditions' }]);
  });

  it('applies schema-defined relate operation without legacy relation enum coupling', () => {
    const input = content([
      node('requirements', {}, [
        node('schema_contract', { title: 'Define schema contract' }),
        node('review_gate', { title: 'Review schema verdict before commit' }),
      ]),
    ]);
    const op: YOp = {
      relate: {
        from: 'requirements/review_gate',
        to: 'requirements/schema_contract',
        type: 'depends_on',
      },
    };

    expect(YOpSchema.safeParse(op).success).toBe(true);

    const result = applyYOps(input, [op]);

    expect(result.ok).toBe(true);
    expect(result.applied).toBe(1);
    expect(result.relations).toEqual([
      {
        from: 'requirements/review_gate',
        to: 'requirements/schema_contract',
        type: 'depends_on',
      },
    ]);
  });

  it('applies unrelate operation', () => {
    const input = content(
      [node('budget', { amount: 5000 }), node('trip', { destination: 'Tokyo' })],
      [{ from: 'budget', to: 'trip', type: 'conditions' }]
    );

    const result = applyYOps(input, [
      { unrelate: { from: 'budget', to: 'trip', type: 'conditions' } },
    ]);

    expect(result.ok).toBe(true);
    expect(result.applied).toBe(1);
    expect(result.relations).toEqual([]);
  });

  it('unrelate is idempotent — no error if relation not found', () => {
    const input = content([node('budget', { amount: 5000 })]);

    const result = applyYOps(input, [
      { unrelate: { from: 'budget', to: 'trip', type: 'conditions' } },
    ]);

    expect(result.ok).toBe(true);
    expect(result.applied).toBe(1);
    expect(result.relations).toEqual([]);
  });

  it('rejects self-relation', () => {
    const input = content([node('trip', { destination: 'Tokyo' })]);

    const result = applyYOps(input, [{ relate: { from: 'trip', to: 'trip', type: 'causes' } }]);

    expect(result.ok).toBe(false);
    expect(result.error?.code).toBe('RELATE_SELF');
    expect(result.applied).toBe(0);
  });

  it('rejects duplicate relation', () => {
    const input = content(
      [node('budget', { amount: 5000 }), node('trip', { destination: 'Tokyo' })],
      [{ from: 'budget', to: 'trip', type: 'conditions' }]
    );

    const result = applyYOps(input, [
      { relate: { from: 'budget', to: 'trip', type: 'conditions' } },
    ]);

    expect(result.ok).toBe(false);
    expect(result.error?.code).toBe('RELATE_DUPLICATE');
    expect(result.applied).toBe(0);
  });

  it('relate fails if node not found', () => {
    const input = content([node('trip', { destination: 'Tokyo' })]);

    // "from" exists but "to" does not
    const result = applyYOps(input, [
      { relate: { from: 'trip', to: 'nonexistent', type: 'depends' } },
    ]);

    expect(result.ok).toBe(false);
    expect(result.error?.code).toBe('RELATE_NOT_FOUND');
    expect(result.applied).toBe(0);

    // "from" does not exist
    const result2 = applyYOps(input, [
      { relate: { from: 'nonexistent', to: 'trip', type: 'depends' } },
    ]);

    expect(result2.ok).toBe(false);
    expect(result2.error?.code).toBe('RELATE_NOT_FOUND');
  });

  it('does not mutate input', () => {
    const input = content(
      [node('trip', { budget: 5000 })],
      [{ from: 'trip', to: 'other', type: 'causes' }]
    );

    // Freeze references to detect mutation
    const originalTrees = JSON.stringify(input.trees);
    const originalRelations = JSON.stringify(input.relations);

    applyYOps(input, [{ set: { path: 'trip/budget', value: 9999 } }]);

    expect(JSON.stringify(input.trees)).toBe(originalTrees);
    expect(JSON.stringify(input.relations)).toBe(originalRelations);
  });

  it('interleaves generic and relate ops', () => {
    const result = applyYOps(content(), [
      { define: { path: 'budget' } },
      { populate: { path: 'budget', values: { amount: 5000 } } },
      { define: { path: 'trip' } },
      { populate: { path: 'trip', values: { destination: 'Tokyo' } } },
      { relate: { from: 'budget', to: 'trip', type: 'conditions' } },
    ]);

    expect(result.ok).toBe(true);
    expect(result.applied).toBe(5);
    expect(result.trees).toHaveLength(2);
    expect(result.relations).toEqual([{ from: 'budget', to: 'trip', type: 'conditions' }]);
  });

  it('preserves basic tree structure through conversion round-trip', () => {
    const input = content([
      node('trip', { budget: 5000, destination: 'Tokyo' }, [
        node('day_one', { activity: 'sightseeing' }),
      ]),
    ]);

    const result = applyYOps(input, [{ set: { path: 'trip/budget', value: 8000 } }]);

    expect(result.ok).toBe(true);
    const trip = result.trees[0];
    expect(trip.key).toBe('trip');
    expect(trip.slots.budget).toBe(8000);
    expect(trip.slots.destination).toBe('Tokyo');
    expect(trip.children).toHaveLength(1);
    expect(trip.children[0].key).toBe('day_one');
    expect(trip.children[0].slots.activity).toBe('sightseeing');
  });
});

const empty = { trees: [], relations: [] };

describe('applySourcedYOps', () => {
  it('rejects op missing source', () => {
    const op = { define: { path: 'root' } } as unknown as SourcedYOp;
    const r = applySourcedYOps(empty, [op]);
    expect(r.ok).toBe(false);
    expect(r.error?.code).toBe('MISSING_SOURCE');
  });

  it('rejects op with invalid source type', () => {
    const op = {
      define: { path: 'root' },
      source: { type: 'robot' },
    } as unknown as SourcedYOp;
    const r = applySourcedYOps(empty, [op]);
    expect(r.ok).toBe(false);
    expect(r.error?.code).toBe('INVALID_SOURCE_TYPE');
  });

  it('rejects human op with empty author', () => {
    const op = {
      define: { path: 'root' },
      source: { type: 'human', author: '', at: '2026-04-12T00:00:00Z' },
    } as unknown as SourcedYOp;
    const r = applySourcedYOps(empty, [op]);
    expect(r.ok).toBe(false);
    expect(r.error?.code).toBe('MISSING_AUTHOR');
  });

  it('accepts op with valid human source', () => {
    const op: SourcedYOp = {
      define: { path: 'root' },
      source: { type: 'human', author: 'ethan', at: '2026-04-12T00:00:00Z' },
    };
    const r = applySourcedYOps(empty, [op]);
    expect(r.ok).toBe(true);
  });
});

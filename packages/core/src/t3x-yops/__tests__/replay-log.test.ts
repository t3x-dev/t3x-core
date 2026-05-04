import { describe, expect, it } from 'vitest';
import { replayYOpsLog } from '../replay';

describe('replayYOpsLog', () => {
  it('replays valid entries and skips invalid ones', () => {
    const snapshot = replayYOpsLog([
      {
        id: 'yops_1',
        source: 'pipeline',
        turn_hash: 'sha256:turn-1',
        created_at: '2026-04-21T00:00:00.000Z',
        yops: [{ define: { path: 'trip_plan' } }],
      },
      {
        id: 'yops_2',
        source: 'pipeline',
        turn_hash: 'sha256:turn-2',
        created_at: '2026-04-21T00:01:00.000Z',
        yops: { invalid: true },
      },
    ]);

    expect(snapshot).toEqual({
      trees: [{ key: 'trip_plan', slots: {}, children: [] }],
      relations: [],
    });
  });

  it('replays sourced relate ops from persisted yops_log entries', () => {
    const snapshot = replayYOpsLog([
      {
        id: 'yops_1',
        source: 'pipeline',
        turn_hash: 'sha256:turn-1',
        created_at: '2026-04-21T00:00:00.000Z',
        yops: [{ define: { path: 'trip' } }, { define: { path: 'budget' } }],
      },
      {
        id: 'yops_2',
        source: 'manual',
        turn_hash: null,
        created_at: '2026-04-21T00:01:00.000Z',
        yops: [
          {
            relate: { from: 'budget', to: 'trip', type: 'conditions' },
            source: {
              type: 'human',
              author: 'api:drift-keep-both-together',
              at: '2026-04-21T00:01:00.000Z',
            },
          },
        ],
      },
    ]);

    expect(snapshot.relations).toEqual([{ from: 'budget', to: 'trip', type: 'conditions' }]);
  });

  it('preserves array slot values through replay (canonicalize-proposed-yops round-trip)', () => {
    // Canonicalization upstream emits arrays for multi-value slots. The
    // replay path is the round-trip we depend on at Apply time — if it
    // collapsed arrays back to strings the canonicalization would be
    // cosmetic. Pin both `set.value` and `populate.values[k]`.
    const snapshot = replayYOpsLog([
      {
        id: 'yops_1',
        source: 'pipeline',
        turn_hash: 'sha256:t1',
        created_at: '2026-04-21T00:00:00.000Z',
        yops: [
          { define: { path: 'cameras' } },
          { define: { path: 'cameras/r5' } },
          {
            set: {
              path: 'cameras/r5/primary_use_case',
              value: ['landscape', 'studio', 'fashion'],
            },
          },
          {
            populate: {
              path: 'cameras/r5',
              values: {
                tags: ['sports', 'wildlife'],
                resolution: '61 megapixels',
              },
            },
          },
        ],
      },
    ]);

    const r5 = snapshot.trees[0]?.children?.[0];
    expect(r5?.slots?.primary_use_case).toEqual(['landscape', 'studio', 'fashion']);
    expect(r5?.slots?.tags).toEqual(['sports', 'wildlife']);
    expect(r5?.slots?.resolution).toBe('61 megapixels');
  });
});

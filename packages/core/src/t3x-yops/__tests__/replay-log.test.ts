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
});

import type { SourcedYOp } from '@t3x-dev/core';
import { describe, expect, it } from 'vitest';
import { buildMaterializedOpGroups } from '@/domain/yops/opCardGroups';

describe('buildMaterializedOpGroups', () => {
  it('groups materialized ops by source family', () => {
    const groups = buildMaterializedOpGroups({
      ops: [
        {
          define: { path: 'trip' },
          source: { type: 'llm', model: 'gpt', at: '2026-01-01T00:00:00.000Z' },
        },
        {
          set: { path: 'trip/destination', value: 'Kyoto' },
          source: {
            type: 'human',
            author: 'ethan',
            surface: 'script',
            at: '2026-01-02T00:00:00.000Z',
          },
        },
        {
          set: { path: 'trip/style', value: 'quiet' },
          source: {
            type: 'human',
            author: 'ethan',
            surface: 'tree',
            at: '2026-01-03T00:00:00.000Z',
          },
        },
      ] as unknown as SourcedYOp[],
      pendingDraftOps: [],
      scriptDirty: false,
    });

    expect(groups.ai.count).toBe(1);
    expect(groups.user.count).toBe(2);
    expect(groups.user.surfaces).toEqual({ script: 1, tree: 1, inline: 0, unknown: 0 });
    expect(groups.pending.count).toBe(0);
  });

  it('counts pending draft and dirty editor states', () => {
    const groups = buildMaterializedOpGroups({
      ops: [],
      pendingDraftOps: [
        {
          define: { path: 'trip' },
          source: { type: 'llm', model: 'gpt', at: '2026-01-01T00:00:00.000Z' },
        },
      ] as unknown as SourcedYOp[],
      scriptDirty: true,
    });

    expect(groups.pending.count).toBe(2);
    expect(groups.pending.reasons).toEqual(['staged-draft', 'dirty-script']);
  });
});

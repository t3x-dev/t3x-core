/** biome-ignore-all lint/suspicious/noExplicitAny: gate tests intentionally use loose fixtures to verify autofix normalization */

import { describe, expect, it } from 'vitest';
import { autoFixPaths, autoFixYOp } from '../../ops/gates/autofix';
import type { TreeNode } from '../../semantic/types';
import type { YOp } from '../../t3x-yops/types';

describe('autoFixYOp', () => {
  it('strips extra fields from unset (source/from)', () => {
    const raw = {
      unset: {
        path: 'tokyo_trip/accommodation/ryokan',
        source: 'cancel the ryokan idea',
        from: 'T5',
      },
    };

    const result = autoFixYOp(raw);
    expect(result).not.toBeNull();
    expect(result!.fixed).toEqual({
      unset: { path: 'tokyo_trip/accommodation/ryokan' },
    });
    expect(result!.fixes).toContain('stripped extra fields [source, from] from unset');
  });

  it('strips extra fields from drop (source/from/reason)', () => {
    const raw = {
      drop: {
        path: 'tokyo_trip/old_node',
        source: 'remove this',
        from: 'T3',
        reason: 'outdated',
      },
    };

    const result = autoFixYOp(raw);
    expect(result).not.toBeNull();
    expect(result!.fixed).toEqual({
      drop: { path: 'tokyo_trip/old_node' },
    });
  });

  it('replaces . with / in path', () => {
    const raw = {
      unset: { path: 'tokyo_trip.accommodation.ryokan' },
    };

    const result = autoFixYOp(raw);
    expect(result).not.toBeNull();
    expect(result!.fixed).toEqual({
      unset: { path: 'tokyo_trip/accommodation/ryokan' },
    });
    expect(result!.fixes).toContain('replaced . with / in path');
  });

  it('converts camelCase path to snake_case', () => {
    const raw = {
      unset: { path: 'tokyoTrip/accommodation' },
    };

    const result = autoFixYOp(raw);
    expect(result).not.toBeNull();
    expect(result!.fixed).toEqual({
      unset: { path: 'tokyo_trip/accommodation' },
    });
  });

  it('returns null for ops that need no fixing', () => {
    const raw = {
      set: {
        path: 'tokyo_trip/budget',
        value: 7000,
      },
    };

    const result = autoFixYOp(raw);
    expect(result).toBeNull();
  });

  it('returns null for unrecognized op type', () => {
    const raw = { unknown_op: { foo: 'bar' } };
    const result = autoFixYOp(raw);
    expect(result).toBeNull();
  });

  it('handles multiple fixes at once', () => {
    const raw = {
      rename: {
        path: 'tokyoTrip.accommodation',
        to: 'lodging',
        source: 'rename it',
        from: 'T5',
      },
    };

    const result = autoFixYOp(raw);
    expect(result).not.toBeNull();
    expect(result!.fixed).toEqual({
      rename: { path: 'tokyo_trip/accommodation', to: 'lodging' },
    });
    expect(result!.fixes.length).toBeGreaterThanOrEqual(2);
  });
});

describe('autoFixPaths', () => {
  const trees: TreeNode[] = [
    {
      key: 'construction_saas',
      slots: { budget: 200000 },
      children: [
        {
          key: 'company_info',
          slots: { team_size: 3, runway: 200000 },
          children: [],
        },
        {
          key: 'tech_stack',
          slots: { frontend: 'React Native' },
          children: [
            {
              key: 'backend',
              slots: { framework: 'Supabase' },
              children: [],
            },
          ],
        },
      ],
    },
  ];

  it('resolves partial path to full path (missing root)', () => {
    const yop: YOp = { set: { path: 'company_info/team_size', value: 4 } };
    const result = autoFixPaths(yop, trees);
    expect(result).not.toBeNull();
    expect((result!.fixed as any).set.path).toBe('construction_saas/company_info/team_size');
  });

  it('resolves deeply nested partial path', () => {
    const yop: YOp = { set: { path: 'backend/framework', value: 'AWS' } };
    const result = autoFixPaths(yop, trees);
    expect(result).not.toBeNull();
    expect((result!.fixed as any).set.path).toBe('construction_saas/tech_stack/backend/framework');
  });

  it('returns null when path is already correct', () => {
    const yop: YOp = { set: { path: 'construction_saas/company_info/team_size', value: 4 } };
    const result = autoFixPaths(yop, trees);
    expect(result).toBeNull();
  });

  it('returns null for root-level define', () => {
    const yop: YOp = { define: { path: 'new_node' } };
    const result = autoFixPaths(yop, trees);
    expect(result).toBeNull();
  });

  it('resolves partial path in define operations', () => {
    const yop: YOp = { define: { path: 'company_info/role' } };
    const result = autoFixPaths(yop, trees);
    expect(result).not.toBeNull();
    expect((result!.fixed as any).define.path).toBe('construction_saas/company_info/role');
  });
});

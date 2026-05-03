// @vitest-environment jsdom

import type { SourcedYOp } from '@t3x-dev/core';
import { act, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { splitOpsByCommittedness, YOpsLogPanel } from '@/components/chat/YOpsLogPanel';
import { useWorkspaceStore } from '@/store/workspaceStore';

function humanOp(): SourcedYOp {
  return {
    set: { path: 'trip/destination', value: 'Hangzhou' },
    source: { type: 'human', author: 'alice', at: new Date().toISOString() },
  } as SourcedYOp;
}

function llmOp(): SourcedYOp {
  return {
    define: { path: 'sights' },
    source: {
      type: 'llm',
      model: 'test-model',
      at: new Date().toISOString(),
      turn_ref: {
        turn_hash: 'sha256:abcdef1234567890',
        quote: 'sights',
        start_char: 0,
        end_char: 6,
      },
    },
  } as SourcedYOp;
}

describe('YOpsLogPanel', () => {
  beforeEach(() => {
    useWorkspaceStore.getState().reset();
  });
  afterEach(() => {
    useWorkspaceStore.getState().reset();
  });

  it('renders an empty state when no ops are in the log', () => {
    const { container } = render(<YOpsLogPanel />);
    expect(container.textContent).toContain('empty');
    expect(container.querySelectorAll('[data-testid^="yops-log-op-"]').length).toBe(0);
  });

  it('renders one row per op in the log with verb and summary', () => {
    act(() => {
      useWorkspaceStore.getState().setDerived({
        tree: { trees: [], relations: [] },
        sourceIndex: new Map(),
        opsLog: [humanOp(), llmOp()],
      });
    });

    const { container } = render(<YOpsLogPanel />);
    const rows = container.querySelectorAll('[data-testid^="yops-log-op-"]');
    expect(rows.length).toBe(2);

    const first = rows[0].textContent ?? '';
    expect(first).toContain('set');
    expect(first).toContain('Set trip.destination to "Hangzhou"');
    expect(first.toLowerCase()).toContain('you');

    const second = rows[1].textContent ?? '';
    expect(second).toContain('define');
    expect(second).toContain('Created sights');
    expect(second.toLowerCase()).toContain('llm');
  });

  it('renders counts in the header for human vs llm sources', () => {
    act(() => {
      useWorkspaceStore.getState().setDerived({
        tree: { trees: [], relations: [] },
        sourceIndex: new Map(),
        opsLog: [humanOp(), humanOp(), llmOp()],
      });
    });
    const { container } = render(<YOpsLogPanel />);
    const header = container.textContent ?? '';
    expect(header).toMatch(/3\s*ops/i);
    expect(header).toMatch(/2\s*you/i);
    expect(header).toMatch(/1\s*llm/i);
  });

  describe('tab data sources (workbench plan §8)', () => {
    function rowMeta(id: string, isCommitted: boolean) {
      return {
        id,
        source: 'manual' as const,
        turnHash: null,
        createdAt: '2026-04-26T00:00:00Z',
        supersededAt: null,
        isCommitted,
        committedBy: isCommitted ? ['sha256:c1'] : [],
        opCount: 1,
      };
    }

    it('Draft tab reads from draftOps, not opsLog', () => {
      act(() => {
        useWorkspaceStore.getState().setDerived({
          tree: { trees: [], relations: [] },
          sourceIndex: new Map(),
          opsLog: [humanOp()],
        });
        useWorkspaceStore.getState().setDraft({
          ops: [llmOp()],
          tree: { trees: [], relations: [] },
        });
      });

      const { container } = render(<YOpsLogPanel tab="draft" />);
      const rows = container.querySelectorAll('[data-testid^="yops-log-op-"]');
      expect(rows.length).toBe(1);
      // Draft tab shows the staged llm op (Created sights), not the
      // opsLog's human op (Set trip.destination).
      expect(rows[0].textContent).toContain('Created sights');
      expect(container.textContent).not.toContain('Hangzhou');
    });

    it('Applied tab shows only opsLog rows where isCommitted === false', () => {
      act(() => {
        useWorkspaceStore.getState().setDerived({
          tree: { trees: [], relations: [] },
          sourceIndex: new Map(),
          opsLog: [humanOp(), llmOp()],
          rowsById: {
            yl_applied: rowMeta('yl_applied', false),
            yl_committed: rowMeta('yl_committed', true),
          },
          opOrigins: [
            { rowId: 'yl_applied', opIndexInRow: 0 },
            { rowId: 'yl_committed', opIndexInRow: 0 },
          ],
        });
      });

      const { container } = render(<YOpsLogPanel tab="applied" />);
      const rows = container.querySelectorAll('[data-testid^="yops-log-op-"]');
      expect(rows.length).toBe(1);
      expect(rows[0].textContent).toContain('Hangzhou');
      // Committed op is filtered out.
      expect(container.textContent).not.toContain('Created sights');
    });

    it('Committed tab shows only opsLog rows where isCommitted === true', () => {
      act(() => {
        useWorkspaceStore.getState().setDerived({
          tree: { trees: [], relations: [] },
          sourceIndex: new Map(),
          opsLog: [humanOp(), llmOp()],
          rowsById: {
            yl_applied: rowMeta('yl_applied', false),
            yl_committed: rowMeta('yl_committed', true),
          },
          opOrigins: [
            { rowId: 'yl_applied', opIndexInRow: 0 },
            { rowId: 'yl_committed', opIndexInRow: 0 },
          ],
        });
      });

      const { container } = render(<YOpsLogPanel tab="committed" />);
      const rows = container.querySelectorAll('[data-testid^="yops-log-op-"]');
      expect(rows.length).toBe(1);
      expect(rows[0].textContent).toContain('Created sights');
      expect(container.textContent).not.toContain('Hangzhou');
    });

    it('ops without row metadata classify as applied (selectActiveUncommittedRowCount fallback)', () => {
      act(() => {
        useWorkspaceStore.getState().setDerived({
          tree: { trees: [], relations: [] },
          sourceIndex: new Map(),
          opsLog: [humanOp()],
          // No rowsById entry, no opOrigins — the conservative fallback
          // treats the op as active uncommitted, matching the
          // `selectActiveUncommittedRowCount` "hasUnknownOrigin" branch.
        });
      });

      const applied = render(<YOpsLogPanel tab="applied" />);
      expect(applied.container.querySelectorAll('[data-testid^="yops-log-op-"]').length).toBe(1);

      const committed = render(<YOpsLogPanel tab="committed" />);
      expect(committed.container.querySelectorAll('[data-testid^="yops-log-op-"]').length).toBe(0);
    });

    it('renders a tab-specific empty state when the slice is empty', () => {
      const draft = render(<YOpsLogPanel tab="draft" />);
      expect(draft.container.textContent).toContain('No draft staged');

      const applied = render(<YOpsLogPanel tab="applied" />);
      expect(applied.container.textContent).toContain('No applied ops');

      const committed = render(<YOpsLogPanel tab="committed" />);
      expect(committed.container.textContent).toContain('No committed ops');
    });

    it('splitOpsByCommittedness pure helper: one applied, one committed', () => {
      const ops = [humanOp(), llmOp()];
      const origins = [
        { rowId: 'yl_a', opIndexInRow: 0 },
        { rowId: 'yl_c', opIndexInRow: 0 },
      ];
      const rows = {
        yl_a: { isCommitted: false },
        yl_c: { isCommitted: true },
      };
      const { applied, committed } = splitOpsByCommittedness(ops, origins, rows);
      expect(applied).toEqual([humanOp()].map((op) => ({ ...op, source: applied[0].source })));
      expect(applied.length).toBe(1);
      expect(committed.length).toBe(1);
      // Verify the actual op identities (not just lengths) by checking
      // the verb-bearing key.
      expect((applied[0] as { set?: unknown }).set).toBeDefined();
      expect((committed[0] as { define?: unknown }).define).toBeDefined();
    });
  });
});

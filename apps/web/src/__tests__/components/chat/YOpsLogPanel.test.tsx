// @vitest-environment jsdom

import '@testing-library/jest-dom';
import type { SourcedYOp } from '@t3x-dev/core';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { splitOpsByCommittedness, YOpsLogPanel } from '@/components/chat/YOpsLogPanel';
import { useWorkspaceStore } from '@/store/workspaceStore';

function humanOp(): SourcedYOp {
  return {
    set: { path: 'trip/destination', value: 'Hangzhou' },
    source: { type: 'human', author: 'alice', at: new Date().toISOString() },
  } as SourcedYOp;
}

function scriptOp(): SourcedYOp {
  return {
    set: { path: 'trip/style', value: 'quiet' },
    source: {
      type: 'human',
      author: 'alice',
      surface: 'script',
      at: new Date().toISOString(),
    },
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
    act(() => {
      useWorkspaceStore.getState().reset();
    });
  });
  afterEach(() => {
    act(() => {
      useWorkspaceStore.getState().reset();
    });
  });

  it('renders an empty state when no ops are in the log', () => {
    const { container } = render(<YOpsLogPanel />);
    expect(screen.getByText('No YOps editor changes applied yet.')).toBeInTheDocument();
    expect(screen.getByText('No YAML tree edits applied yet.')).toBeInTheDocument();
    expect(screen.getByText('No source include/exclude edits applied yet.')).toBeInTheDocument();
    expect(
      container.querySelectorAll('[data-testid^="yops-log-op-"]:not([data-testid*="-link"])').length
    ).toBe(0);
  });

  it('renders materialized ops grouped by source by default', () => {
    act(() => {
      useWorkspaceStore.getState().setDerived({
        tree: { trees: [], relations: [] },
        sourceIndex: new Map(),
        opsLog: [
          llmOp(),
          scriptOp(),
          {
            set: { path: 'trip/destination', value: 'Hangzhou' },
            source: {
              type: 'human',
              author: 'alice',
              at: new Date().toISOString(),
              surface: 'tree',
            },
          } as SourcedYOp,
        ],
      });
    });

    render(<YOpsLogPanel />);
    expect(screen.getByText('AI proposal')).toBeInTheDocument();
    const scriptGroup = screen.getByText('YOps editor').closest('section');
    expect(scriptGroup).toBeInTheDocument();
    expect(
      within(scriptGroup as HTMLElement).getByText('Set trip.style to "quiet"')
    ).toBeInTheDocument();

    const treeGroup = screen.getByText('Tree edits').closest('section');
    expect(treeGroup).toBeInTheDocument();
    expect(
      within(treeGroup as HTMLElement).getByText('Set trip.destination to "Hangzhou"')
    ).toBeInTheDocument();
    expect(within(treeGroup as HTMLElement).getByText(/via Tree/)).toBeInTheDocument();
  });

  it('keeps pending count separate from materialized op total', () => {
    act(() => {
      useWorkspaceStore.getState().setDerived({
        tree: { trees: [], relations: [] },
        sourceIndex: new Map(),
        opsLog: [llmOp()],
      });
      useWorkspaceStore.getState().setDraft({
        ops: [llmOp(), llmOp()],
        tree: { trees: [], relations: [] },
      });
      useWorkspaceStore.getState().setEditorOverride('yops:\n  - define:\n      path: changed\n');
    });

    render(<YOpsLogPanel />);
    const aiGroup = screen.getByText('AI proposal').closest('section');
    expect(aiGroup).toBeInTheDocument();
    expect(within(aiGroup as HTMLElement).getByText('1')).toBeInTheDocument();

    const pendingGroup = screen.getByText('Pending').closest('section');
    expect(pendingGroup).toBeInTheDocument();
    expect(within(pendingGroup as HTMLElement).getByText('3')).toBeInTheDocument();
  });

  it('renders one row per op in the log with verb and summary', () => {
    act(() => {
      useWorkspaceStore.getState().setDerived({
        tree: { trees: [], relations: [] },
        sourceIndex: new Map(),
        opsLog: [humanOp(), llmOp()],
      });
    });

    const { container } = render(<YOpsLogPanel mode="ledger" />);
    const rows = container.querySelectorAll(
      '[data-testid^="yops-log-op-"]:not([data-testid*="-link"])'
    );
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

  it('renders one ledger row per op after removing the summary header', () => {
    act(() => {
      useWorkspaceStore.getState().setDerived({
        tree: { trees: [], relations: [] },
        sourceIndex: new Map(),
        opsLog: [humanOp(), humanOp(), llmOp()],
      });
    });
    const { container } = render(<YOpsLogPanel mode="ledger" />);
    expect(
      container.querySelectorAll('[data-testid^="yops-log-op-"]:not([data-testid*="-link"])').length
    ).toBe(3);
    expect(container.textContent).toContain('you');
    expect(container.textContent).toContain('llm');
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

    // Filter out PR 4's quote-link testids so we count rows, not links.
    const ROWS_ONLY = '[data-testid^="yops-log-op-"]:not([data-testid*="-link"])';

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

      const { container } = render(<YOpsLogPanel tab="draft" mode="ledger" />);
      const rows = container.querySelectorAll(ROWS_ONLY);
      expect(rows.length).toBe(1);
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

      const { container } = render(<YOpsLogPanel tab="applied" mode="ledger" />);
      const rows = container.querySelectorAll(ROWS_ONLY);
      expect(rows.length).toBe(1);
      expect(rows[0].textContent).toContain('Hangzhou');
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

      const { container } = render(<YOpsLogPanel tab="committed" mode="ledger" />);
      const rows = container.querySelectorAll(ROWS_ONLY);
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
        });
      });

      const applied = render(<YOpsLogPanel tab="applied" mode="ledger" />);
      expect(applied.container.querySelectorAll(ROWS_ONLY).length).toBe(1);

      const committed = render(<YOpsLogPanel tab="committed" mode="ledger" />);
      expect(committed.container.querySelectorAll(ROWS_ONLY).length).toBe(0);
    });

    it('renders a tab-specific empty state when the slice is empty', () => {
      const draft = render(<YOpsLogPanel tab="draft" mode="ledger" />);
      expect(draft.container.textContent).toContain('No draft staged');

      const applied = render(<YOpsLogPanel tab="applied" mode="ledger" />);
      expect(applied.container.textContent).toContain('No applied ops');

      const committed = render(<YOpsLogPanel tab="committed" mode="ledger" />);
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
      expect(applied.length).toBe(1);
      expect(committed.length).toBe(1);
      expect((applied[0] as { set?: unknown }).set).toBeDefined();
      expect((committed[0] as { define?: unknown }).define).toBeDefined();
    });
  });

  describe('provenance click-through (PR 4)', () => {
    beforeEach(() => {
      Element.prototype.scrollIntoView = vi.fn();
    });

    it('clicking the collapsed-row quote excerpt scrolls the chat to the source turn', () => {
      const turn = document.createElement('div');
      turn.setAttribute('data-turn-hash', 'sha256:abcdef1234567890');
      document.body.appendChild(turn);

      act(() => {
        useWorkspaceStore.getState().setDerived({
          tree: { trees: [], relations: [] },
          sourceIndex: new Map(),
          opsLog: [llmOp()],
        });
      });

      const { container } = render(<YOpsLogPanel mode="ledger" />);
      const quoteLink = container.querySelector(
        '[data-testid="yops-log-op-0-quote-link"]'
      ) as HTMLElement;
      expect(quoteLink).toBeTruthy();
      fireEvent.click(quoteLink);

      expect(turn.scrollIntoView).toHaveBeenCalled();
      expect(turn.getAttribute('data-scroll-highlight')).toBe('true');

      document.body.removeChild(turn);
    });

    it('clicking the quote excerpt does not toggle the disclosure (stopPropagation)', () => {
      const turn = document.createElement('div');
      turn.setAttribute('data-turn-hash', 'sha256:abcdef1234567890');
      document.body.appendChild(turn);

      act(() => {
        useWorkspaceStore.getState().setDerived({
          tree: { trees: [], relations: [] },
          sourceIndex: new Map(),
          opsLog: [llmOp()],
        });
      });

      const { container } = render(<YOpsLogPanel mode="ledger" />);
      expect(container.textContent ?? '').not.toContain('YOps core');

      const quoteLink = container.querySelector(
        '[data-testid="yops-log-op-0-quote-link"]'
      ) as HTMLElement;
      fireEvent.click(quoteLink);

      expect(container.textContent ?? '').not.toContain('YOps core');

      document.body.removeChild(turn);
    });

    it('disclosure quote button also scrolls when expanded', () => {
      const turn = document.createElement('div');
      turn.setAttribute('data-turn-hash', 'sha256:abcdef1234567890');
      document.body.appendChild(turn);

      act(() => {
        useWorkspaceStore.getState().setDerived({
          tree: { trees: [], relations: [] },
          sourceIndex: new Map(),
          opsLog: [llmOp()],
        });
      });

      const { container } = render(<YOpsLogPanel mode="ledger" />);
      const row = container.querySelector('[data-testid="yops-log-op-0"] > button') as HTMLElement;
      fireEvent.click(row);

      const disclosureQuote = container.querySelector(
        '[data-testid="yops-log-op-0-disclosure-quote-link"]'
      ) as HTMLElement;
      expect(disclosureQuote).toBeTruthy();
      fireEvent.click(disclosureQuote);

      expect(turn.scrollIntoView).toHaveBeenCalled();

      document.body.removeChild(turn);
    });

    it('human ops have no quote link to render (provenance is null)', () => {
      act(() => {
        useWorkspaceStore.getState().setDerived({
          tree: { trees: [], relations: [] },
          sourceIndex: new Map(),
          opsLog: [humanOp()],
        });
      });
      const { container } = render(<YOpsLogPanel mode="ledger" />);
      expect(container.querySelector('[data-testid="yops-log-op-0-quote-link"]')).toBeNull();
    });
  });

  describe('human edit surface (provenance "where")', () => {
    function humanOpWithSurface(surface: 'tree' | 'script' | 'inline'): SourcedYOp {
      return {
        set: { path: 'trip/destination', value: 'Hangzhou' },
        source: { type: 'human', author: 'alice', at: new Date().toISOString(), surface },
      } as SourcedYOp;
    }

    it('renders "via Tree" suffix for tree edits', () => {
      act(() => {
        useWorkspaceStore.getState().setDerived({
          tree: { trees: [], relations: [] },
          sourceIndex: new Map(),
          opsLog: [humanOpWithSurface('tree')],
        });
      });
      const { container } = render(<YOpsLogPanel mode="ledger" />);
      const surfaceTag = container.querySelector('[data-testid="yops-log-op-0-surface"]');
      expect(surfaceTag).toBeTruthy();
      expect(surfaceTag?.textContent).toContain('via Tree');
    });

    it('renders "via YOps" for script editor edits', () => {
      act(() => {
        useWorkspaceStore.getState().setDerived({
          tree: { trees: [], relations: [] },
          sourceIndex: new Map(),
          opsLog: [humanOpWithSurface('script')],
        });
      });
      const { container } = render(<YOpsLogPanel mode="ledger" />);
      const surfaceTag = container.querySelector('[data-testid="yops-log-op-0-surface"]');
      expect(surfaceTag?.textContent).toContain('via YOps');
    });

    it('omits the suffix entirely for legacy human rows without a surface', () => {
      act(() => {
        useWorkspaceStore.getState().setDerived({
          tree: { trees: [], relations: [] },
          sourceIndex: new Map(),
          opsLog: [humanOp()],
        });
      });
      const { container } = render(<YOpsLogPanel mode="ledger" />);
      expect(container.querySelector('[data-testid="yops-log-op-0-surface"]')).toBeNull();
    });

    it('omits the suffix for LLM ops (surface is human-only)', () => {
      act(() => {
        useWorkspaceStore.getState().setDerived({
          tree: { trees: [], relations: [] },
          sourceIndex: new Map(),
          opsLog: [llmOp()],
        });
      });
      const { container } = render(<YOpsLogPanel mode="ledger" />);
      expect(container.querySelector('[data-testid="yops-log-op-0-surface"]')).toBeNull();
    });
  });
});

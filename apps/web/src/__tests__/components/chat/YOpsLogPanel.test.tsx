// @vitest-environment jsdom

import type { SourcedYOp } from '@t3x-dev/core';
import { act, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { YOpsLogPanel } from '@/components/chat/YOpsLogPanel';
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

  it('renders staged draft ops when a draft is present and the applied log is empty', () => {
    act(() => {
      useWorkspaceStore.getState().setDraft({
        ops: [llmOp()],
        tree: { trees: [], relations: [] },
      });
    });

    const { container } = render(<YOpsLogPanel />);
    const text = container.textContent ?? '';
    const rows = container.querySelectorAll('[data-testid^="yops-log-op-"]');

    expect(text).toMatch(/draft ops/i);
    expect(text).toMatch(/1\s*draft ops/i);
    expect(rows.length).toBe(1);
    expect(rows[0].textContent).toContain('Created sights');
  });

  it('prefers staged draft ops over the applied log while Apply is pending', () => {
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

    const { container } = render(<YOpsLogPanel />);
    const text = container.textContent ?? '';
    const rows = container.querySelectorAll('[data-testid^="yops-log-op-"]');

    expect(rows.length).toBe(1);
    expect(text).toContain('Created sights');
    expect(text).not.toContain('Set trip.destination to "Hangzhou"');
  });
});

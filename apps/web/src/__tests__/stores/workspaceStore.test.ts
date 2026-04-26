import type { SemanticContent, Source, SourcedYOp } from '@t3x-dev/core';
import { beforeEach, describe, expect, it } from 'vitest';
import { selectPanelExpanded, useWorkspaceStore } from '@/store/workspaceStore';

describe('workspaceStore (state-only)', () => {
  beforeEach(() => {
    // Wipe both conversation state and the persisted per-project preference
    // map so tests can't leak panelExpanded values into each other.
    useWorkspaceStore.getState().reset();
    useWorkspaceStore.setState({ panelExpandedByProject: {}, activeProjectId: null });
  });

  it('starts in idle mode with empty derived state', () => {
    const s = useWorkspaceStore.getState();
    expect(s.mode).toBe('idle');
    expect(s.turns).toEqual([]);
    expect(s.opsLog).toEqual([]);
    expect(s.tree.trees).toEqual([]);
    expect(s.sourceIndex.size).toBe(0);
    expect(s.conversationId).toBeNull();
  });

  it('setConversation updates conversation id', () => {
    useWorkspaceStore.getState().setConversation('conv_abc');
    expect(useWorkspaceStore.getState().conversationId).toBe('conv_abc');
  });

  it('setTurns replaces turns array', () => {
    const turns = [{ turn_hash: 'sha256:t1', content: 'hi' }];
    useWorkspaceStore.getState().setTurns(turns);
    expect(useWorkspaceStore.getState().turns).toEqual(turns);
  });

  it('setDerived stores tree + sourceIndex + opsLog', () => {
    const tree: SemanticContent = {
      trees: [{ key: 'trip', slots: { dest: 'HZ' }, children: [] }],
      relations: [],
    };
    const sourceIndex = new Map<string, Source>([
      ['trip/dest', { type: 'human', author: 'ethan', at: '2026-04-12T00:00:00Z' }],
    ]);
    const op: SourcedYOp = {
      set: { path: 'trip/dest', value: 'HZ' },
      source: { type: 'human', author: 'ethan', at: '2026-04-12T00:00:00Z' },
    } as SourcedYOp;

    useWorkspaceStore.getState().setDerived({ tree, sourceIndex, opsLog: [op] });

    const s = useWorkspaceStore.getState();
    expect(s.tree.trees).toHaveLength(1);
    expect(s.sourceIndex.get('trip/dest')?.type).toBe('human');
    expect(s.opsLog).toHaveLength(1);
  });

  it('select + clearSelection manages UI selection', () => {
    useWorkspaceStore
      .getState()
      .select('after', { nodePath: 'trip', slotKey: 'budget', turnIndex: 3 });
    const s = useWorkspaceStore.getState();
    expect(s.selectedNodePath).toBe('trip');
    expect(s.selectedSlotKey).toBe('budget');
    expect(s.selectedTurnIndex).toBe(3);
    expect(s.selectedSource).toBe('after');

    useWorkspaceStore.getState().clearSelection();
    expect(useWorkspaceStore.getState().selectedNodePath).toBeNull();
    expect(useWorkspaceStore.getState().selectedSource).toBeNull();
  });

  it('mode and flags flow through their setters', () => {
    useWorkspaceStore.getState().setMode('streaming');
    expect(useWorkspaceStore.getState().mode).toBe('streaming');

    useWorkspaceStore.getState().setActiveProject('proj_x');
    useWorkspaceStore.getState().setPanelExpanded(true);
    expect(selectPanelExpanded(useWorkspaceStore.getState())).toBe(true);

    useWorkspaceStore.getState().setCommitted(true);
    expect(useWorkspaceStore.getState().isCommitted).toBe(true);

    useWorkspaceStore.getState().setError('boom');
    expect(useWorkspaceStore.getState().lastError).toBe('boom');
  });

  it('reset clears conversation data but preserves UI prefs', () => {
    useWorkspaceStore.getState().setActiveProject('proj_y');
    useWorkspaceStore.getState().setPanelExpanded(true);
    useWorkspaceStore.getState().setConversation('conv_abc');
    useWorkspaceStore.getState().setMode('streaming');
    useWorkspaceStore.getState().setError('boom');

    useWorkspaceStore.getState().reset();

    const s = useWorkspaceStore.getState();
    expect(s.conversationId).toBeNull();
    expect(s.mode).toBe('idle');
    expect(s.lastError).toBeNull();
    // Per-project pref + active project survive a conversation reset so
    // navigating between conversations of the same project doesn't slam the
    // workspace shut.
    expect(s.activeProjectId).toBe('proj_y');
    expect(selectPanelExpanded(s)).toBe(true);
  });

  it('setPanelExpanded is per-project; switching projects defaults to folded', () => {
    useWorkspaceStore.getState().setActiveProject('proj_a');
    useWorkspaceStore.getState().setPanelExpanded(true);
    expect(selectPanelExpanded(useWorkspaceStore.getState())).toBe(true);

    // Switching to a brand-new project starts folded — the pref is per-project,
    // not global.
    useWorkspaceStore.getState().setActiveProject('proj_b');
    expect(selectPanelExpanded(useWorkspaceStore.getState())).toBe(false);

    // Coming back to proj_a restores the previous expanded state.
    useWorkspaceStore.getState().setActiveProject('proj_a');
    expect(selectPanelExpanded(useWorkspaceStore.getState())).toBe(true);
  });

  it('setPanelExpanded is a no-op without an active project', () => {
    // No setActiveProject — nothing should be written to the persisted map.
    useWorkspaceStore.getState().setPanelExpanded(true);
    expect(useWorkspaceStore.getState().panelExpandedByProject).toEqual({});
    expect(selectPanelExpanded(useWorkspaceStore.getState())).toBe(false);
  });
});

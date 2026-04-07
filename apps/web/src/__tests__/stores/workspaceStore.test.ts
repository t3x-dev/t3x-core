import { describe, expect, it, beforeEach } from 'vitest';
import { useWorkspaceStore } from '@/store/workspaceStore';

describe('workspaceStore', () => {
  beforeEach(() => {
    useWorkspaceStore.getState().reset();
  });

  it('starts in idle mode', () => {
    expect(useWorkspaceStore.getState().mode).toBe('idle');
  });

  it('snapshots base tree', () => {
    const base = { trees: [{ key: 'trip', slots: { dest: 'HZ' }, children: [], source: {} }], relations: [] };
    useWorkspaceStore.getState().snapshotBase(base as any, 'abc123');
    expect(useWorkspaceStore.getState().base.trees).toHaveLength(1);
    expect(useWorkspaceStore.getState().baseCommitHash).toBe('abc123');
  });

  it('parses script text and updates ops', () => {
    useWorkspaceStore.getState().setScriptText('yops:\n  - define:\n      path: trip');
    const state = useWorkspaceStore.getState();
    expect(state.scriptOps).toHaveLength(1);
    expect(state.parseErrors).toHaveLength(0);
  });

  it('reports parse errors for invalid script', () => {
    useWorkspaceStore.getState().setScriptText('yops:\n  - sett:\n      path: foo');
    expect(useWorkspaceStore.getState().parseErrors.length).toBeGreaterThan(0);
    expect(useWorkspaceStore.getState().scriptOps).toHaveLength(0);
  });

  it('toggles op indices', () => {
    useWorkspaceStore.getState().toggleOp(2);
    expect(useWorkspaceStore.getState().disabledOpIndices.has(2)).toBe(true);
    useWorkspaceStore.getState().toggleOp(2);
    expect(useWorkspaceStore.getState().disabledOpIndices.has(2)).toBe(false);
  });

  it('executes ops against base', () => {
    const base = { trees: [], relations: [] };
    useWorkspaceStore.getState().snapshotBase(base as any, null);
    useWorkspaceStore.getState().setScriptText('yops:\n  - define:\n      path: trip');
    useWorkspaceStore.getState().execute();
    const state = useWorkspaceStore.getState();
    expect(state.result).not.toBeNull();
    expect(state.result?.trees).toHaveLength(1);
    expect(state.appliedCount).toBe(1);
    expect(state.execError).toBeNull();
    expect(state.mode).toBe('executed');
  });

  it('skips disabled ops during execute', () => {
    const base = { trees: [], relations: [] };
    useWorkspaceStore.getState().snapshotBase(base as any, null);
    useWorkspaceStore.getState().setScriptText('yops:\n  - define:\n      path: trip\n  - define:\n      path: other');
    useWorkspaceStore.getState().toggleOp(1);
    useWorkspaceStore.getState().execute();
    expect(useWorkspaceStore.getState().result?.trees).toHaveLength(1);
    expect(useWorkspaceStore.getState().result?.trees[0].key).toBe('trip');
  });

  it('appends op to script text', () => {
    useWorkspaceStore.getState().setScriptText('yops:\n  - define:\n      path: trip');
    useWorkspaceStore.getState().appendOp({ set: { path: 'trip/budget', value: '3000' } } as any);
    expect(useWorkspaceStore.getState().scriptText).toContain('trip/budget');
    expect(useWorkspaceStore.getState().scriptOps).toHaveLength(2);
  });

  it('manages click selection state', () => {
    useWorkspaceStore.getState().select('after', { nodePath: 'trip', slotKey: 'budget', turnIndex: 3 });
    const state = useWorkspaceStore.getState();
    expect(state.selectedNodePath).toBe('trip');
    expect(state.selectedSlotKey).toBe('budget');
    expect(state.selectedTurnIndex).toBe(3);
    expect(state.selectedSource).toBe('after');
    useWorkspaceStore.getState().clearSelection();
    expect(useWorkspaceStore.getState().selectedNodePath).toBeNull();
  });
});

import { describe, expect, it, beforeEach } from 'vitest';
import { useWorkspaceStore } from '@/store/workspaceStore';
import { computeTreeDiff } from '@/lib/treeDiff';
import type { TreeNode } from '@t3x-dev/core';

describe('Workspace Flow E2E', () => {
  beforeEach(() => {
    useWorkspaceStore.getState().reset();
  });

  describe('Full extraction → triage → edit → commit flow', () => {
    it('simulates complete workspace session on empty conversation', () => {
      const store = useWorkspaceStore;

      // 1. Workspace opens — snapshot empty base
      store.getState().snapshotBase({ trees: [], relations: [] } as any, null);
      expect(store.getState().mode).toBe('idle');
      expect(store.getState().base.trees).toHaveLength(0);
      expect(store.getState().baseCommitHash).toBeNull();

      // 2. LLM extraction produces ops — simulate streaming
      store.getState().setMode('streaming');
      expect(store.getState().mode).toBe('streaming');

      // 3. Streaming completes — set script text
      const script = `yops:
  - define:
      path: trip
  - set:
      path: trip/destination
      value: "Hangzhou"
  - set:
      path: trip/duration
      value: "5 days"
  - define:
      path: trip/dining
  - set:
      path: trip/dining/restaurant
      value: "Grandma's Kitchen"`;

      store.getState().setScriptText(script);
      expect(store.getState().scriptOps).toHaveLength(5);
      expect(store.getState().parseErrors).toHaveLength(0);

      // 4. User clicks Execute
      store.getState().execute();
      expect(store.getState().mode).toBe('executed');
      expect(store.getState().result).not.toBeNull();
      expect(store.getState().appliedCount).toBe(5);
      expect(store.getState().execError).toBeNull();

      // 5. Verify result tree
      const result = store.getState().result!;
      expect(result.trees).toHaveLength(1);
      expect(result.trees[0].key).toBe('trip');
      expect(result.trees[0].slots.destination).toBe('Hangzhou');

      // 6. Verify diff
      const diff = computeTreeDiff(
        store.getState().base.trees as TreeNode[],
        result.trees as TreeNode[]
      );
      expect(diff.summary.nodesAdded).toBe(2); // trip + dining
      expect(diff.summary.slotsAdded).toBe(3); // dest, duration, restaurant

      // 7. User dismisses dining (triage) — toggle ops 3 and 4 (define dining + set restaurant)
      store.getState().toggleOp(3); // define dining
      store.getState().toggleOp(4); // set restaurant
      expect(store.getState().disabledOpIndices.has(3)).toBe(true);
      expect(store.getState().disabledOpIndices.has(4)).toBe(true);

      // 8. Re-execute with disabled ops
      store.getState().execute();
      const afterTriage = store.getState().result!;
      expect(afterTriage.trees).toHaveLength(1);
      expect(afterTriage.trees[0].key).toBe('trip');
      expect(afterTriage.trees[0].children).toHaveLength(0); // dining gone
      expect(store.getState().appliedCount).toBe(3); // only 3 of 5 applied

      // 9. User edits a value inline (gold step) — appends set op
      store.getState().appendOp({ set: { path: 'trip/duration', value: '7 days' } } as any);
      expect(store.getState().scriptOps).toHaveLength(6); // 5 original + 1 appended

      // 10. Auto re-execute
      store.getState().execute();
      const afterEdit = store.getState().result!;
      expect(afterEdit.trees[0].slots.duration).toBe('7 days'); // user edit applied
      expect(afterEdit.trees[0].slots.destination).toBe('Hangzhou'); // unchanged
      // appliedCount = 4 (3 enabled original + 1 appended)
      expect(store.getState().appliedCount).toBe(4);

      // 11. User re-enables dining (undo triage)
      store.getState().toggleOp(3); // re-enable define dining
      store.getState().toggleOp(4); // re-enable set restaurant
      store.getState().execute();
      const afterUndoTriage = store.getState().result!;
      expect(afterUndoTriage.trees[0].children).toHaveLength(1); // dining back
      expect(afterUndoTriage.trees[0].children[0].slots.restaurant).toBe("Grandma's Kitchen");
      expect(store.getState().appliedCount).toBe(6); // all 6 ops applied
    });

    it('simulates workspace on existing committed tree', () => {
      const store = useWorkspaceStore;

      // 1. Open workspace with existing committed tree
      const committed = {
        trees: [{
          key: 'trip',
          slots: { destination: 'Hangzhou', duration: '5 days', budget: 'moderate' },
          children: [],
        }],
        relations: [],
      } as any;
      store.getState().snapshotBase(committed, 'sha256:abc123');
      expect(store.getState().baseCommitHash).toBe('sha256:abc123');

      // 2. New extraction modifies budget
      store.getState().setScriptText(`yops:
  - set:
      path: trip/budget
      value: "3000 CNY"`);

      store.getState().execute();
      const result = store.getState().result!;
      expect(result.trees[0].slots.budget).toBe('3000 CNY');
      expect(result.trees[0].slots.destination).toBe('Hangzhou'); // preserved from base

      // 3. Diff shows only modification
      const diff = computeTreeDiff(committed.trees as TreeNode[], result.trees as TreeNode[]);
      expect(diff.summary.nodesAdded).toBe(0);
      expect(diff.summary.slotsModified).toBe(1); // budget
      expect(diff.summary.slotsAdded).toBe(0);
    });

    it('handles parse errors in script', () => {
      const store = useWorkspaceStore;
      store.getState().snapshotBase({ trees: [], relations: [] } as any, null);

      // Invalid YAML
      store.getState().setScriptText('yops:\n  - badop:\n      path: foo');
      expect(store.getState().parseErrors.length).toBeGreaterThan(0);
      expect(store.getState().scriptOps).toHaveLength(0);

      // Execute should do nothing with parse errors
      store.getState().execute();
      expect(store.getState().result).toBeNull(); // no result because ops is empty
    });

    it('handles click-based selection state', () => {
      const store = useWorkspaceStore;

      // Click node in After panel
      store.getState().select('after', { nodePath: 'trip/dining', slotKey: 'restaurant', turnIndex: 4 });
      expect(store.getState().selectedNodePath).toBe('trip/dining');
      expect(store.getState().selectedSlotKey).toBe('restaurant');
      expect(store.getState().selectedTurnIndex).toBe(4);
      expect(store.getState().selectedSource).toBe('after');

      // Click in chat (new selection replaces old)
      store.getState().select('chat', { turnIndex: 2 });
      expect(store.getState().selectedTurnIndex).toBe(2);
      expect(store.getState().selectedSource).toBe('chat');
      expect(store.getState().selectedNodePath).toBeNull(); // cleared

      // Escape clears
      store.getState().clearSelection();
      expect(store.getState().selectedNodePath).toBeNull();
      expect(store.getState().selectedTurnIndex).toBeNull();
      expect(store.getState().selectedSource).toBeNull();
    });

    it('panel expand/collapse state', () => {
      const store = useWorkspaceStore;
      expect(store.getState().panelExpanded).toBe(true);
      store.getState().setPanelExpanded(false);
      expect(store.getState().panelExpanded).toBe(false);
      store.getState().setPanelExpanded(true);
      expect(store.getState().panelExpanded).toBe(true);
    });

    it('reset clears everything', () => {
      const store = useWorkspaceStore;
      store.getState().snapshotBase({ trees: [{ key: 'x', slots: {}, children: [] }], relations: [] } as any, 'hash');
      store.getState().setScriptText('yops:\n  - define:\n      path: y');
      store.getState().execute();
      store.getState().select('after', { nodePath: 'y' });

      store.getState().reset();
      expect(store.getState().mode).toBe('idle');
      expect(store.getState().base.trees).toHaveLength(0);
      expect(store.getState().scriptText).toBe('');
      expect(store.getState().result).toBeNull();
      expect(store.getState().selectedNodePath).toBeNull();
    });
  });
});

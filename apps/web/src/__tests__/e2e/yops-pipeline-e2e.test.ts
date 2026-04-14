import { describe, expect, it } from 'vitest';
import { applyYOps } from '@t3x-dev/core';
import type { SemanticContent } from '@t3x-dev/core';
import { parseYOpsScript, opsToYaml } from '@/lib/scriptParser';
import { computeTreeDiff } from '@/domain/diff/treeDiff';

describe('YOps Pipeline E2E', () => {
  const EMPTY_BASE: SemanticContent = { trees: [], relations: [] };

  describe('Full extraction → edit → re-execute flow', () => {
    it('builds a complete knowledge tree from scratch', () => {
      // Simulate LLM extraction generating a YAML script
      const extractionScript = `
yops:
  - define:
      path: trip_planning
  - set:
      path: trip_planning/destination
      value: "Hangzhou"
  - set:
      path: trip_planning/duration
      value: "5 days"
  - set:
      path: trip_planning/budget
      value: "moderate"
  - define:
      path: trip_planning/dining
  - set:
      path: trip_planning/dining/restaurant
      value: "Grandma's Kitchen"
  - set:
      path: trip_planning/dining/specialty
      value: "Dongpo pork"
`;

      // Step 1: Parse the script
      const { ops, errors } = parseYOpsScript(extractionScript);
      expect(errors).toHaveLength(0);
      expect(ops).not.toBeNull();
      expect(ops).toHaveLength(7);

      // Step 2: Execute against empty base (full replay)
      const result = applyYOps(EMPTY_BASE, ops!);
      expect(result.ok).toBe(true);
      expect(result.applied).toBe(7);

      // Step 3: Verify the tree structure
      expect(result.trees).toHaveLength(1);
      const trip = result.trees[0];
      expect(trip.key).toBe('trip_planning');
      expect(trip.slots.destination).toBe('Hangzhou');
      expect(trip.slots.duration).toBe('5 days');
      expect(trip.slots.budget).toBe('moderate');
      expect(trip.children).toHaveLength(1);
      expect(trip.children[0].key).toBe('dining');
      expect(trip.children[0].slots.restaurant).toBe("Grandma's Kitchen");
      expect(trip.children[0].slots.specialty).toBe('Dongpo pork');

      // Step 4: Compute diff against empty base
      const diff = computeTreeDiff(EMPTY_BASE.trees as any, result.trees as any);
      expect(diff.summary.nodesAdded).toBe(2); // trip_planning + dining
      expect(diff.summary.slotsAdded).toBe(5); // dest, dur, budget, restaurant, specialty
      expect(diff.summary.slotsModified).toBe(0);
      expect(diff.summary.nodesRemoved).toBe(0);
    });

    it('modifies existing tree (second extraction on committed tree)', () => {
      // Base: existing committed tree
      const base: SemanticContent = {
        trees: [{
          key: 'trip_planning',
          slots: { destination: 'Hangzhou', duration: '5 days', budget: 'moderate' },
          children: [{
            key: 'dining',
            slots: { restaurant: "Grandma's Kitchen", specialty: 'Dongpo pork' },
            children: [],
          }],
        }],
        relations: [],
      } as any;

      // New extraction adds and modifies
      const script = `
yops:
  - set:
      path: trip_planning/budget
      value: "3000 CNY"
  - define:
      path: trip_planning/transport
  - set:
      path: trip_planning/transport/mode
      value: "high-speed rail"
`;

      const { ops } = parseYOpsScript(script);
      const result = applyYOps(base, ops!);
      expect(result.ok).toBe(true);
      expect(result.applied).toBe(3);

      // Verify modifications
      const trip = result.trees[0];
      expect(trip.slots.budget).toBe('3000 CNY'); // modified
      expect(trip.slots.destination).toBe('Hangzhou'); // unchanged
      expect(trip.children).toHaveLength(2); // dining + transport
      const transport = trip.children.find((c: any) => c.key === 'transport');
      expect(transport).toBeDefined();
      expect(transport!.slots.mode).toBe('high-speed rail');

      // Verify diff
      const diff = computeTreeDiff(base.trees as any, result.trees as any);
      expect(diff.summary.nodesAdded).toBe(1); // transport
      expect(diff.summary.slotsModified).toBe(1); // budget
      expect(diff.summary.slotsAdded).toBe(1); // mode
    });

    it('full replay is idempotent — same base + same script = same result', () => {
      const base: SemanticContent = { trees: [], relations: [] };
      const script = `
yops:
  - define:
      path: topic
  - set:
      path: topic/fact
      value: "hello"
`;
      const { ops } = parseYOpsScript(script);
      const result1 = applyYOps(base, ops!);
      const result2 = applyYOps(base, ops!);

      expect(result1.trees).toEqual(result2.trees);
      expect(result1.applied).toBe(result2.applied);
    });

    it('handles op toggling (triage) — disabled ops are skipped', () => {
      const base: SemanticContent = { trees: [], relations: [] };
      const script = `
yops:
  - define:
      path: keep_this
  - set:
      path: keep_this/value
      value: "kept"
  - define:
      path: dismiss_this
  - set:
      path: dismiss_this/value
      value: "dismissed"
`;
      const { ops } = parseYOpsScript(script);

      // Simulate triage: disable ops at index 2 and 3 (dismiss_this)
      const enabledOps = ops!.filter((_, i) => i !== 2 && i !== 3);
      const result = applyYOps(base, enabledOps);

      expect(result.ok).toBe(true);
      expect(result.trees).toHaveLength(1); // only keep_this
      expect(result.trees[0].key).toBe('keep_this');
      expect(result.trees[0].slots.value).toBe('kept');
    });

    it('inline edit generates set op and re-executes', () => {
      // Simulate: user has a tree, edits a slot value inline
      const base: SemanticContent = {
        trees: [{ key: 'topic', slots: { fact: 'original' }, children: [] }],
        relations: [],
      } as any;

      // Original script from extraction
      const script = `
yops:
  - set:
      path: topic/fact
      value: "from-llm"
`;
      const { ops } = parseYOpsScript(script);

      // User edits inline → generates a new set op
      const editOp = { set: { path: 'topic/fact', value: 'user-edited' } };
      const allOps = [...ops!, editOp];

      // Re-execute with appended op
      const result = applyYOps(base, allOps as any);
      expect(result.ok).toBe(true);
      expect(result.trees[0].slots.fact).toBe('user-edited'); // user edit wins (last write)
    });

    it('handles execution errors gracefully — partial apply', () => {
      const base: SemanticContent = { trees: [], relations: [] };
      const script = `
yops:
  - define:
      path: good_node
  - set:
      path: good_node/fact
      value: "this works"
  - drop:
      path: nonexistent_node
`;
      const { ops } = parseYOpsScript(script);
      const result = applyYOps(base, ops!);

      // Should fail on op 3 (index 2), but ops 1-2 applied
      expect(result.ok).toBe(false);
      expect(result.applied).toBe(2);
      expect(result.error).toBeDefined();
      expect(result.error!.op_index).toBe(2);
      // Partial result should have good_node
      expect(result.trees).toHaveLength(1);
      expect(result.trees[0].key).toBe('good_node');
    });

    it('scriptParser validates and catches typos', () => {
      const bad = `
yops:
  - defne:
      path: oops
  - sett:
      path: typo/here
      value: "bad"
`;
      const { ops, errors } = parseYOpsScript(bad);
      expect(ops).toBeNull();
      expect(errors).toHaveLength(2);
      expect(errors[0].message).toContain('defne');
      expect(errors[0].message).toContain('define'); // suggestion
      expect(errors[1].message).toContain('sett');
      expect(errors[1].message).toContain('set'); // suggestion
    });

    it('opsToYaml round-trips correctly', () => {
      const original = `
yops:
  - define:
      path: test
  - set:
      path: test/key
      value: "hello"
`;
      const { ops } = parseYOpsScript(original);
      expect(ops).not.toBeNull();

      // Serialize back to YAML
      const yaml = opsToYaml(ops!);

      // Parse again
      const { ops: roundTripped, errors } = parseYOpsScript(yaml);
      expect(errors).toHaveLength(0);
      expect(roundTripped).toHaveLength(ops!.length);

      // Apply both — should produce identical trees
      const base: SemanticContent = { trees: [], relations: [] };
      const r1 = applyYOps(base, ops!);
      const r2 = applyYOps(base, roundTripped!);
      expect(r1.trees).toEqual(r2.trees);
    });
  });
});

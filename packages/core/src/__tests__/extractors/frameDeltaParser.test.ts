import { describe, expect, it } from 'vitest';
import { parseFrameDelta } from '../../extractors/frameDeltaParser';
import type { SemanticContent } from '../../semantic/types';

// ── Fixtures ──

// Tree-native delta JSON (the new format)
const validTreeDelta = {
  changes: [
    {
      action: 'add',
      parent_path: '',
      node: { key: 'travel_plan', slots: { destination: 'Tokyo' }, children: [] },
    },
  ],
};

const validTreeDeltaWithRelations = {
  changes: [
    {
      action: 'add',
      parent_path: '',
      node: { key: 'travel_plan', slots: { destination: 'Tokyo' }, children: [] },
    },
    {
      action: 'add',
      parent_path: '',
      node: { key: 'budget', slots: { amount: 3000 }, children: [] },
    },
  ],
  new_relations: [{ from: 'travel_plan', to: 'budget', type: 'depends' }],
};

// Legacy full output (frames format — still supported for LLM backward compat)
const fullOutputFrames = {
  frames: [
    { id: 'f_001', type: 'travel_plan', slots: { destination: 'Tokyo' }, confidence: 0.95 },
    { id: 'f_002', type: 'budget', slots: { amount: 3000 }, confidence: 0.9 },
  ],
  relations: [{ from: 'f_001', to: 'f_002', type: 'depends' }],
};

// Snapshot uses trees format
const snapshot: SemanticContent = {
  trees: [
    {
      key: 'travel_plan',
      slots: { destination: 'Tokyo' },
      children: [],
      confidence: 0.95,
    },
    {
      key: 'budget',
      slots: { amount: 2000 },
      children: [],
      confidence: 0.9,
    },
  ],
  relations: [{ from: 'travel_plan', to: 'budget', type: 'depends' }],
};

// ── Tests ──

describe('parseFrameDelta', () => {
  describe('Case 1: tree-native delta JSON with changes key', () => {
    it('parses valid delta JSON from code fences', () => {
      const raw = `Here is the delta:\n\`\`\`json\n${JSON.stringify(validTreeDelta)}\n\`\`\``;
      const result = parseFrameDelta(raw);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.delta.changes).toHaveLength(1);
        expect(result.delta.changes[0].action).toBe('add');
      }
    });

    it('parses delta JSON without code fences', () => {
      const raw = JSON.stringify(validTreeDelta);
      const result = parseFrameDelta(raw);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.delta.changes).toHaveLength(1);
      }
    });

    it('parses delta with relations', () => {
      const raw = `\`\`\`json\n${JSON.stringify(validTreeDeltaWithRelations)}\n\`\`\``;
      const result = parseFrameDelta(raw);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.delta.changes).toHaveLength(2);
        expect(result.delta.new_relations).toHaveLength(1);
      }
    });

    it('parses delta with update and remove actions', () => {
      const delta = {
        changes: [
          { action: 'update', target_path: 'travel_plan', slots: { destination: 'Osaka', timeframe: null } },
          { action: 'remove', target_path: 'shopping', reason: 'no longer relevant' },
        ],
      };
      const raw = JSON.stringify(delta);
      const result = parseFrameDelta(raw);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.delta.changes).toHaveLength(2);
        expect(result.delta.changes[0].action).toBe('update');
        expect(result.delta.changes[1].action).toBe('remove');
      }
    });
  });

  describe('Case 2: full output, no snapshot (first extraction)', () => {
    it('converts full output to all-add delta', () => {
      const raw = JSON.stringify(fullOutputFrames);
      const result = parseFrameDelta(raw);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.delta.changes).toHaveLength(2);
        expect(result.delta.changes.every((c) => c.action === 'add')).toBe(true);
        expect(result.delta.new_relations).toHaveLength(1);
      }
    });

    it('converts full output with no relations to all-add delta', () => {
      const raw = JSON.stringify({
        frames: [{ id: 'f_001', type: 'note', slots: { text: 'hello' } }],
        relations: [],
      });
      const result = parseFrameDelta(raw);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.delta.changes).toHaveLength(1);
        expect(result.delta.changes[0].action).toBe('add');
        expect(result.delta.new_relations).toBeUndefined();
      }
    });
  });

  describe('Case 3: full output with snapshot (diff)', () => {
    it('skips unchanged frames', () => {
      // Output identical to snapshot (as flattened frames)
      const raw = JSON.stringify({
        frames: [
          { id: 'travel_plan', type: 'travel_plan', slots: { destination: 'Tokyo' }, confidence: 0.95 },
          { id: 'budget', type: 'budget', slots: { amount: 2000 }, confidence: 0.9 },
        ],
        relations: [{ from: 'travel_plan', to: 'budget', type: 'depends' }],
      });
      const result = parseFrameDelta(raw, snapshot);
      // All frames identical, no changes → error (empty delta)
      expect(result.ok).toBe(false);
    });

    it('detects changed slots as update', () => {
      const raw = JSON.stringify({
        frames: [
          { id: 'travel_plan', type: 'travel_plan', slots: { destination: 'Osaka' }, confidence: 0.95 },
          { id: 'budget', type: 'budget', slots: { amount: 2000 }, confidence: 0.9 },
        ],
        relations: [{ from: 'travel_plan', to: 'budget', type: 'depends' }],
      });
      const result = parseFrameDelta(raw, snapshot);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.delta.changes).toHaveLength(1);
        const change = result.delta.changes[0];
        expect(change.action).toBe('update');
        if (change.action === 'update') {
          expect(change.target_path).toBe('travel_plan');
          expect(change.slots).toEqual({ destination: 'Osaka' });
        }
      }
    });

    it('detects new frames as add', () => {
      const raw = JSON.stringify({
        frames: [
          { id: 'travel_plan', type: 'travel_plan', slots: { destination: 'Tokyo' }, confidence: 0.95 },
          { id: 'budget', type: 'budget', slots: { amount: 2000 }, confidence: 0.9 },
          { id: 'hotel', type: 'hotel', slots: { name: 'Hilton' }, confidence: 0.85 },
        ],
        relations: [{ from: 'travel_plan', to: 'budget', type: 'depends' }],
      });
      const result = parseFrameDelta(raw, snapshot);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.delta.changes).toHaveLength(1);
        expect(result.delta.changes[0].action).toBe('add');
      }
    });

    it('detects missing frames as remove', () => {
      const raw = JSON.stringify({
        frames: [
          { id: 'travel_plan', type: 'travel_plan', slots: { destination: 'Tokyo' }, confidence: 0.95 },
        ],
        relations: [],
      });
      const result = parseFrameDelta(raw, snapshot);
      expect(result.ok).toBe(true);
      if (result.ok) {
        const removeChange = result.delta.changes.find((c) => c.action === 'remove');
        expect(removeChange).toBeDefined();
        if (removeChange?.action === 'remove') {
          expect(removeChange.target_path).toBe('budget');
        }
      }
    });

    it('detects new and removed relations alongside frame changes', () => {
      const raw = JSON.stringify({
        frames: [
          { id: 'travel_plan', type: 'travel_plan', slots: { destination: 'Osaka' }, confidence: 0.95 },
          { id: 'budget', type: 'budget', slots: { amount: 2000 }, confidence: 0.9 },
        ],
        relations: [{ from: 'travel_plan', to: 'budget', type: 'causes' }], // changed from 'depends'
      });
      const result = parseFrameDelta(raw, snapshot);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.delta.new_relations).toHaveLength(1);
        expect(result.delta.remove_relations).toHaveLength(1);
      }
    });

    it('returns error when only relations changed (no frame changes)', () => {
      const raw = JSON.stringify({
        frames: [
          { id: 'travel_plan', type: 'travel_plan', slots: { destination: 'Tokyo' }, confidence: 0.95 },
          { id: 'budget', type: 'budget', slots: { amount: 2000 }, confidence: 0.9 },
        ],
        relations: [{ from: 'travel_plan', to: 'budget', type: 'causes' }],
      });
      const result = parseFrameDelta(raw, snapshot);
      expect(result.ok).toBe(false);
    });

    it('handles null slots (deletion) in update diff', () => {
      const snapshotWithExtra: SemanticContent = {
        trees: [
          {
            key: 'travel_plan',
            slots: { destination: 'Tokyo', timeframe: 'next month' },
            children: [],
          },
        ],
        relations: [],
      };
      const raw = JSON.stringify({
        frames: [{ id: 'travel_plan', type: 'travel_plan', slots: { destination: 'Tokyo' } }],
        relations: [],
      });
      const result = parseFrameDelta(raw, snapshotWithExtra);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.delta.changes).toHaveLength(1);
        const change = result.delta.changes[0];
        expect(change.action).toBe('update');
        if (change.action === 'update') {
          expect(change.slots.timeframe).toBeNull();
        }
      }
    });
  });

  describe('Error cases', () => {
    it('returns error for unparseable JSON', () => {
      const result = parseFrameDelta('this is not json at all');
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toContain('parse');
      }
    });

    it('returns error for invalid schema', () => {
      const raw = JSON.stringify({ changes: [{ action: 'invalid', target_path: 'bad' }] });
      const result = parseFrameDelta(raw);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toBeTruthy();
      }
    });

    it('returns error for JSON with neither changes nor frames', () => {
      const raw = JSON.stringify({ something: 'else' });
      const result = parseFrameDelta(raw);
      expect(result.ok).toBe(false);
    });

    it('returns error for empty changes array', () => {
      const raw = JSON.stringify({ changes: [] });
      const result = parseFrameDelta(raw);
      expect(result.ok).toBe(false);
    });
  });

  describe('Normalizer integration', () => {
    it('handles plain objects in slot arrays via normalizer', () => {
      const raw = JSON.stringify({
        frames: [
          {
            id: 'f_001',
            type: 'itinerary',
            slots: {
              stops: [
                { name: 'Tokyo', duration: '3 days' },
                { name: 'Osaka', duration: '2 days' },
              ],
            },
          },
        ],
        relations: [],
      });

      const result = parseFrameDelta(raw);
      expect(result.ok).toBe(true);
    });
  });

  describe('JSON extraction edge cases', () => {
    it('extracts JSON with surrounding text', () => {
      const raw = `Sure! Here's the updated delta:\n\n${JSON.stringify(validTreeDelta)}\n\nLet me know if you need changes.`;
      const result = parseFrameDelta(raw);
      expect(result.ok).toBe(true);
    });

    it('handles code fence without json language tag', () => {
      const raw = `\`\`\`\n${JSON.stringify(validTreeDelta)}\n\`\`\``;
      const result = parseFrameDelta(raw);
      expect(result.ok).toBe(true);
    });
  });
});

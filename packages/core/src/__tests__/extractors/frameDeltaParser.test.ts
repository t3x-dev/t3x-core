import { describe, expect, it } from 'vitest';
import { parseFrameDelta } from '../../extractors/frameDeltaParser';
import type { SemanticContent } from '../../semantic/types';

// ── Fixtures ──

const validDeltaJson = {
  changes: [
    { action: 'add', frame: { id: 'f_001', type: 'travel_plan', slots: { destination: 'Tokyo' } } },
  ],
};

const validDeltaWithRelations = {
  changes: [
    { action: 'add', frame: { id: 'f_001', type: 'travel_plan', slots: { destination: 'Tokyo' } } },
    { action: 'add', frame: { id: 'f_002', type: 'budget', slots: { amount: 3000 } } },
  ],
  new_relations: [{ from: 'f_001', to: 'f_002', type: 'depends' }],
};

const fullOutputFrames = {
  frames: [
    { id: 'f_001', type: 'travel_plan', slots: { destination: 'Tokyo' }, confidence: 0.95 },
    { id: 'f_002', type: 'budget', slots: { amount: 3000 }, confidence: 0.9 },
  ],
  relations: [{ from: 'f_001', to: 'f_002', type: 'depends' }],
};

const snapshot: SemanticContent = {
  frames: [
    { id: 'f_001', type: 'travel_plan', slots: { destination: 'Tokyo' }, confidence: 0.95 },
    { id: 'f_002', type: 'budget', slots: { amount: 2000 }, confidence: 0.9 },
  ],
  relations: [{ from: 'f_001', to: 'f_002', type: 'depends' }],
};

// ── Tests ──

describe('parseFrameDelta', () => {
  describe('Case 1: delta JSON with changes key', () => {
    it('parses valid delta JSON from code fences', () => {
      const raw = `Here is the delta:\n\`\`\`json\n${JSON.stringify(validDeltaJson)}\n\`\`\``;
      const result = parseFrameDelta(raw);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.delta.changes).toHaveLength(1);
        expect(result.delta.changes[0].action).toBe('add');
      }
    });

    it('parses delta JSON without code fences', () => {
      const raw = JSON.stringify(validDeltaJson);
      const result = parseFrameDelta(raw);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.delta.changes).toHaveLength(1);
      }
    });

    it('parses delta with relations', () => {
      const raw = `\`\`\`json\n${JSON.stringify(validDeltaWithRelations)}\n\`\`\``;
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
          { action: 'update', target: 'f_001', slots: { destination: 'Osaka', timeframe: null } },
          { action: 'remove', target: 'f_003', reason: 'no longer relevant' },
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
        // empty relations array should not appear as new_relations
        expect(result.delta.new_relations).toBeUndefined();
      }
    });
  });

  describe('Case 3: full output with snapshot (diff)', () => {
    it('skips unchanged frames', () => {
      // snapshot and output are identical
      const raw = JSON.stringify({
        frames: snapshot.frames,
        relations: snapshot.relations,
      });
      const result = parseFrameDelta(raw, snapshot);
      // All frames identical, no changes → error (empty delta)
      expect(result.ok).toBe(false);
    });

    it('detects changed slots as update', () => {
      const raw = JSON.stringify({
        frames: [
          { id: 'f_001', type: 'travel_plan', slots: { destination: 'Osaka' }, confidence: 0.95 },
          { id: 'f_002', type: 'budget', slots: { amount: 2000 }, confidence: 0.9 },
        ],
        relations: [{ from: 'f_001', to: 'f_002', type: 'depends' }],
      });
      const result = parseFrameDelta(raw, snapshot);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.delta.changes).toHaveLength(1);
        const change = result.delta.changes[0];
        expect(change.action).toBe('update');
        if (change.action === 'update') {
          expect(change.target).toBe('f_001');
          expect(change.slots).toEqual({ destination: 'Osaka' });
        }
      }
    });

    it('detects new frames as add', () => {
      const raw = JSON.stringify({
        frames: [
          ...snapshot.frames,
          { id: 'f_003', type: 'hotel', slots: { name: 'Hilton' }, confidence: 0.85 },
        ],
        relations: snapshot.relations,
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
        frames: [snapshot.frames[0]], // f_002 removed
        relations: [],
      });
      const result = parseFrameDelta(raw, snapshot);
      expect(result.ok).toBe(true);
      if (result.ok) {
        const removeChange = result.delta.changes.find((c) => c.action === 'remove');
        expect(removeChange).toBeDefined();
        if (removeChange?.action === 'remove') {
          expect(removeChange.target).toBe('f_002');
        }
      }
    });

    it('detects new and removed relations alongside frame changes', () => {
      const raw = JSON.stringify({
        frames: [
          // Change destination so there's a frame change too
          { id: 'f_001', type: 'travel_plan', slots: { destination: 'Osaka' }, confidence: 0.95 },
          { id: 'f_002', type: 'budget', slots: { amount: 2000 }, confidence: 0.9 },
        ],
        relations: [{ from: 'f_001', to: 'f_002', type: 'causes' }], // changed type from 'depends'
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
        frames: snapshot.frames,
        relations: [{ from: 'f_001', to: 'f_002', type: 'causes' }],
      });
      const result = parseFrameDelta(raw, snapshot);
      expect(result.ok).toBe(false);
    });

    it('handles null slots (deletion) in update diff', () => {
      const snapshotWithExtra: SemanticContent = {
        frames: [
          {
            id: 'f_001',
            type: 'travel_plan',
            slots: { destination: 'Tokyo', timeframe: 'next month' },
          },
        ],
        relations: [],
      };
      const raw = JSON.stringify({
        frames: [{ id: 'f_001', type: 'travel_plan', slots: { destination: 'Tokyo' } }],
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
      const raw = JSON.stringify({ changes: [{ action: 'invalid', target: 'bad' }] });
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

  describe('JSON extraction edge cases', () => {
    it('extracts JSON with surrounding text', () => {
      const raw = `Sure! Here's the updated delta:\n\n${JSON.stringify(validDeltaJson)}\n\nLet me know if you need changes.`;
      const result = parseFrameDelta(raw);
      expect(result.ok).toBe(true);
    });

    it('handles code fence without json language tag', () => {
      const raw = `\`\`\`\n${JSON.stringify(validDeltaJson)}\n\`\`\``;
      const result = parseFrameDelta(raw);
      expect(result.ok).toBe(true);
    });
  });
});

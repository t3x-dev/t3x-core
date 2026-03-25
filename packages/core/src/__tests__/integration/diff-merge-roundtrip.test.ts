/**
 * Integration Test: Diff → Merge Roundtrip
 *
 * Creates two diverged commits, diffs them, prepares merge,
 * executes merge with decisions, and validates the result.
 */

import { describe, expect, it } from 'vitest';
import { frameDiff } from '../../semantic/diff';
import { executeFrameMerge, prepareFrameMerge } from '../../semantic/merge';
import type { SemanticContent } from '../../semantic/types';

describe('diff-merge roundtrip integration', () => {
  // Base commit: shared ancestor
  const base: SemanticContent = {
    frames: [
      { id: 'f_001', type: 'travel_plan', slots: { destination: 'Japan', duration: '2 weeks' } },
      { id: 'f_002', type: 'budget', slots: { amount: 5000, currency: 'USD' } },
      { id: 'f_003', type: 'preference', slots: { food: 'sushi' } },
    ],
    relations: [{ from: 'f_002', to: 'f_001', type: 'depends' }],
  };

  // Source branch: changed budget + added activity
  const source: SemanticContent = {
    frames: [
      { id: 'f_001', type: 'travel_plan', slots: { destination: 'Japan', duration: '2 weeks' } },
      { id: 'f_002', type: 'budget', slots: { amount: 7000, currency: 'USD' } }, // changed
      { id: 'f_003', type: 'preference', slots: { food: 'sushi' } },
      { id: 'f_004', type: 'activity', slots: { name: 'temple visit' } }, // added
    ],
    relations: [
      { from: 'f_002', to: 'f_001', type: 'depends' },
      { from: 'f_004', to: 'f_001', type: 'elaborates' }, // new relation
    ],
  };

  // Target branch: changed preference + added accommodation
  const target: SemanticContent = {
    frames: [
      { id: 'f_001', type: 'travel_plan', slots: { destination: 'Japan', duration: '3 weeks' } }, // changed duration
      { id: 'f_002', type: 'budget', slots: { amount: 5000, currency: 'USD' } },
      { id: 'f_003', type: 'preference', slots: { food: 'ramen' } }, // changed
      { id: 'f_005', type: 'accommodation', slots: { type: 'ryokan' } }, // added
    ],
    relations: [
      { from: 'f_002', to: 'f_001', type: 'depends' },
      { from: 'f_005', to: 'f_001', type: 'elaborates' }, // new relation
    ],
  };

  it('diff detects all changes between source and target', () => {
    const diff = frameDiff(source, target);

    // f_003 common but changed (sushi → ramen)
    expect(diff.modified.length).toBeGreaterThan(0);
    const prefMod = diff.modified.find((m) => m.frameId === 'f_003');
    expect(prefMod).toBeDefined();
    expect(prefMod!.slotDiffs.some((d) => d.key === 'food')).toBe(true);

    // f_004 only in source
    expect(diff.onlyInSource.some((f) => f.id === 'f_004')).toBe(true);
    // f_005 only in target
    expect(diff.onlyInTarget.some((f) => f.id === 'f_005')).toBe(true);
  });

  it('prepare merge detects conflicts and categorizes frames', () => {
    const prepared = prepareFrameMerge(base, source, target);

    // f_002: only source changed (amount 5000→7000) → auto-kept with source value
    const f002AutoKept = prepared.autoKept.find((f) => f.id === 'f_002');
    expect(f002AutoKept).toBeDefined();
    expect(f002AutoKept!.slots.amount).toBe(7000);

    // f_001: only target changed (duration 2w→3w) → auto-kept with target value
    const f001AutoKept = prepared.autoKept.find((f) => f.id === 'f_001');
    expect(f001AutoKept).toBeDefined();
    expect(f001AutoKept!.slots.duration).toBe('3 weeks');

    // f_003: only target changed (sushi→ramen) → auto-kept with target value
    const f003AutoKept = prepared.autoKept.find((f) => f.id === 'f_003');
    expect(f003AutoKept).toBeDefined();
    expect(f003AutoKept!.slots.food).toBe('ramen');

    // f_004 only in source, f_005 only in target
    expect(prepared.onlyInSource.some((f) => f.id === 'f_004')).toBe(true);
    expect(prepared.onlyInTarget.some((f) => f.id === 'f_005')).toBe(true);
  });

  it('execute merge produces valid merged content', () => {
    const prepared = prepareFrameMerge(base, source, target);

    // No conflicts in this scenario (each frame changed by only one side)
    expect(prepared.conflicts).toHaveLength(0);

    const result = executeFrameMerge(prepared, {
      conflictResolutions: {},
      keepFromSource: ['f_004'], // keep temple visit
      keepFromTarget: ['f_005'], // keep ryokan accommodation
      keepRelationsFromSource: true,
      keepRelationsFromTarget: true,
    });

    // All 5 frames should be in merged result (3 auto-kept + 2 unique kept)
    const ids = result.frames.map((f) => f.id).sort();
    expect(ids).toEqual(['f_001', 'f_002', 'f_003', 'f_004', 'f_005']);

    // Verify auto-resolved values
    expect(result.frames.find((f) => f.id === 'f_001')!.slots.duration).toBe('3 weeks'); // target changed
    expect(result.frames.find((f) => f.id === 'f_002')!.slots.amount).toBe(7000); // source changed
    expect(result.frames.find((f) => f.id === 'f_003')!.slots.food).toBe('ramen'); // target changed

    // Relations should include shared + both sides
    expect(result.relations.length).toBeGreaterThan(0);
  });

  it('roundtrip: merged content diffs cleanly against both parents', () => {
    const prepared = prepareFrameMerge(base, source, target);
    const merged = executeFrameMerge(prepared, {
      conflictResolutions: {},
      keepFromSource: ['f_004'],
      keepFromTarget: ['f_005'],
      keepRelationsFromSource: true,
      keepRelationsFromTarget: true,
    });

    // Diff merged against source — should show target-only changes
    const diffVsSource = frameDiff(source, merged);
    // f_005 was added from target
    expect(diffVsSource.onlyInTarget.some((f) => f.id === 'f_005')).toBe(true);
    // f_001 was changed to target's version
    const f001Mod = diffVsSource.modified.find((m) => m.frameId === 'f_001');
    expect(f001Mod).toBeDefined();

    // Diff merged against target — should show source-only changes
    const diffVsTarget = frameDiff(target, merged);
    // f_004 was added from source
    expect(diffVsTarget.onlyInTarget.some((f) => f.id === 'f_004')).toBe(true);
  });
});

describe('topic merge', () => {
  const baseContent: SemanticContent = {
    topic: 'Original Topic',
    root_frame_id: 'f_001',
    frames: [{ id: 'f_001', type: 'plan', slots: { a: 1 } }],
    relations: [],
  };

  it('auto-resolves when only source changes topic', () => {
    const source: SemanticContent = { ...baseContent, topic: 'Source Topic' };
    const target: SemanticContent = { ...baseContent };
    const result = prepareFrameMerge(baseContent, source, target);
    expect(result.topicConflict).toBeUndefined();
    expect(result.resolvedTopic).toBe('Source Topic');
  });

  it('auto-resolves when only target changes topic', () => {
    const source: SemanticContent = { ...baseContent };
    const target: SemanticContent = { ...baseContent, topic: 'Target Topic' };
    const result = prepareFrameMerge(baseContent, source, target);
    expect(result.topicConflict).toBeUndefined();
    expect(result.resolvedTopic).toBe('Target Topic');
  });

  it('detects topic conflict when both sides change differently', () => {
    const source: SemanticContent = { ...baseContent, topic: 'Source Topic' };
    const target: SemanticContent = { ...baseContent, topic: 'Target Topic' };
    const result = prepareFrameMerge(baseContent, source, target);
    expect(result.topicConflict).toEqual({
      base: 'Original Topic',
      source: 'Source Topic',
      target: 'Target Topic',
    });
  });

  it('auto-resolves when both sides change topic identically', () => {
    const source: SemanticContent = { ...baseContent, topic: 'Same New Topic' };
    const target: SemanticContent = { ...baseContent, topic: 'Same New Topic' };
    const result = prepareFrameMerge(baseContent, source, target);
    expect(result.topicConflict).toBeUndefined();
    expect(result.resolvedTopic).toBe('Same New Topic');
  });

  it('auto-resolves when only source changes root_frame_id', () => {
    const source: SemanticContent = { ...baseContent, root_frame_id: 'f_002' };
    const target: SemanticContent = { ...baseContent };
    const result = prepareFrameMerge(baseContent, source, target);
    expect(result.rootConflict).toBeUndefined();
    expect(result.resolvedRoot).toBe('f_002');
  });

  it('detects root conflict when both sides change differently', () => {
    const source: SemanticContent = { ...baseContent, root_frame_id: 'f_002' };
    const target: SemanticContent = { ...baseContent, root_frame_id: 'f_003' };
    const result = prepareFrameMerge(baseContent, source, target);
    expect(result.rootConflict).toEqual({
      base: 'f_001',
      source: 'f_002',
      target: 'f_003',
    });
  });

  it('executeFrameMerge applies topic decision', () => {
    const source: SemanticContent = { ...baseContent, topic: 'Source Topic' };
    const target: SemanticContent = { ...baseContent, topic: 'Target Topic' };
    const prepared = prepareFrameMerge(baseContent, source, target);
    const merged = executeFrameMerge(prepared, {
      conflictResolutions: {},
      keepFromSource: [],
      keepFromTarget: [],
      keepRelationsFromSource: true,
      keepRelationsFromTarget: true,
      topicChoice: 'target',
    });
    expect(merged.topic).toBe('Target Topic');
  });

  it('executeFrameMerge applies topic edit', () => {
    const source: SemanticContent = { ...baseContent, topic: 'Source Topic' };
    const target: SemanticContent = { ...baseContent, topic: 'Target Topic' };
    const prepared = prepareFrameMerge(baseContent, source, target);
    const merged = executeFrameMerge(prepared, {
      conflictResolutions: {},
      keepFromSource: [],
      keepFromTarget: [],
      keepRelationsFromSource: true,
      keepRelationsFromTarget: true,
      topicChoice: 'edit',
      topicEdit: 'Custom Topic',
    });
    expect(merged.topic).toBe('Custom Topic');
  });

  it('executeFrameMerge applies root decision', () => {
    const source: SemanticContent = { ...baseContent, root_frame_id: 'f_002' };
    const target: SemanticContent = { ...baseContent, root_frame_id: 'f_003' };
    const prepared = prepareFrameMerge(baseContent, source, target);
    const merged = executeFrameMerge(prepared, {
      conflictResolutions: {},
      keepFromSource: [],
      keepFromTarget: [],
      keepRelationsFromSource: true,
      keepRelationsFromTarget: true,
      rootChoice: 'source',
    });
    expect(merged.root_frame_id).toBe('f_002');
  });

  it('executeFrameMerge preserves auto-resolved topic and root', () => {
    const source: SemanticContent = { ...baseContent, topic: 'New Topic' };
    const target: SemanticContent = { ...baseContent };
    const prepared = prepareFrameMerge(baseContent, source, target);
    const merged = executeFrameMerge(prepared, {
      conflictResolutions: {},
      keepFromSource: [],
      keepFromTarget: [],
      keepRelationsFromSource: true,
      keepRelationsFromTarget: true,
    });
    expect(merged.topic).toBe('New Topic');
    expect(merged.root_frame_id).toBe('f_001');
  });
});

describe('topic and root_frame_id diff', () => {
  it('detects topic change', () => {
    const source: SemanticContent = {
      topic: 'Japan Travel',
      root_frame_id: 'f_001',
      frames: [{ id: 'f_001', type: 'plan', slots: { goal: 'travel' } }],
      relations: [],
    };
    const target: SemanticContent = {
      topic: 'Japan Extended Itinerary',
      root_frame_id: 'f_001',
      frames: [{ id: 'f_001', type: 'plan', slots: { goal: 'travel' } }],
      relations: [],
    };
    const diff = frameDiff(source, target);
    expect(diff.topicChanged).toEqual({
      oldTopic: 'Japan Travel',
      newTopic: 'Japan Extended Itinerary',
    });
    expect(diff.rootChanged).toBeUndefined();
  });

  it('detects root_frame_id change', () => {
    const source: SemanticContent = {
      topic: 'Planning',
      root_frame_id: 'f_001',
      frames: [
        { id: 'f_001', type: 'plan', slots: { a: 1 } },
        { id: 'f_002', type: 'budget', slots: { b: 2 } },
      ],
      relations: [],
    };
    const target: SemanticContent = {
      topic: 'Planning',
      root_frame_id: 'f_002',
      frames: [
        { id: 'f_001', type: 'plan', slots: { a: 1 } },
        { id: 'f_002', type: 'budget', slots: { b: 2 } },
      ],
      relations: [],
    };
    const diff = frameDiff(source, target);
    expect(diff.rootChanged).toEqual({ oldRoot: 'f_001', newRoot: 'f_002' });
    expect(diff.topicChanged).toBeUndefined();
  });

  it('returns undefined when topic/root unchanged', () => {
    const content: SemanticContent = {
      topic: 'Same',
      root_frame_id: 'f_001',
      frames: [{ id: 'f_001', type: 'plan', slots: { a: 1 } }],
      relations: [],
    };
    const diff = frameDiff(content, content);
    expect(diff.topicChanged).toBeUndefined();
    expect(diff.rootChanged).toBeUndefined();
  });

  it('handles undefined to defined topic', () => {
    const source: SemanticContent = {
      frames: [{ id: 'f_001', type: 'plan', slots: { a: 1 } }],
      relations: [],
    };
    const target: SemanticContent = {
      topic: 'New Topic',
      frames: [{ id: 'f_001', type: 'plan', slots: { a: 1 } }],
      relations: [],
    };
    const diff = frameDiff(source, target);
    expect(diff.topicChanged).toEqual({ oldTopic: undefined, newTopic: 'New Topic' });
  });
});

import type { Delta, DeltaLogEntry, SemanticContent, SlotValue } from './types';

/**
 * Apply a delta to a semantic snapshot, returning a new snapshot.
 * Pure function — does not mutate the input.
 *
 * Note: The result is NOT automatically validated. Callers should run
 * `validateIntegrity()` on the result before committing to storage.
 */
export function applyDelta(snapshot: SemanticContent, delta: Delta): SemanticContent {
  const frames = snapshot.frames.map((f) => ({ ...f, slots: { ...f.slots } }));
  let relations = [...snapshot.relations];

  for (const change of delta.changes) {
    switch (change.action) {
      case 'add':
        frames.push({ ...change.frame, slots: { ...change.frame.slots } });
        break;

      case 'update': {
        const idx = frames.findIndex((f) => f.id === change.target);
        if (idx === -1) break; // Skip silently — frame may have been removed by a prior delta
        const updated = { ...frames[idx], slots: { ...frames[idx].slots } };
        for (const [key, value] of Object.entries(change.slots)) {
          if (value === null) {
            delete updated.slots[key];
          } else {
            updated.slots[key] = value as SlotValue;
          }
        }
        frames[idx] = updated;
        break;
      }

      case 'remove': {
        const idx = frames.findIndex((f) => f.id === change.target);
        if (idx === -1) break; // Skip silently — frame already removed or never existed (idempotent)
        const removedId = change.target;
        frames.splice(idx, 1);
        relations = relations.filter((r) => r.from !== removedId && r.to !== removedId);
        break;
      }
    }
  }

  if (delta.new_relations) {
    relations.push(...delta.new_relations);
  }

  if (delta.remove_relations) {
    for (const toRemove of delta.remove_relations) {
      const idx = relations.findIndex(
        (r) => r.from === toRemove.from && r.to === toRemove.to && r.type === toRemove.type
      );
      if (idx !== -1) relations.splice(idx, 1);
    }
  }

  return { frames, relations };
}

export function buildDraft(deltaLog: DeltaLogEntry[]): SemanticContent {
  let draft: SemanticContent = { frames: [], relations: [] };
  for (const entry of deltaLog) {
    draft = applyDelta(draft, entry.delta);
  }
  return draft;
}

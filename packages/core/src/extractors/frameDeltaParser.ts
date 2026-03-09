/**
 * Frame Delta Parser
 *
 * Parses raw LLM text output and extracts valid Delta JSON.
 * Handles three cases:
 * 1. Normal delta JSON (has `changes` key) → validate with DeltaSchema
 * 2. First extraction full output (has `frames` key, no snapshot) → convert to all-add
 * 3. Full output when snapshot exists → diff against snapshot, auto-convert to minimal delta
 */

import { DeltaSchema, FrameSchema } from '../semantic/schema';
import type {
  Delta,
  Frame,
  FrameChange,
  Relation,
  SemanticContent,
  SlotValue,
} from '../semantic/types';
import { deepEqual, relKey } from '../semantic/utils';

// ── Result type ──

export type ParseResult = { ok: true; delta: Delta } | { ok: false; error: string };

// ── JSON extraction ──

/**
 * Extract JSON object string from raw LLM text.
 * Tries code fences first, then bare JSON.
 */
function extractJson(raw: string): string | null {
  // Try code fences: ```json ... ``` or ``` ... ```
  const fenceMatch = raw.match(/```(?:json)?\s*\n?([\s\S]*?)```/);
  if (fenceMatch) {
    return fenceMatch[1].trim();
  }
  // Try bare JSON: find first { and last }
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start !== -1 && end > start) {
    return raw.slice(start, end + 1);
  }
  return null;
}

// ── Full output → all-add delta (Case 2) ──

function fullOutputToAllAdd(parsed: { frames: unknown[]; relations?: unknown[] }): ParseResult {
  const frames: Frame[] = [];
  for (const f of parsed.frames) {
    const result = FrameSchema.safeParse(f);
    if (!result.success) {
      return { ok: false, error: `Invalid frame in full output: ${result.error.message}` };
    }
    frames.push(result.data as Frame);
  }

  if (frames.length === 0) {
    return { ok: false, error: 'Full output contains no frames' };
  }

  const changes: FrameChange[] = frames.map((frame) => ({ action: 'add' as const, frame }));

  const delta: Delta = { changes };

  // Handle relations
  if (parsed.relations && Array.isArray(parsed.relations) && parsed.relations.length > 0) {
    delta.new_relations = parsed.relations as Relation[];
  }

  // Validate final delta
  const validation = DeltaSchema.safeParse(delta);
  if (!validation.success) {
    return { ok: false, error: `Generated delta failed validation: ${validation.error.message}` };
  }

  return { ok: true, delta: validation.data as Delta };
}

// ── Full output + snapshot → diff delta (Case 3) ──

function diffAgainstSnapshot(
  parsed: { frames: unknown[]; relations?: unknown[] },
  snapshot: SemanticContent
): ParseResult {
  // Validate incoming frames
  const newFrames: Frame[] = [];
  for (const f of parsed.frames) {
    const result = FrameSchema.safeParse(f);
    if (!result.success) {
      return { ok: false, error: `Invalid frame in full output: ${result.error.message}` };
    }
    newFrames.push(result.data as Frame);
  }

  const snapshotMap = new Map<string, Frame>();
  for (const f of snapshot.frames) {
    snapshotMap.set(f.id, f);
  }

  const newMap = new Map<string, Frame>();
  for (const f of newFrames) {
    newMap.set(f.id, f);
  }

  const changes: FrameChange[] = [];

  // Check new/modified frames
  for (const f of newFrames) {
    const old = snapshotMap.get(f.id);
    if (!old) {
      // New frame → add
      changes.push({ action: 'add', frame: f });
    } else {
      // Check for slot differences
      const changedSlots: Record<string, SlotValue | null> = {};
      let hasChanges = false;

      // Check slots in new frame
      for (const [key, value] of Object.entries(f.slots)) {
        if (!(key in old.slots) || !deepEqual(value, old.slots[key])) {
          changedSlots[key] = value;
          hasChanges = true;
        }
      }

      // Check for removed slots (in old but not in new → null)
      for (const key of Object.keys(old.slots)) {
        if (!(key in f.slots)) {
          changedSlots[key] = null;
          hasChanges = true;
        }
      }

      if (hasChanges) {
        changes.push({ action: 'update', target: f.id, slots: changedSlots });
      }
    }
  }

  // Check for removed frames (in snapshot but not in new output)
  for (const f of snapshot.frames) {
    if (!newMap.has(f.id)) {
      changes.push({ action: 'remove', target: f.id });
    }
  }

  // Handle relation changes
  const oldRelKeys = new Set(snapshot.relations.map(relKey));
  const newRelations = (parsed.relations ?? []) as Relation[];
  const newRelKeys = new Set(newRelations.map(relKey));

  const addedRelations = newRelations.filter((r) => !oldRelKeys.has(relKey(r)));
  const removedRelations = snapshot.relations.filter((r) => !newRelKeys.has(relKey(r)));

  // If nothing changed at all, return error
  if (changes.length === 0 && addedRelations.length === 0 && removedRelations.length === 0) {
    return { ok: false, error: 'No changes detected between output and snapshot' };
  }

  // Build delta — if only relation changes, we still need at least one change for DeltaSchema
  // But if there are only relation changes and no frame changes, this is still a valid scenario
  // DeltaSchema requires changes.min(1), so we need to handle this edge case
  if (changes.length === 0) {
    return {
      ok: false,
      error: 'No frame changes detected (only relation changes are not sufficient for a delta)',
    };
  }

  const delta: Delta = { changes };
  if (addedRelations.length > 0) {
    delta.new_relations = addedRelations;
  }
  if (removedRelations.length > 0) {
    delta.remove_relations = removedRelations;
  }

  // Validate final delta
  const validation = DeltaSchema.safeParse(delta);
  if (!validation.success) {
    return { ok: false, error: `Generated delta failed validation: ${validation.error.message}` };
  }

  return { ok: true, delta: validation.data as Delta };
}

// ── Main export ──

export function parseFrameDelta(raw: string, snapshot?: SemanticContent): ParseResult {
  const jsonStr = extractJson(raw);
  if (!jsonStr) {
    return { ok: false, error: 'Could not parse JSON from raw text' };
  }

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(jsonStr);
  } catch {
    return { ok: false, error: 'Could not parse JSON from raw text' };
  }

  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    return { ok: false, error: 'Parsed JSON is not an object' };
  }

  // Case 1: Delta JSON (has `changes` key)
  if ('changes' in parsed) {
    const result = DeltaSchema.safeParse(parsed);
    if (!result.success) {
      return { ok: false, error: `Delta validation failed: ${result.error.message}` };
    }
    return { ok: true, delta: result.data as Delta };
  }

  // Case 2 & 3: Full output (has `frames` key)
  if ('frames' in parsed && Array.isArray(parsed.frames)) {
    if (snapshot) {
      // Case 3: Diff against snapshot
      return diffAgainstSnapshot(parsed as { frames: unknown[]; relations?: unknown[] }, snapshot);
    }
    // Case 2: First extraction, no snapshot → all-add
    return fullOutputToAllAdd(parsed as { frames: unknown[]; relations?: unknown[] });
  }

  return { ok: false, error: 'JSON has neither "changes" nor "frames" key' };
}

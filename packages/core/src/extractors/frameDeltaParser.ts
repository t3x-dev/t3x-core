/**
 * Frame Delta Parser
 *
 * Parses raw LLM text output and extracts valid Delta JSON.
 * Handles five cases:
 * 1. YAML tree (first extraction, tree-native) → parse YAML + metadata → tree result
 * 2. Tree-native delta JSON (has `changes` with `parent_path`/`target_path`) → validate → tree-delta
 * 3. Legacy delta JSON (has `changes` key with `target`/`frame`) → validate with DeltaSchema
 * 4. First extraction full output (has `frames` key, no snapshot) → convert to all-add
 * 5. Full output when snapshot exists → diff against snapshot, auto-convert to minimal delta
 */

import * as yaml from 'js-yaml';
import { normalizeFrameOutput } from '../llm/normalizer';
import type { TreeNativeDelta } from '../semantic/delta';
import { DeltaSchema, FrameSchema, TreeNativeDeltaSchema } from '../semantic/schema';
import { flattenTree } from '../semantic/tree';
import type {
  Delta,
  Frame,
  FrameChange,
  Relation,
  SemanticContent,
  SlotValue,
  TreeNode,
} from '../semantic/types';
import { deepEqual, relKey } from '../semantic/utils';

// ── Result type ──

export type ParseResult =
  // Legacy: flat-frame delta
  | { ok: true; format: 'legacy'; delta: Delta }
  // Tree-native: first extraction (YAML tree)
  | { ok: true; format: 'tree'; tree: TreeNode; slotQuotes: Record<string, string>; delta: Delta }
  // Tree-native: delta update (JSON with path-based targets)
  | { ok: true; format: 'tree-delta'; treeDelta: TreeNativeDelta; delta: Delta }
  // Error
  | { ok: false; error: string };

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

// ── YAML tree parsing (tree-native first extraction) ──

/**
 * Check if raw text is a YAML tree (tree-native first extraction).
 *
 * YAML trees start with a key like "hangzhou_trip:" on the first line.
 * Must not be confused with natural language preamble before JSON.
 *
 * Detection rules:
 * 1. First line matches YAML root key pattern: word_chars + ":"
 * 2. No code-fenced JSON (```json ... ```) present
 * 3. No bare JSON object starting line (first { not preceded by YAML structure)
 */
function isYamlTree(raw: string): boolean {
  const trimmed = raw.trimStart();
  if (trimmed.length === 0) return false;

  // Quick check: starts with { or [ → definitely not YAML
  const firstChar = trimmed[0];
  if (firstChar === '{' || firstChar === '[') return false;

  // First line must be a YAML root key (snake_case word followed by colon)
  const firstLine = trimmed.split('\n')[0].trim();
  if (!/^[a-z][a-z0-9_]*:\s*$/.test(firstLine) && !/^[a-z][a-z0-9_]*:\s*\S/.test(firstLine)) {
    return false;
  }

  // If there's a code fence with JSON, it's not a pure YAML tree
  if (/```(?:json)?\s*\n[\s\S]*?```/.test(raw)) {
    return false;
  }

  return true;
}

/**
 * Convert a YAML object to a TreeNode.
 * Top-level key = root node key.
 * At each level: scalar values and arrays = slots; object values = children.
 */
function yamlToTreeNode(key: string, value: unknown): TreeNode {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    // Scalar or array at the top level — treat as a single-slot node
    return { key, slots: { [key]: value as SlotValue }, children: [] };
  }

  const obj = value as Record<string, unknown>;
  const slots: Record<string, SlotValue> = {};
  const children: TreeNode[] = [];

  for (const [k, v] of Object.entries(obj)) {
    if (typeof v === 'object' && v !== null && !Array.isArray(v)) {
      // Object value → child node
      children.push(yamlToTreeNode(k, v));
    } else {
      // Scalar or array → slot
      slots[k] = v as SlotValue;
    }
  }

  return { key, slots, children };
}

/**
 * Apply metadata (slot_quotes, source_map, confidence_map) to a tree node.
 */
function applyMetadataToTree(
  node: TreeNode,
  slotQuotes: Record<string, string>,
  sourceMap: Record<string, string>,
  confidenceMap: Record<string, number>
): void {
  // Apply source and confidence for this node
  if (node.key in sourceMap) {
    node.source = sourceMap[node.key];
  }
  if (node.key in confidenceMap) {
    node.confidence = confidenceMap[node.key];
  }

  // Apply slot_quotes for this node
  // slot_quotes use dot-path notation: "dining.cuisine" means node "dining", slot "cuisine"
  // For root-level slots, the key is just the slot name (e.g., "destination")
  const nodeQuotes: Record<string, string> = {};
  for (const [quotePath, quoteValue] of Object.entries(slotQuotes)) {
    const segments = quotePath.split('.');
    if (segments.length === 1 && segments[0] in node.slots) {
      // Root-level slot quote
      nodeQuotes[segments[0]] = quoteValue;
    }
  }
  if (Object.keys(nodeQuotes).length > 0) {
    node.slot_quotes = { ...node.slot_quotes, ...nodeQuotes };
  }

  // Recursively apply to children
  for (const child of node.children) {
    applyChildMetadata(child, slotQuotes, sourceMap, confidenceMap, child.key);
  }
}

/**
 * Apply metadata to a child node using dot-path prefix matching.
 */
function applyChildMetadata(
  node: TreeNode,
  slotQuotes: Record<string, string>,
  sourceMap: Record<string, string>,
  confidenceMap: Record<string, number>,
  dotPathPrefix: string
): void {
  // Apply source and confidence
  if (node.key in sourceMap) {
    node.source = sourceMap[node.key];
  }
  if (node.key in confidenceMap) {
    node.confidence = confidenceMap[node.key];
  }

  // Apply slot_quotes matching this node's dot-path prefix
  const nodeQuotes: Record<string, string> = {};
  for (const [quotePath, quoteValue] of Object.entries(slotQuotes)) {
    const segments = quotePath.split('.');
    if (segments.length >= 2 && segments[0] === dotPathPrefix) {
      if (segments.length === 2 && segments[1] in node.slots) {
        nodeQuotes[segments[1]] = quoteValue;
      }
    }
  }
  if (Object.keys(nodeQuotes).length > 0) {
    node.slot_quotes = { ...node.slot_quotes, ...nodeQuotes };
  }

  // Recurse to grandchildren
  for (const child of node.children) {
    applyChildMetadata(
      child,
      slotQuotes,
      sourceMap,
      confidenceMap,
      `${dotPathPrefix}.${child.key}`
    );
  }
}

/**
 * Parse YAML tree output (tree-native first extraction).
 * Splits on --- to separate YAML tree from JSON metadata.
 */
function parseYamlTree(raw: string): ParseResult {
  // Split on --- separator
  const parts = raw.split(/^---$/m);
  const yamlPart = parts[0].trim();
  const metadataPart = parts.length > 1 ? parts.slice(1).join('---').trim() : '';

  // Parse YAML
  let yamlObj: unknown;
  try {
    yamlObj = yaml.load(yamlPart);
  } catch (e) {
    return { ok: false, error: `YAML parse error: ${e instanceof Error ? e.message : String(e)}` };
  }

  if (typeof yamlObj !== 'object' || yamlObj === null || Array.isArray(yamlObj)) {
    return { ok: false, error: 'YAML did not parse to an object' };
  }

  // Get root key — the top-level key of the YAML object
  const entries = Object.entries(yamlObj as Record<string, unknown>);
  if (entries.length === 0) {
    return { ok: false, error: 'YAML object is empty' };
  }

  const [rootKey, rootValue] = entries[0];
  const tree = yamlToTreeNode(rootKey, rootValue);

  // Parse metadata (JSON after ---)
  let slotQuotes: Record<string, string> = {};
  let sourceMap: Record<string, string> = {};
  let confidenceMap: Record<string, number> = {};

  if (metadataPart) {
    try {
      const jsonStr = extractJson(metadataPart);
      if (jsonStr) {
        const metadata = JSON.parse(jsonStr);
        if (metadata.slot_quotes && typeof metadata.slot_quotes === 'object') {
          slotQuotes = metadata.slot_quotes;
        }
        if (metadata.source_map && typeof metadata.source_map === 'object') {
          sourceMap = metadata.source_map;
        }
        if (metadata.confidence_map && typeof metadata.confidence_map === 'object') {
          confidenceMap = metadata.confidence_map;
        }
      }
    } catch {
      // Metadata parsing failure is non-fatal — tree is still valid
    }
  }

  // Apply metadata to tree
  applyMetadataToTree(tree, slotQuotes, sourceMap, confidenceMap);

  // Flatten tree to frames for backward-compatible delta
  const frames = flattenTree(tree);
  const changes: FrameChange[] = frames.map((frame) => ({ action: 'add' as const, frame }));
  const delta: Delta = { changes };

  return { ok: true, format: 'tree', tree, slotQuotes, delta };
}

// ── Tree-native delta detection and parsing ──

/**
 * Check if a parsed JSON object is a tree-native delta (has path-based targets).
 */
function isTreeNativeDelta(parsed: Record<string, unknown>): boolean {
  if (!('changes' in parsed) || !Array.isArray(parsed.changes)) return false;
  return parsed.changes.some(
    (c: Record<string, unknown>) =>
      typeof c.parent_path === 'string' || typeof c.target_path === 'string'
  );
}

/**
 * Convert a tree-native delta change's add node to flattened Frame changes.
 */
function treeNativeNodeToFrameChanges(
  parentPath: string,
  nodeObj: Record<string, unknown>
): FrameChange[] {
  const changes: FrameChange[] = [];
  for (const [key, value] of Object.entries(nodeObj)) {
    const node = yamlToTreeNode(key, value);
    const frames = flattenTree(node);
    // Prefix all frame IDs with parentPath
    for (const frame of frames) {
      frame.id = `${parentPath}/${frame.id}`;
      changes.push({ action: 'add' as const, frame });
    }
  }
  return changes;
}

/**
 * Convert a tree-native delta to a legacy Delta for backward compatibility.
 */
function treeNativeDeltaToLegacy(treeDelta: TreeNativeDelta): Delta {
  const changes: FrameChange[] = [];

  for (const change of treeDelta.changes) {
    switch (change.action) {
      case 'add': {
        if (change.parent_path && change.node) {
          changes.push(...treeNativeNodeToFrameChanges(change.parent_path, change.node));
        }
        break;
      }
      case 'update': {
        if (change.target_path && change.slots) {
          changes.push({
            action: 'update',
            target: change.target_path,
            slots: change.slots,
          });
        }
        break;
      }
      case 'remove': {
        if (change.target_path) {
          changes.push({
            action: 'remove',
            target: change.target_path,
            ...(change.reason ? { reason: change.reason } : {}),
          });
        }
        break;
      }
    }
  }

  const delta: Delta = { changes };
  if (treeDelta.new_relations && treeDelta.new_relations.length > 0) {
    delta.new_relations = treeDelta.new_relations;
  }
  if (treeDelta.remove_relations && treeDelta.remove_relations.length > 0) {
    delta.remove_relations = treeDelta.remove_relations;
  }

  return delta;
}

/**
 * Parse tree-native delta JSON.
 */
function parseTreeNativeDelta(parsed: Record<string, unknown>): ParseResult {
  // Special case: drift_detected with empty changes
  if (
    parsed.drift_detected === true &&
    Array.isArray(parsed.changes) &&
    parsed.changes.length === 0
  ) {
    const treeDelta: TreeNativeDelta = {
      changes: [],
      drift_detected: true,
      ...(parsed.new_relations ? { new_relations: parsed.new_relations as Relation[] } : {}),
      ...(parsed.remove_relations
        ? { remove_relations: parsed.remove_relations as Relation[] }
        : {}),
    };
    // Return ok with empty delta for drift detection
    return { ok: true, format: 'tree-delta', treeDelta, delta: { changes: [] } };
  }

  // Validate with TreeNativeDeltaSchema
  const validation = TreeNativeDeltaSchema.safeParse(parsed);
  if (!validation.success) {
    return {
      ok: false,
      error: `Tree-native delta validation failed: ${validation.error.message}`,
    };
  }

  const treeDelta = validation.data as TreeNativeDelta;
  const delta = treeNativeDeltaToLegacy(treeDelta);

  return { ok: true, format: 'tree-delta', treeDelta, delta };
}

// ── Full output → all-add delta (Legacy Case 2) ──

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

  return { ok: true, format: 'legacy', delta: validation.data as Delta };
}

// ── Full output + snapshot → diff delta (Legacy Case 3) ──

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

  return { ok: true, format: 'legacy', delta: validation.data as Delta };
}

// ── Main export ──

export function parseFrameDelta(raw: string, snapshot?: SemanticContent): ParseResult {
  // Step 1: Check if raw starts with word char (not { or [) → YAML tree path
  if (isYamlTree(raw)) {
    return parseYamlTree(raw);
  }

  // Step 2: Extract JSON from raw
  const jsonStr = extractJson(raw);
  if (!jsonStr) {
    return { ok: false, error: 'Could not parse JSON from raw text' };
  }

  // Step 3: Parse JSON
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(jsonStr);
  } catch {
    return { ok: false, error: 'Could not parse JSON from raw text' };
  }

  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    return { ok: false, error: 'Parsed JSON is not an object' };
  }

  // Step 4: If has 'changes': check isTreeNativeDelta → tree-delta path, else → legacy delta
  if ('changes' in parsed) {
    if (isTreeNativeDelta(parsed)) {
      return parseTreeNativeDelta(parsed);
    }

    // Legacy delta: normalize before schema validation
    parsed = normalizeFrameOutput(parsed);
    const result = DeltaSchema.safeParse(parsed);
    if (!result.success) {
      return { ok: false, error: `Delta validation failed: ${result.error.message}` };
    }
    return { ok: true, format: 'legacy', delta: result.data as Delta };
  }

  // Normalize before schema validation (coerces plain objects in slot arrays, etc.)
  parsed = normalizeFrameOutput(parsed);

  // Step 5: If has 'frames': legacy full output path
  if ('frames' in parsed && Array.isArray(parsed.frames)) {
    if (snapshot) {
      // Case 3: Diff against snapshot
      return diffAgainstSnapshot(parsed as { frames: unknown[]; relations?: unknown[] }, snapshot);
    }
    // Case 2: First extraction, no snapshot → all-add
    return fullOutputToAllAdd(parsed as { frames: unknown[]; relations?: unknown[] });
  }

  // Step 6: Error
  return { ok: false, error: 'JSON has neither "changes" nor "frames" key' };
}

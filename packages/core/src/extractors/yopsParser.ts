/**
 * YOps Parser
 *
 * Parses raw LLM text output into YOp[] operations.
 * Handles two formats:
 * 1. YAML tree (first extraction) → single `add` YOp
 * 2. YOps list (incremental) → validated YOp[]
 */

import * as yaml from 'js-yaml';
import { yamlToTree } from '../semantic/tree';
import type { SlotValue, TreeNode } from '../semantic/types';
import { YOpSchema } from '../yops/schema';
import type { YOp } from '../yops/types';

// ── Result type ──

export type YOpsParseResult =
  | { ok: true; format: 'tree'; yops: YOp[]; tree: TreeNode; slotQuotes: Record<string, string> }
  | { ok: true; format: 'yops'; yops: YOp[] }
  | { ok: false; error: string };

// ── Helpers ──

/**
 * Strip markdown code fences (```yaml ... ``` or ``` ... ```).
 */
function stripFences(raw: string): string {
  const match = raw.match(/```(?:ya?ml|json)?\s*\n([\s\S]*?)```/);
  if (match) {
    return match[1].trim();
  }
  return raw.trim();
}

/**
 * Check if the first non-empty line is a YAML root key (snake_case key followed by colon).
 */
function isYamlTree(cleaned: string): boolean {
  const firstLine = cleaned.split('\n')[0].trim();
  return /^[a-z][a-z0-9_]*:\s*$/.test(firstLine);
}

/**
 * Check if the first non-empty line starts with "yops:".
 */
function isYopsList(cleaned: string): boolean {
  const firstLine = cleaned.split('\n')[0].trim();
  return firstLine === 'yops:' || firstLine.startsWith('yops:');
}

/**
 * Apply metadata (slot_quotes, source_map, confidence_map) to a tree node recursively.
 */
function applyMetadata(
  node: TreeNode,
  slotQuotes: Record<string, string>,
  sourceMap: Record<string, string>,
  confidenceMap: Record<string, number>,
  prefix: string,
): void {
  // Apply source and confidence for this node
  if (node.key in sourceMap) {
    node.source = sourceMap[node.key];
  }
  if (node.key in confidenceMap) {
    node.confidence = confidenceMap[node.key];
  }

  // Apply slot_quotes for this node
  const nodeQuotes: Record<string, string> = {};
  for (const [quotePath, quoteValue] of Object.entries(slotQuotes)) {
    const segments = quotePath.split('.');
    if (prefix === '') {
      // Root-level: match single-segment paths that are slots of this node
      if (segments.length === 1 && segments[0] in node.slots) {
        nodeQuotes[segments[0]] = quoteValue;
      }
    } else {
      // Child-level: match paths starting with the prefix
      const prefixSegments = prefix.split('.');
      if (
        segments.length === prefixSegments.length + 1 &&
        segments.slice(0, prefixSegments.length).join('.') === prefix &&
        segments[segments.length - 1] in node.slots
      ) {
        nodeQuotes[segments[segments.length - 1]] = quoteValue;
      }
    }
  }
  if (Object.keys(nodeQuotes).length > 0) {
    node.slot_quotes = { ...node.slot_quotes, ...nodeQuotes };
  }

  // Recursively apply to children
  for (const child of node.children) {
    const childPrefix = prefix ? `${prefix}.${child.key}` : child.key;
    applyMetadata(child, slotQuotes, sourceMap, confidenceMap, childPrefix);
  }
}

/**
 * Convert a TreeNode back to a plain YAML-like object for the `add` op's `node` field.
 * Returns { [node.key]: value } where value contains slots + nested children.
 */
function rebuildNodeValue(node: TreeNode): Record<string, unknown> {
  const value: Record<string, unknown> = {};

  // Add slots
  for (const [k, v] of Object.entries(node.slots)) {
    value[k] = v;
  }

  // Add children recursively
  for (const child of node.children) {
    const childObj = rebuildNodeValue(child);
    value[child.key] = childObj[child.key];
  }

  return { [node.key]: value };
}

/**
 * Collect all slot_quotes from a tree into a flat Record<string, string>.
 */
function collectSlotQuotes(node: TreeNode, prefix: string): Record<string, string> {
  const result: Record<string, string> = {};
  if (node.slot_quotes) {
    for (const [key, val] of Object.entries(node.slot_quotes)) {
      const fullPath = prefix ? `${prefix}.${key}` : key;
      result[fullPath] = val;
    }
  }
  for (const child of node.children) {
    const childPrefix = prefix ? `${prefix}.${child.key}` : child.key;
    Object.assign(result, collectSlotQuotes(child, childPrefix));
  }
  return result;
}

// ── JSON extraction for metadata ──

function extractJson(raw: string): string | null {
  const fenceMatch = raw.match(/```(?:json)?\s*\n?([\s\S]*?)```/);
  if (fenceMatch) {
    return fenceMatch[1].trim();
  }
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start !== -1 && end > start) {
    return raw.slice(start, end + 1);
  }
  return null;
}

// ── Case 1: YAML Tree ──

function parseYamlTree(cleaned: string): YOpsParseResult {
  // Split on --- separator
  const parts = cleaned.split(/^---$/m);
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

  const entries = Object.entries(yamlObj as Record<string, unknown>);
  if (entries.length === 0) {
    return { ok: false, error: 'YAML object is empty' };
  }

  const [rootKey, rootValue] = entries[0];
  const tree = yamlToTree(rootKey, rootValue);

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
      // Metadata parsing failure is non-fatal
    }
  }

  // Apply metadata to tree
  applyMetadata(tree, slotQuotes, sourceMap, confidenceMap, '');

  // Rebuild slot_quotes from tree (includes any applied metadata)
  const finalSlotQuotes = collectSlotQuotes(tree, '');

  // Build the add YOp
  const addOp: YOp = {
    add: {
      parent: '',
      node: rebuildNodeValue(tree),
      source: finalSlotQuotes,
      from: sourceMap[rootKey] ?? 'T1',
      ...(confidenceMap[rootKey] !== undefined ? { confidence: confidenceMap[rootKey] } : {}),
    },
  };

  return { ok: true, format: 'tree', yops: [addOp], tree, slotQuotes: finalSlotQuotes };
}

// ── Case 2: YOps List ──

function parseYopsList(cleaned: string): YOpsParseResult {
  let parsed: unknown;
  try {
    parsed = yaml.load(cleaned);
  } catch (e) {
    return { ok: false, error: `YAML parse error: ${e instanceof Error ? e.message : String(e)}` };
  }

  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    return { ok: false, error: 'YAML did not parse to an object' };
  }

  const obj = parsed as Record<string, unknown>;
  if (!('yops' in obj)) {
    return { ok: false, error: 'Missing "yops" key in parsed YAML' };
  }

  if (!Array.isArray(obj.yops)) {
    return { ok: false, error: '"yops" is not an array' };
  }

  // Empty array = drift/no changes
  if (obj.yops.length === 0) {
    return { ok: true, format: 'yops', yops: [] };
  }

  // Validate each operation
  const validated: YOp[] = [];
  for (let i = 0; i < obj.yops.length; i++) {
    const result = YOpSchema.safeParse(obj.yops[i]);
    if (!result.success) {
      return { ok: false, error: `Invalid yop at index ${i}: ${result.error.message}` };
    }
    validated.push(result.data as YOp);
  }

  return { ok: true, format: 'yops', yops: validated };
}

// ── Main export ──

export function parseYOpsOutput(raw: string): YOpsParseResult {
  const cleaned = stripFences(raw);

  if (cleaned.length === 0) {
    return { ok: false, error: 'Empty input' };
  }

  // Check yops first — "yops:" also matches the YAML tree pattern
  if (isYopsList(cleaned)) {
    return parseYopsList(cleaned);
  }

  if (isYamlTree(cleaned)) {
    return parseYamlTree(cleaned);
  }

  // Fallback: try as yops list anyway
  const yopsAttempt = parseYopsList(cleaned);
  if (yopsAttempt.ok) {
    return yopsAttempt;
  }

  return { ok: false, error: 'Unrecognized format: not a YAML tree or yops list' };
}

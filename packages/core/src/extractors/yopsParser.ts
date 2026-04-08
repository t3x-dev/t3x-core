/**
 * YOps Parser
 *
 * Parses raw LLM text output into YOp[] operations.
 * Handles two formats:
 * 1. YAML tree (first extraction) → `define` + `populate` YOps
 * 2. YOps list (incremental) → validated YOp[]
 */

import * as yaml from 'js-yaml';
import { yamlToTree } from '../semantic/tree';
import type { SlotValue, TreeNode } from '../semantic/types';
import { autoFixYOp } from '../ops/gates/autofix';
import { YOpSchema } from '../t3x-yops/schema';
import type { YOp } from '../t3x-yops/types';

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
 * Fix YAML strings with nested quotes that break parsing.
 * e.g., value: "素有"人间天堂"的美誉" → value: "素有「人间天堂」的美誉"
 * Also normalizes smart/curly quotes to avoid YAML issues.
 */
function sanitizeYamlQuotes(text: string): string {
  // Replace smart/curly quotes with straight quotes first
  let result = text
    .replace(/[\u201C\u201D\u201E\u201F\u2033]/g, '"')
    .replace(/[\u2018\u2019\u201A\u201B\u2032]/g, "'");

  // Fix nested double quotes inside YAML string values
  // Pattern: a line like `key: "text"nested"text"` → `key: "text「nested」text"`
  result = result.replace(
    /^(\s*[\w.]+:\s*)"(.*)"$/gm,
    (_match, prefix: string, content: string) => {
      // Check if the content itself contains unescaped double quotes
      // (i.e., the outer quotes are the YAML delimiters, inner ones are problematic)
      if (content.includes('"')) {
        const safeContent = content.replace(/"/g, '「').replace(/"/g, '」');
        return `${prefix}"${safeContent}"`;
      }
      return `${prefix}"${content}"`;
    }
  );

  return result;
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
 * Apply metadata (slot_quotes, source_map) to a tree node recursively.
 */
function applyMetadata(
  node: TreeNode,
  slotQuotes: Record<string, string>,
  sourceMap: Record<string, string>,
  prefix: string
): void {
  // Apply source for this node
  if (node.key in sourceMap) {
    node.source = sourceMap[node.key];
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
  for (const child of node.children ?? []) {
    const childPrefix = prefix ? `${prefix}.${child.key}` : child.key;
    applyMetadata(child, slotQuotes, sourceMap, childPrefix);
  }
}

/**
 * Convert a TreeNode into define + populate YOps recursively.
 * Each node becomes a `define` (create empty node) + optional `populate` (fill slots).
 */
function treeToOps(
  tree: TreeNode,
  parentPath: string,
  slotQuotes: Record<string, string>,
  sourceMap: Record<string, string>,
): YOp[] {
  const yops: YOp[] = [];
  const nodePath = parentPath ? `${parentPath}/${tree.key}` : tree.key;

  // Define the node
  yops.push({ define: { path: nodePath } });

  // Populate if has slots
  if (Object.keys(tree.slots).length > 0) {
    // Collect quotes for this node's slots
    const nodeQuotes: Record<string, string> = {};
    for (const [quotePath, quoteValue] of Object.entries(slotQuotes)) {
      const segments = quotePath.split('.');
      if (segments.length === 1 && segments[0] in tree.slots) {
        nodeQuotes[segments[0]] = quoteValue;
      }
    }

    yops.push({
      populate: {
        path: nodePath,
        values: tree.slots as Record<string, SlotValue>,
      },
    });
  }

  // Recurse children
  for (const child of tree.children) {
    const childQuotes: Record<string, string> = {};
    for (const [quotePath, quoteValue] of Object.entries(slotQuotes)) {
      const prefix = tree.key;
      if (quotePath.startsWith(`${child.key}.`) || quotePath === child.key) {
        childQuotes[quotePath] = quoteValue;
      }
      // Also try with parent prefix stripped
      if (quotePath.startsWith(`${prefix}.${child.key}.`)) {
        const stripped = quotePath.slice(prefix.length + 1);
        childQuotes[stripped] = quoteValue;
      }
    }
    yops.push(...treeToOps(child, nodePath, childQuotes, sourceMap));
  }

  return yops;
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
  for (const child of node.children ?? []) {
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
      }
    } catch {
      // Metadata parsing failure is non-fatal
    }
  }

  // Apply metadata to tree
  applyMetadata(tree, slotQuotes, sourceMap, '');

  // Rebuild slot_quotes from tree (includes any applied metadata)
  const finalSlotQuotes = collectSlotQuotes(tree, '');

  // Build define + populate YOps from tree
  const yops = treeToOps(tree, '', slotQuotes, sourceMap);

  return { ok: true, format: 'tree', yops, tree, slotQuotes: finalSlotQuotes };
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

  // Validate each operation — try autofix before rejecting
  const validated: YOp[] = [];
  for (let i = 0; i < obj.yops.length; i++) {
    const result = YOpSchema.safeParse(obj.yops[i]);
    if (result.success) {
      validated.push(result.data as YOp);
      continue;
    }

    // Schema validation failed — try autofix (strip extra fields, fix paths)
    const rawOp = obj.yops[i] as Record<string, unknown>;
    const fixResult = autoFixYOp(rawOp);
    if (fixResult) {
      const recheck = YOpSchema.safeParse(fixResult.fixed);
      if (recheck.success) {
        validated.push(recheck.data as YOp);
        continue;
      }
    }

    // Autofix didn't help — skip this op (don't fail the entire parse)
    // The correction round in yaml-strategy will handle rejected ops
    console.warn(`[yopsParser] Skipping invalid yop at index ${i}: ${result.error.message.slice(0, 200)}`);
  }

  return { ok: true, format: 'yops', yops: validated };
}

// ── Main export ──

export function parseYOpsOutput(raw: string): YOpsParseResult {
  const cleaned = sanitizeYamlQuotes(stripFences(raw));

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

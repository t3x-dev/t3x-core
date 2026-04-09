/**
 * Auto-Fix — Deterministic corrections for common YOp issues.
 *
 * Two types of fixes:
 *
 * 1. Schema fixes (no tree context needed):
 *    - Strip extra fields from ops that don't accept them
 *    - Replace path separator . with /
 *    - Convert keys to snake_case
 *
 * 2. Path resolution (needs tree context):
 *    - Resolve partial paths to full paths
 *    - e.g., "company_info/team_size" → "root_node/company_info/team_size"
 *    - Like Claude Code's backfillObservableInput() for file paths
 *
 * Returns a new YOp (never mutates input) and a description of what was fixed.
 */

import type { TreeNode } from '../../semantic/types';
import type { YOp } from '../../t3x-yops/types';

export interface AutoFixResult {
  fixed: YOp;
  fixes: string[];
}

// ── Path Resolution ──

/**
 * Collect all node paths in a tree.
 * e.g., [{path: "root", node}, {path: "root/child", node}, ...]
 */
function collectPaths(trees: TreeNode[]): Array<{ path: string; node: TreeNode }> {
  const result: Array<{ path: string; node: TreeNode }> = [];
  function walk(node: TreeNode, prefix: string) {
    const fullPath = prefix ? `${prefix}/${node.key}` : node.key;
    result.push({ path: fullPath, node });
    for (const child of node.children ?? []) walk(child, fullPath);
  }
  for (const tree of trees) walk(tree, '');
  return result;
}

/**
 * Try to resolve a partial path to a full path in the tree.
 *
 * Strategy:
 *   1. Exact match → return as-is
 *   2. Suffix match → if "a/b" matches the end of "root/a/b", resolve
 *   3. Single-segment match → if "budget" exists under any parent, resolve
 *
 * Returns null if ambiguous (multiple matches) or no match found.
 */
function resolvePath(partialPath: string, allPaths: Array<{ path: string }>): string | null {
  // 1. Exact match
  if (allPaths.some(p => p.path === partialPath)) return partialPath;

  // 2. Suffix match: find paths that end with /partialPath
  const suffixMatches = allPaths.filter(p => p.path.endsWith(`/${partialPath}`));
  if (suffixMatches.length === 1) return suffixMatches[0].path;

  // 3. For slot paths like "company_info/team_size", try resolving parent
  const lastSlash = partialPath.lastIndexOf('/');
  if (lastSlash > 0) {
    const parentPartial = partialPath.slice(0, lastSlash);
    const slotKey = partialPath.slice(lastSlash + 1);
    const parentMatches = allPaths.filter(p => p.path.endsWith(`/${parentPartial}`) || p.path === parentPartial);
    if (parentMatches.length === 1) return `${parentMatches[0].path}/${slotKey}`;
  }

  return null; // ambiguous or not found
}

// ── Schema Fixes ──

const FIELDS_ALLOWED: Record<string, string[]> = {
  set: ['path', 'value'],
  populate: ['path', 'values'],
  define: ['path', 'parent', 'key'],
  unset: ['path'],
  drop: ['path'],
  rename: ['path', 'to'],
  clone: ['from', 'to'],
  move: ['from', 'to'],
  fold: ['path'],
  nest: ['path', 'keys', 'under'],
  split: ['path', 'into'],
  merge: ['path', 'keys', 'into'],
};

const OP_TYPES = ['set', 'unset', 'define', 'populate', 'drop', 'rename', 'clone', 'move', 'nest', 'split', 'fold', 'merge', 'relate', 'unrelate'];

function detectOpType(rawOp: Record<string, unknown>): string | null {
  return Object.keys(rawOp).find(k => OP_TYPES.includes(k)) ?? null;
}

function fixSchema(opType: string, data: Record<string, unknown>, fixes: string[]): void {
  // Rename LLM field aliases before stripping
  if (opType === 'populate' && 'slots' in data && !('values' in data)) {
    data.values = data.slots;
    delete data.slots;
    fixes.push('renamed populate.slots → populate.values');
  }
  if (opType === 'define' && 'parent' in data && 'key' in data && !('path' in data)) {
    // LLM uses { parent, key } but schema expects { path } where path = parent/key or key
    const parent = data.parent as string;
    const key = data.key as string;
    data.path = parent ? `${parent}/${key}` : key;
    delete data.parent;
    delete data.key;
    fixes.push(`converted define {parent:"${parent}", key:"${key}"} → {path:"${data.path}"}`);
  }

  // Strip extra fields
  if (FIELDS_ALLOWED[opType]) {
    const allowed = new Set(FIELDS_ALLOWED[opType]);
    const extra = Object.keys(data).filter(k => !allowed.has(k));
    if (extra.length > 0) {
      for (const key of extra) delete data[key];
      fixes.push(`stripped extra fields [${extra.join(', ')}] from ${opType}`);
    }
  }

  // Replace . with / in paths
  for (const field of ['path', 'to', 'from']) {
    if (field in data && typeof data[field] === 'string' && (data[field] as string).includes('.')) {
      data[field] = (data[field] as string).replace(/\./g, '/');
      fixes.push(`replaced . with / in ${field}`);
    }
  }

  // Convert camelCase to snake_case in path
  if ('path' in data && typeof data.path === 'string') {
    const original = data.path as string;
    const fixed = original.replace(/([a-z])([A-Z])/g, '$1_$2').toLowerCase();
    if (fixed !== original) {
      data.path = fixed;
      fixes.push(`converted path to snake_case: ${original} → ${fixed}`);
    }
  }
}

function fixPaths(opType: string, data: Record<string, unknown>, allPaths: Array<{ path: string }>, fixes: string[]): void {
  // For set/unset: path = node_path/slot_key → only resolve the node_path part
  if ((opType === 'set' || opType === 'unset') && 'path' in data && typeof data.path === 'string') {
    const fullPath = data.path as string;
    const lastSlash = fullPath.lastIndexOf('/');
    if (lastSlash > 0) {
      const nodePart = fullPath.slice(0, lastSlash);
      const slotPart = fullPath.slice(lastSlash + 1);
      const resolved = resolvePath(nodePart, allPaths);
      if (resolved && resolved !== nodePart) {
        data.path = `${resolved}/${slotPart}`;
        fixes.push(`resolved path: "${fullPath}" → "${resolved}/${slotPart}"`);
      }
    }
  } else if (opType === 'define') {
    // define has path field — resolve as full node path
    if ('path' in data && typeof data.path === 'string') {
      const partial = data.path as string;
      if (partial !== '') {
        const resolved = resolvePath(partial, allPaths);
        if (resolved && resolved !== partial) {
          data.path = resolved;
          fixes.push(`resolved path: "${partial}" → "${resolved}"`);
        }
      }
    }
  } else if (opType === 'populate') {
    // populate has path field — resolve as full node path (no slot suffix)
    if ('path' in data && typeof data.path === 'string') {
      const partial = data.path as string;
      const resolved = resolvePath(partial, allPaths);
      if (resolved && resolved !== partial) {
        data.path = resolved;
        fixes.push(`resolved path: "${partial}" → "${resolved}"`);
      }
    }
  } else {
    // For other ops: resolve full path
    for (const field of ['path', 'to', 'parent']) {
      if (field in data && typeof data[field] === 'string') {
        const partial = data[field] as string;
        if (partial === '') continue;
        const resolved = resolvePath(partial, allPaths);
        if (resolved && resolved !== partial) {
          data[field] = resolved;
          fixes.push(`resolved ${field}: "${partial}" → "${resolved}"`);
        }
      }
    }
  }

  // For relate/unrelate, resolve from/to
  if (opType === 'relate' || opType === 'unrelate') {
    for (const field of ['from', 'to']) {
      if (field in data && typeof data[field] === 'string') {
        const partial = data[field] as string;
        const resolved = resolvePath(partial, allPaths.map(p => ({ path: p.path.split('/')[0] })));
        if (resolved && resolved !== partial) {
          data[field] = resolved;
          fixes.push(`resolved ${field}: "${partial}" → "${resolved}"`);
        }
      }
    }
  }
}

// ── Public API ──

/**
 * Auto-fix a YOp that failed schema validation.
 * Does not need tree context — only schema-level fixes.
 */
export function autoFixYOp(rawOp: Record<string, unknown>): AutoFixResult | null {
  const opType = detectOpType(rawOp);
  if (!opType) return null;

  const opData = rawOp[opType];
  if (typeof opData !== 'object' || opData === null) return null;

  const data = { ...(opData as Record<string, unknown>) };
  const fixes: string[] = [];

  fixSchema(opType, data, fixes);

  if (fixes.length === 0) return null;
  return { fixed: { [opType]: data } as unknown as YOp, fixes };
}

/**
 * Auto-fix a validated YOp that has path issues (node not found).
 * Needs tree context to resolve partial paths.
 *
 * This is the equivalent of Claude Code's backfillObservableInput():
 * resolve relative/partial paths to full paths deterministically.
 */
export function autoFixPaths(yop: YOp, trees: TreeNode[]): AutoFixResult | null {
  const opType = detectOpType(yop as unknown as Record<string, unknown>);
  if (!opType) return null;

  const opData = (yop as Record<string, unknown>)[opType];
  if (typeof opData !== 'object' || opData === null) return null;

  const data = { ...(opData as Record<string, unknown>) };
  const fixes: string[] = [];
  const allPaths = collectPaths(trees);

  fixPaths(opType, data, allPaths, fixes);

  if (fixes.length === 0) return null;
  return { fixed: { [opType]: data } as unknown as YOp, fixes };
}

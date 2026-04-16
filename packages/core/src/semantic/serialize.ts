import type { SemanticContent, TreeNode } from './types';

/**
 * Serialize SemanticContent as YAML-like text for LLM prompt injection.
 */
export function serializeForPrompt(content: SemanticContent): string {
  return content.trees.map((tree) => serializeTree(tree)).join('\n\n');
}

/**
 * Convert SemanticContent into a plain nested mapping suitable for schema
 * validation. Each TreeNode becomes `{ key: { ...slots, childKey: {...} } }`.
 */
export function semanticToPlain(content: { trees: TreeNode[] }): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const tree of content.trees) {
    const [key, val] = treeNodeToPlain(tree);
    out[key] = val;
  }
  return out;
}

function treeNodeToPlain(node: TreeNode): [string, Record<string, unknown>] {
  const value: Record<string, unknown> = { ...(node.slots ?? {}) };
  for (const child of node.children ?? []) {
    const [childKey, childVal] = treeNodeToPlain(child);
    value[childKey] = childVal;
  }
  return [node.key, value];
}

function serializeTree(node: TreeNode, indent = 0): string {
  const pad = '  '.repeat(indent);
  const lines: string[] = [];
  lines.push(`${pad}${node.key}:`);
  for (const [key, value] of Object.entries(node.slots)) {
    if (Array.isArray(value)) {
      lines.push(`${pad}  ${key}:`);
      for (const item of value) {
        lines.push(
          `${pad}    - ${typeof item === 'object' ? serializePlainObject(item) : String(item)}`
        );
      }
    } else {
      lines.push(
        `${pad}  ${key}: ${typeof value === 'object' ? serializePlainObject(value) : String(value)}`
      );
    }
  }
  for (const child of node.children ?? []) {
    lines.push(serializeTree(child, indent + 1));
  }
  return lines.join('\n');
}

function serializePlainObject(obj: unknown): string {
  if (obj === null || obj === undefined) return '';
  if (typeof obj !== 'object') return String(obj);
  const entries = Object.entries(obj as Record<string, unknown>);
  return entries.map(([k, v]) => `${k}: ${String(v)}`).join(', ');
}

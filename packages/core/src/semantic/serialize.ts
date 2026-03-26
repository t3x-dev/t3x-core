import type { SemanticContent, TreeNode } from './types';

/**
 * Serialize SemanticContent as YAML-like text for LLM prompt injection.
 */
export function serializeForPrompt(content: SemanticContent): string {
  return content.trees.map((tree) => serializeTree(tree)).join('\n\n');
}

/** @deprecated Use serializeForPrompt */
export const serializeFramesForPrompt = serializeForPrompt;

function serializeTree(node: TreeNode, indent = 0): string {
  const pad = '  '.repeat(indent);
  const lines: string[] = [];
  lines.push(`${pad}${node.key}:`);
  for (const [key, value] of Object.entries(node.slots)) {
    if (Array.isArray(value)) {
      lines.push(`${pad}  ${key}:`);
      for (const item of value) {
        lines.push(`${pad}    - ${typeof item === 'object' ? JSON.stringify(item) : String(item)}`);
      }
    } else {
      lines.push(`${pad}  ${key}: ${typeof value === 'object' ? JSON.stringify(value) : String(value)}`);
    }
  }
  for (const child of node.children) {
    lines.push(serializeTree(child, indent + 1));
  }
  return lines.join('\n');
}

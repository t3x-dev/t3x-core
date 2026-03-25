import { isTreeNative } from './tree';
import type { SemanticContent, TreeNode } from './types';

/**
 * Serialize SemanticContent as YAML-like text for LLM prompt injection.
 */
export function serializeFramesForPrompt(content: SemanticContent): string {
  if (isTreeNative(content) && content.tree) {
    return serializeTreeForPrompt(content.tree);
  }
  // Legacy flat-frame serialization
  const lines: string[] = [];
  for (const frame of content.frames) {
    lines.push(`${frame.type}:`);
    for (const [key, value] of Object.entries(frame.slots)) {
      if (Array.isArray(value)) {
        lines.push(`  ${key}:`);
        for (const item of value) {
          lines.push(`    - ${typeof item === 'object' ? JSON.stringify(item) : String(item)}`);
        }
      } else {
        lines.push(`  ${key}: ${typeof value === 'object' ? JSON.stringify(value) : String(value)}`);
      }
    }
  }
  if (content.relations.length > 0) {
    lines.push('relations:');
    for (const rel of content.relations) {
      const from = content.frames.find((f) => f.id === rel.from);
      const to = content.frames.find((f) => f.id === rel.to);
      lines.push(`  - ${from?.type ?? rel.from} -> ${to?.type ?? rel.to} (${rel.type})`);
    }
  }
  return lines.join('\n');
}

function serializeTreeForPrompt(node: TreeNode, indent = 0): string {
  const pad = '  '.repeat(indent);
  const lines: string[] = [];
  lines.push(`${pad}${node.key}:`);
  for (const [key, value] of Object.entries(node.slots)) {
    lines.push(`${pad}  ${key}: ${JSON.stringify(value)}`);
  }
  for (const child of node.children) {
    lines.push(serializeTreeForPrompt(child, indent + 1));
  }
  return lines.join('\n');
}

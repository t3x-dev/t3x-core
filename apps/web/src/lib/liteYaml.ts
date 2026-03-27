import type {
  Delta,
  TreeChange,
  Relation,
  SemanticContent,
  SlotValue,
  TreeNode,
} from '@t3x-dev/core';

/** Build a display-name map handling duplicate keys with _2, _3 suffixes */
function buildKeyNameMap(nodes: TreeNode[]): Map<string, string> {
  const counts = new Map<string, number>();
  const nameMap = new Map<string, string>();

  for (const node of nodes) {
    const count = (counts.get(node.key) ?? 0) + 1;
    counts.set(node.key, count);
    const displayName = count === 1 ? node.key : `${node.key}_${count}`;
    nameMap.set(node.key, displayName);
  }
  return nameMap;
}

/** Render a SlotValue as YAML lines with proper indentation */
function renderSlotValue(value: SlotValue, indent: number, lines: string[]): void {
  const pad = '  '.repeat(indent);

  if (typeof value === 'string') {
    lines.push(`"${value}"`);
    return;
  }

  if (typeof value === 'number' || typeof value === 'boolean') {
    lines.push(String(value));
    return;
  }

  // Array
  if (Array.isArray(value)) {
    const arr = value as SlotValue[];
    // Check if simple array (all primitives)
    const allSimple = arr.every((item) => typeof item === 'string' || typeof item === 'number');

    if (allSimple && arr.length <= 5) {
      // Inline array for short simple lists
      lines.push(
        `[${arr.map((item) => (typeof item === 'string' ? `"${item}"` : String(item))).join(', ')}]`
      );
      return;
    }

    // Multi-line array
    lines.push('');
    for (const item of arr) {
      if (typeof item === 'string') {
        lines.push(`${pad}  - "${item}"`);
      } else if (typeof item === 'number') {
        lines.push(`${pad}  - ${item}`);
      } else {
        lines.push(`${pad}  - ${JSON.stringify(item)}`);
      }
    }
    return;
  }

  // Object
  if (value !== null && typeof value === 'object') {
    lines.push('');
    for (const [k, v] of Object.entries(value as Record<string, SlotValue>)) {
      const valueLine: string[] = [];
      renderSlotValue(v, indent + 1, valueLine);
      if (valueLine.length === 1 && !valueLine[0].startsWith('\n')) {
        lines.push(`${pad}  ${k}: ${valueLine[0]}`);
      } else {
        lines.push(`${pad}  ${k}:${valueLine.join('')}`);
      }
    }
    return;
  }

  // Fallback: unknown object
  lines.push(JSON.stringify(value));
}

/** Render a TreeNode and its children as YAML */
function renderNode(node: TreeNode, indent: number, lines: string[]): void {
  const pad = '  '.repeat(indent);
  lines.push(`${pad}${node.key}:`);

  for (const [key, value] of Object.entries(node.slots)) {
    const valueLine: string[] = [];
    renderSlotValue(value, indent + 1, valueLine);
    if (valueLine.length === 1 && !valueLine[0].startsWith('\n')) {
      lines.push(`${pad}  ${key}: ${valueLine[0]}`);
    } else {
      lines.push(`${pad}  ${key}:${valueLine.join('')}`);
    }
  }

  for (const child of node.children) {
    renderNode(child, indent + 1, lines);
  }
}

/** Convert SemanticContent to properly nested YAML for display */
export function toDisplayYAML(content: SemanticContent): string {
  const lines: string[] = [];

  for (const tree of content.trees) {
    renderNode(tree, 0, lines);
    lines.push('');
  }

  if (content.relations.length > 0) {
    lines.push('relations:');
    for (const rel of content.relations) {
      lines.push(`  - ${rel.from} → ${rel.to} (${rel.type})`);
    }
  }

  return lines.join('\n');
}

/** Parse lite YAML back and diff against current content to produce a Delta */
export function parseDisplayYAML(yaml: string, currentContent: SemanticContent): Delta {
  const changes: TreeChange[] = [];
  const newRelations: Relation[] = [];
  const removeRelations: Relation[] = [];

  // Build key set from current trees
  const currentKeys = new Set(currentContent.trees.map((t) => t.key));

  // Parse YAML into top-level nodes
  const parsedNodes = new Map<string, Record<string, unknown>>();
  let currentKey: string | null = null;

  for (const line of yaml.split('\n')) {
    const trimmed = line.trimEnd();
    if (trimmed === '' || trimmed === 'relations:') {
      if (trimmed === 'relations:') break;
      currentKey = null;
      continue;
    }

    const topLevel = trimmed.match(/^(\w+):$/);
    if (topLevel) {
      currentKey = topLevel[1];
      parsedNodes.set(currentKey, {});
      continue;
    }

    if (currentKey) {
      const slotMatch = trimmed.match(/^\s+(\w+):\s*(.+)$/);
      if (slotMatch) {
        const node = parsedNodes.get(currentKey);
        if (!node) continue;
        let value: unknown = slotMatch[2];
        // Strip quotes
        if (typeof value === 'string' && value.startsWith('"') && value.endsWith('"')) {
          value = value.slice(1, -1);
        } else {
          // Try parse arrays/numbers
          try {
            value = JSON.parse(slotMatch[2]);
          } catch {
            // keep as string
          }
        }
        node[slotMatch[1]] = value as SlotValue;
      }
    }
  }

  // Diff: find removed nodes (in current but not in parsed)
  const parsedNames = new Set(parsedNodes.keys());

  for (const key of currentKeys) {
    if (!parsedNames.has(key)) {
      changes.push({ action: 'remove', target_path: key });
    }
  }

  // Diff: find added nodes (in parsed but not in current)
  for (const [name, slots] of parsedNodes) {
    if (!currentKeys.has(name)) {
      changes.push({
        action: 'add',
        parent_path: '',
        node: {
          key: name.replace(/_\d+$/, ''), // Strip suffix
          slots: slots as Record<string, SlotValue>,
          children: [],
          confidence: 1,
        },
      });
    }
  }

  // Diff: find updated nodes
  for (const [name, newSlots] of parsedNodes) {
    if (currentKeys.has(name)) {
      const existingNode = currentContent.trees.find((t) => t.key === name);
      if (existingNode) {
        const slotsDiffer = JSON.stringify(existingNode.slots) !== JSON.stringify(newSlots);
        if (slotsDiffer) {
          changes.push({
            action: 'update',
            target_path: name,
            slots: newSlots as Record<string, SlotValue | null>,
          });
        }
      }
    }
  }

  return { changes, new_relations: newRelations, remove_relations: removeRelations };
}

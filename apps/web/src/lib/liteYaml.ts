import type {
  Delta,
  Frame,
  FrameChange,
  Relation,
  SemanticContent,
  SlotValue,
} from '@t3x-dev/core';

/** Build a display-name map handling duplicate types with _2, _3 suffixes */
function buildTypeNameMap(frames: Frame[]): Map<string, string> {
  const counts = new Map<string, number>();
  const nameMap = new Map<string, string>();

  for (const frame of frames) {
    const count = (counts.get(frame.type) ?? 0) + 1;
    counts.set(frame.type, count);
    const displayName = count === 1 ? frame.type : `${frame.type}_${count}`;
    nameMap.set(frame.id, displayName);
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

  if (typeof value === 'number') {
    lines.push(String(value));
    return;
  }

  // SlotRef: { ref: "f_002" }
  if (value !== null && typeof value === 'object' && !Array.isArray(value) && 'ref' in value) {
    lines.push(`*${(value as { ref: string }).ref}`);
    return;
  }

  // InlineFrame: { type: "...", slots: { ... } }
  if (value !== null && typeof value === 'object' && !Array.isArray(value) && 'type' in value && 'slots' in value) {
    const inlineFrame = value as { type: string; slots: Record<string, SlotValue> };
    // Render as nested YAML — key already written by caller, just add newline
    lines.push('');
    for (const [k, v] of Object.entries(inlineFrame.slots)) {
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

  // Array
  if (Array.isArray(value)) {
    const arr = value as SlotValue[];
    // Check if simple array (all primitives)
    const allSimple = arr.every((item) => typeof item === 'string' || typeof item === 'number');

    if (allSimple && arr.length <= 5) {
      // Inline array for short simple lists
      lines.push(`[${arr.map((item) => typeof item === 'string' ? `"${item}"` : String(item)).join(', ')}]`);
      return;
    }

    // Multi-line array
    lines.push('');
    for (const item of arr) {
      if (typeof item === 'string') {
        lines.push(`${pad}  - "${item}"`);
      } else if (typeof item === 'number') {
        lines.push(`${pad}  - ${item}`);
      } else if (typeof item === 'object' && item !== null && 'type' in item && 'slots' in item) {
        // Array of InlineFrames
        const inlineFrame = item as { type: string; slots: Record<string, SlotValue> };
        lines.push(`${pad}  - ${inlineFrame.type}:`);
        for (const [k, v] of Object.entries(inlineFrame.slots)) {
          const valueLine: string[] = [];
          renderSlotValue(v, indent + 2, valueLine);
          if (valueLine.length === 1 && !valueLine[0].startsWith('\n')) {
            lines.push(`${pad}      ${k}: ${valueLine[0]}`);
          } else {
            lines.push(`${pad}      ${k}:${valueLine.join('')}`);
          }
        }
      } else {
        lines.push(`${pad}  - ${JSON.stringify(item)}`);
      }
    }
    return;
  }

  // Fallback: unknown object
  lines.push(JSON.stringify(value));
}

/** Convert SemanticContent to properly nested YAML for display */
export function toDisplayYAML(content: SemanticContent): string {
  const nameMap = buildTypeNameMap(content.frames);
  const lines: string[] = [];

  for (const frame of content.frames) {
    const displayName = nameMap.get(frame.id) ?? frame.type;
    lines.push(`${displayName}:`);
    for (const [key, value] of Object.entries(frame.slots)) {
      const valueLine: string[] = [];
      renderSlotValue(value, 1, valueLine);
      if (valueLine.length === 1 && !valueLine[0].startsWith('\n')) {
        lines.push(`  ${key}: ${valueLine[0]}`);
      } else {
        lines.push(`  ${key}:${valueLine.join('')}`);
      }
    }
    lines.push('');
  }

  if (content.relations.length > 0) {
    lines.push('relations:');
    for (const rel of content.relations) {
      const fromName = nameMap.get(rel.from) ?? rel.from;
      const toName = nameMap.get(rel.to) ?? rel.to;
      lines.push(`  - ${fromName} → ${toName} (${rel.type})`);
    }
  }

  return lines.join('\n');
}

/** Parse lite YAML back and diff against current content to produce a Delta */
export function parseDisplayYAML(yaml: string, currentContent: SemanticContent): Delta {
  const changes: FrameChange[] = [];
  const newRelations: Relation[] = [];
  const removeRelations: Relation[] = [];

  // Build reverse map: displayName → frame id
  const nameMap = buildTypeNameMap(currentContent.frames);
  const reverseMap = new Map<string, string>();
  for (const [id, name] of nameMap) {
    reverseMap.set(name, id);
  }

  // Parse YAML into frames
  const parsedFrames = new Map<string, Record<string, unknown>>();
  let currentType: string | null = null;

  for (const line of yaml.split('\n')) {
    const trimmed = line.trimEnd();
    if (trimmed === '' || trimmed === 'relations:') {
      if (trimmed === 'relations:') break;
      currentType = null;
      continue;
    }

    const topLevel = trimmed.match(/^(\w+):$/);
    if (topLevel) {
      currentType = topLevel[1];
      parsedFrames.set(currentType, {});
      continue;
    }

    if (currentType) {
      const slotMatch = trimmed.match(/^\s+(\w+):\s*(.+)$/);
      if (slotMatch) {
        const frame = parsedFrames.get(currentType);
        if (!frame) continue;
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
        frame[slotMatch[1]] = value as SlotValue;
      }
    }
  }

  // Diff: find removed frames (in current but not in parsed)
  const parsedNames = new Set(parsedFrames.keys());

  for (const [id, name] of nameMap) {
    if (!parsedNames.has(name)) {
      changes.push({ action: 'remove', target: id });
    }
  }

  // Diff: find added frames (in parsed but not in current)
  for (const [name, slots] of parsedFrames) {
    if (!reverseMap.has(name)) {
      const newId = `f_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
      changes.push({
        action: 'add',
        frame: {
          id: newId,
          type: name.replace(/_\d+$/, ''), // Strip suffix
          slots: slots as Record<string, SlotValue>,
          source: '',
          confidence: 1,
        },
      });
    }
  }

  // Diff: find updated frames
  for (const [name, newSlots] of parsedFrames) {
    const existingId = reverseMap.get(name);
    if (existingId) {
      const existingFrame = currentContent.frames.find((f) => f.id === existingId);
      if (existingFrame) {
        const slotsDiffer = JSON.stringify(existingFrame.slots) !== JSON.stringify(newSlots);
        if (slotsDiffer) {
          changes.push({
            action: 'update',
            target: existingId,
            slots: newSlots as Record<string, SlotValue>,
          });
        }
      }
    }
  }

  return { changes, new_relations: newRelations, remove_relations: removeRelations };
}

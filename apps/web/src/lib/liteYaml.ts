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

/** Convert SemanticContent to lite YAML for display */
export function toDisplayYAML(content: SemanticContent): string {
  const nameMap = buildTypeNameMap(content.frames);
  const lines: string[] = [];

  for (const frame of content.frames) {
    const displayName = nameMap.get(frame.id) ?? frame.type;
    lines.push(`${displayName}:`);
    for (const [key, value] of Object.entries(frame.slots)) {
      if (Array.isArray(value)) {
        lines.push(`  ${key}: ${JSON.stringify(value)}`);
      } else if (typeof value === 'number') {
        lines.push(`  ${key}: ${value}`);
      } else {
        lines.push(`  ${key}: "${String(value)}"`);
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

import type {
  SemanticContent,
  SlotValue,
  ValidationError,
  ValidationResult,
  ValidationWarning,
} from './types';

export function validateIntegrity(content: SemanticContent): ValidationResult {
  const errors: ValidationError[] = [];
  const warnings: ValidationWarning[] = [];
  const frameIds = new Set(content.frames.map((f) => f.id));

  // 1. Duplicate IDs
  const idCounts = new Map<string, number>();
  for (const frame of content.frames) {
    idCounts.set(frame.id, (idCounts.get(frame.id) ?? 0) + 1);
  }
  for (const [id, count] of idCounts) {
    if (count > 1) {
      errors.push({ type: 'duplicate_id', message: `Frame ID "${id}" appears ${count} times`, location: id });
    }
  }

  // 2. Broken refs in slots
  for (const frame of content.frames) {
    for (const [key, value] of Object.entries(frame.slots)) {
      checkSlotRefs(value, `${frame.id}.${key}`, frameIds, errors);
    }
  }

  // 3. Relation endpoint checks
  for (const rel of content.relations) {
    if (!frameIds.has(rel.from)) {
      errors.push({ type: 'broken_relation', message: `Relation from "${rel.from}" — no such frame`, location: `${rel.from}->${rel.to}` });
    }
    if (!frameIds.has(rel.to)) {
      errors.push({ type: 'broken_relation', message: `Relation to "${rel.to}" — no such frame`, location: `${rel.from}->${rel.to}` });
    }
    if (rel.from === rel.to) {
      errors.push({ type: 'self_relation', message: `Self-referencing relation on "${rel.from}"`, location: `${rel.from}->${rel.to}` });
    }
  }

  // 4. Cycle detection (causes + follows)
  const causalEdges = content.relations.filter((r) => r.type === 'causes' || r.type === 'follows');
  const graph = new Map<string, string[]>();
  for (const edge of causalEdges) {
    if (!graph.has(edge.from)) graph.set(edge.from, []);
    graph.get(edge.from)!.push(edge.to);
  }
  const visited = new Set<string>();
  const inStack = new Set<string>();
  for (const node of graph.keys()) {
    if (!visited.has(node) && hasCycle(node, graph, visited, inStack)) {
      errors.push({ type: 'cycle', message: `Causal/temporal cycle detected involving "${node}"`, location: node });
    }
  }

  // 5. Orphan frames (no relations, only warn if >1 frame)
  if (content.frames.length > 1) {
    const connected = new Set<string>();
    for (const rel of content.relations) {
      connected.add(rel.from);
      connected.add(rel.to);
    }
    for (const frame of content.frames) {
      if (!connected.has(frame.id)) {
        warnings.push({ type: 'orphan_frame', message: `Frame "${frame.id}" has no relations`, location: frame.id });
      }
    }
  }

  // 6. Low confidence
  for (const frame of content.frames) {
    if (frame.confidence !== undefined && frame.confidence < 0.5) {
      warnings.push({ type: 'low_confidence', message: `Frame "${frame.id}" confidence: ${frame.confidence}`, location: frame.id });
    }
  }

  return { valid: errors.length === 0, errors, warnings };
}

function checkSlotRefs(
  value: SlotValue,
  path: string,
  frameIds: Set<string>,
  errors: ValidationError[]
): void {
  if (value === null || value === undefined) return;
  if (typeof value === 'string' || typeof value === 'number') return;
  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i++) {
      checkSlotRefs(value[i], `${path}[${i}]`, frameIds, errors);
    }
    return;
  }
  if (typeof value === 'object') {
    if ('ref' in value && typeof (value as { ref: unknown }).ref === 'string') {
      const ref = (value as { ref: string }).ref;
      if (!frameIds.has(ref)) {
        errors.push({ type: 'broken_ref', message: `"${path}" references "${ref}" — no such frame`, location: path });
      }
    }
    if ('slots' in value && typeof (value as { slots: unknown }).slots === 'object') {
      const slots = (value as { slots: Record<string, SlotValue> }).slots;
      for (const [key, val] of Object.entries(slots)) {
        checkSlotRefs(val, `${path}.${key}`, frameIds, errors);
      }
    }
  }
}

function hasCycle(
  node: string,
  graph: Map<string, string[]>,
  visited: Set<string>,
  inStack: Set<string>
): boolean {
  visited.add(node);
  inStack.add(node);
  for (const neighbor of graph.get(node) ?? []) {
    if (inStack.has(neighbor)) return true;
    if (!visited.has(neighbor) && hasCycle(neighbor, graph, visited, inStack)) return true;
  }
  inStack.delete(node);
  return false;
}

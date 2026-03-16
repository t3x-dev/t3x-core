/**
 * Deterministic normalizer for LLM frame extraction output.
 * Coerces loose JSON into strict Frame format before schema validation.
 * No LLM calls — purely deterministic string/object transformations.
 */

/** Convert CamelCase or PascalCase to snake_case */
function toSnakeCase(str: string): string {
  return str
    .replace(/([A-Z])/g, '_$1')
    .toLowerCase()
    .replace(/^_/, '')
    .replace(/_+/g, '_');
}

/** Normalize frame ID to f_NNN format (at least 3 digits) */
function normalizeFrameId(id: string): string {
  const num = id.replace(/^f_/, '');
  const n = parseInt(num, 10);
  if (isNaN(n)) return id;
  return `f_${String(n).padStart(3, '0')}`;
}

/** Strip non-schema fields from a frame object */
function stripFrameExtras(frame: Record<string, unknown>): Record<string, unknown> {
  const { id, type, slots, source, confidence } = frame;
  const result: Record<string, unknown> = { id, type, slots };
  if (source !== undefined) result.source = source;
  if (confidence !== undefined) result.confidence = confidence;
  return result;
}

/**
 * Coerce plain objects in arrays to InlineFrame format.
 * { name: "Tokyo" } becomes { type: "item", slots: { name: "Tokyo" } }
 */
function coerceSlotValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(coerceSlotValue);
  }
  if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
    const obj = value as Record<string, unknown>;
    // Already InlineFrame format
    if (typeof obj.type === 'string' && obj.slots && typeof obj.slots === 'object') {
      return { type: obj.type, slots: normalizeSlots(obj.slots as Record<string, unknown>) };
    }
    // SlotRef format
    if (typeof obj.ref === 'string') return obj;
    // Plain object — wrap as InlineFrame
    return { type: 'item', slots: normalizeSlots(obj) };
  }
  return value;
}

function normalizeSlots(slots: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(slots)) {
    result[key] = coerceSlotValue(val);
  }
  return result;
}

function normalizeFrame(frame: Record<string, unknown>): Record<string, unknown> {
  const cleaned = stripFrameExtras(frame);
  if (typeof cleaned.id === 'string') cleaned.id = normalizeFrameId(cleaned.id);
  if (typeof cleaned.type === 'string') {
    let t = cleaned.type as string;
    if (/[A-Z]/.test(t)) t = toSnakeCase(t);
    cleaned.type = t.toLowerCase();
  }
  if (cleaned.slots && typeof cleaned.slots === 'object') {
    cleaned.slots = normalizeSlots(cleaned.slots as Record<string, unknown>);
  }
  return cleaned;
}

/**
 * Normalize raw LLM output for frame extraction.
 * Handles both full output ({ frames, relations }) and delta ({ changes }).
 */
export function normalizeFrameOutput(input: Record<string, unknown>): Record<string, unknown> {
  const result = { ...input };

  if (Array.isArray(result.frames)) {
    result.frames = (result.frames as Record<string, unknown>[]).map(normalizeFrame);
  }

  if (Array.isArray(result.changes)) {
    result.changes = (result.changes as Record<string, unknown>[]).map((change) => {
      const c = { ...change };
      if (c.frame && typeof c.frame === 'object') {
        c.frame = normalizeFrame(c.frame as Record<string, unknown>);
      }
      if (typeof c.target === 'string') {
        c.target = normalizeFrameId(c.target as string);
      }
      return c;
    });
  }

  return result;
}

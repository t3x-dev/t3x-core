type EditableOp = Record<string, unknown>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function sourcePart(op: EditableOp): EditableOp {
  return 'source' in op ? { source: op.source } : {};
}

function opKind(op: EditableOp): string | null {
  for (const key of Object.keys(op)) {
    if (key !== 'source') return key;
  }
  return null;
}

function cleanRecord(value: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(value).filter(([, entryValue]) => entryValue !== undefined)
  );
}

function normalizeSetOp(op: EditableOp): EditableOp[] {
  const payload = op.set;
  if (!isRecord(payload)) return [op];

  const path = payload.path;
  if (typeof path !== 'string' || path.trim().length === 0) return [op];

  const source = sourcePart(op);
  const extraValues = Object.fromEntries(
    Object.entries(payload).filter(([key]) => key !== 'path' && key !== 'value')
  );

  if ('value' in payload) {
    const setOp = { set: { path, value: payload.value }, ...source };
    const extraOps = Object.entries(extraValues).map(([key, value]) => ({
      set: { path: `${path.replace(/\/[^/]+$/, '')}/${key}`, value },
      ...source,
    }));
    return [setOp, ...extraOps];
  }

  if (Object.keys(extraValues).length > 0) {
    return [{ populate: { path, values: cleanRecord(extraValues) }, ...source }];
  }

  return [{ unset: { path }, ...source }];
}

function normalizePopulateOp(op: EditableOp): EditableOp[] {
  const payload = op.populate;
  if (!isRecord(payload)) return [op];

  const path = payload.path;
  if (typeof path !== 'string' || path.trim().length === 0) return [op];

  const source = sourcePart(op);
  const explicitValues = isRecord(payload.values) ? payload.values : {};
  const inlineValues = Object.fromEntries(
    Object.entries(payload).filter(([key]) => key !== 'path' && key !== 'values')
  );
  const values = cleanRecord({ ...explicitValues, ...inlineValues });

  if (Object.keys(values).length === 0) return [];
  return [{ populate: { path, values }, ...source }];
}

/**
 * Convert common text-editor mutations back into valid YOps.
 *
 * The script editor is a human editing surface, not a schema form. When users
 * add/remove YAML fields by hand they often leave shapes that are obvious to a
 * person but invalid to the strict YOps schema, such as `set.path` without a
 * `value`, or `populate.values:` with no children. Normalize those cases before
 * source reconciliation and server dry-run validation.
 */
export function normalizeEditedScriptOps(ops: readonly EditableOp[]): EditableOp[] {
  return ops.flatMap((op) => {
    if (!isRecord(op)) return [];

    switch (opKind(op)) {
      case 'set':
        return normalizeSetOp(op);
      case 'populate':
        return normalizePopulateOp(op);
      default:
        return [op];
    }
  });
}

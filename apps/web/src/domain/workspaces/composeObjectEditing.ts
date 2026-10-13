import type { TransitionProtocolValue } from '@t3x-dev/api-client';
import { composeValuesEqual } from './composeObjectChanges';
import { type DraftYOp, draftPathSegment, joinDraftPath } from './draftStructure';

export function composeSlotInput(value: TransitionProtocolValue): string {
  return typeof value === 'string' ? value : JSON.stringify(value, null, 2);
}

function parseSlotInput(current: TransitionProtocolValue, raw: string): TransitionProtocolValue {
  if (typeof current === 'string') return raw;
  if (typeof current === 'number') {
    const number = Number(raw);
    if (!raw.trim() || !Number.isFinite(number)) throw new Error('Enter a valid number.');
    return number;
  }
  if (typeof current === 'boolean') {
    if (raw !== 'true' && raw !== 'false') throw new Error('Choose True or False.');
    return raw === 'true';
  }
  let value: TransitionProtocolValue;
  try {
    value = JSON.parse(raw);
  } catch {
    throw new Error('Enter valid JSON.');
  }
  if (Array.isArray(current) && !Array.isArray(value)) throw new Error('Enter a JSON array.');
  if (
    current !== null &&
    !Array.isArray(current) &&
    (value === null || typeof value !== 'object' || Array.isArray(value))
  )
    throw new Error('Enter a JSON object.');
  // JSON can parse an out-of-range numeric literal into Infinity, which is not a Draft value.
  const finite = (item: TransitionProtocolValue): boolean =>
    typeof item === 'number'
      ? Number.isFinite(item)
      : item !== null && typeof item === 'object'
        ? Object.values(item).every(finite)
        : true;
  if (!finite(value)) throw new Error('JSON numbers must be finite.');
  return value;
}

/** Only existing slots are addressable here; object structure never becomes an edit operation. */
export function composeObjectSlotEdits(
  path: string,
  slots: Record<string, TransitionProtocolValue>,
  inputs: Record<string, string>
) {
  const operations: DraftYOp[] = [];
  const changes: {
    key: string;
    before: TransitionProtocolValue;
    after: TransitionProtocolValue;
  }[] = [];
  const errors: Record<string, string> = Object.create(null);
  for (const [key, before] of Object.entries(slots)) {
    try {
      const after = parseSlotInput(
        before,
        Object.hasOwn(inputs, key) ? inputs[key] : composeSlotInput(before)
      );
      if (composeValuesEqual(before, after)) continue;
      operations.push({
        set: {
          path: joinDraftPath(joinDraftPath(path, 'slots'), draftPathSegment(key)),
          value: after,
        },
      });
      changes.push({ key, before, after });
    } catch (cause) {
      errors[key] = cause instanceof Error ? cause.message : 'Could not read this value.';
    }
  }
  return { operations, changes, errors };
}

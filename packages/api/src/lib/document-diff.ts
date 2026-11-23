import type { DiffChange, DiffResult } from '@t3x-dev/api-client';
import type { ProtocolValue } from '@t3x-dev/transition';

function isMapping(value: ProtocolValue): value is Record<string, ProtocolValue> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/** Paths address immutable input documents, including positional array elements. */
export function compareDocuments(base: ProtocolValue, target: ProtocolValue): DiffResult {
  const changes: DiffChange[] = [];
  const stats = { added: 0, removed: 0, modified: 0 };

  function visit(path: string, before?: ProtocolValue, after?: ProtocolValue): void {
    if (before === after) return;
    if (before !== undefined && after !== undefined) {
      if (Array.isArray(before) && Array.isArray(after)) {
        for (let i = 0; i < Math.max(before.length, after.length); i++)
          visit(`${path}/${i}`, before[i], after[i]);
        return;
      }
      if (isMapping(before) && isMapping(after)) {
        const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
        for (const key of [...keys].sort())
          visit(
            `${path}/${key.replaceAll('~', '~0').replaceAll('/', '~1')}`,
            Object.hasOwn(before, key) ? before[key] : undefined,
            Object.hasOwn(after, key) ? after[key] : undefined
          );
        return;
      }
    }
    const type = before === undefined ? 'added' : after === undefined ? 'removed' : 'modified';
    changes.push({
      type,
      path,
      ...(before === undefined ? {} : { old_value: before }),
      ...(after === undefined ? {} : { new_value: after }),
    });
    stats[type]++;
  }

  visit('', base, target);
  return { changes, stats };
}

/**
 * Auto-Fix — Deterministic corrections for common YOp schema issues.
 *
 * Fixes that don't change the LLM's intent:
 *   - Strip extra fields from ops that don't accept them (e.g., source/from on unset)
 *   - Replace path separator . with /
 *   - Convert keys to snake_case
 *
 * Returns a new YOp (never mutates input) and a description of what was fixed.
 * Returns null if the op cannot be auto-fixed.
 */

import type { YOp } from '../../yops/types';

export interface AutoFixResult {
  /** The corrected YOp */
  fixed: YOp;
  /** What was changed */
  fixes: string[];
}

/**
 * Attempt to auto-fix a YOp that failed schema validation.
 * Returns null if the op type is unrecognized or the fix is ambiguous.
 */
export function autoFixYOp(rawOp: Record<string, unknown>): AutoFixResult | null {
  const fixes: string[] = [];

  // Detect op type
  const opType = Object.keys(rawOp).find((k) =>
    ['set', 'unset', 'add', 'drop', 'rename', 'clone', 'move', 'nest', 'split', 'fold', 'merge', 'relate', 'unrelate'].includes(k)
  );
  if (!opType) return null;

  const opData = rawOp[opType];
  if (typeof opData !== 'object' || opData === null) return null;

  const data = { ...(opData as Record<string, unknown>) };

  // Fix 1: Strip extra fields from ops that don't accept them
  const fieldsAllowed: Record<string, string[]> = {
    unset: ['path'],
    drop: ['path', 'reason'],
    rename: ['path', 'to'],
    clone: ['path', 'to'],
    move: ['path', 'to'],
    fold: ['path'],
    nest: ['paths', 'under'],
    split: ['path', 'into'],
    merge: ['paths', 'into'],
  };

  if (fieldsAllowed[opType]) {
    const allowed = new Set(fieldsAllowed[opType]);
    const extra = Object.keys(data).filter((k) => !allowed.has(k));
    if (extra.length > 0) {
      for (const key of extra) {
        delete data[key];
      }
      fixes.push(`stripped extra fields [${extra.join(', ')}] from ${opType}`);
    }
  }

  // Fix 2: Replace path separator . with /
  if ('path' in data && typeof data.path === 'string' && data.path.includes('.')) {
    data.path = (data.path as string).replace(/\./g, '/');
    fixes.push('replaced . with / in path');
  }
  if ('to' in data && typeof data.to === 'string' && data.to.includes('.')) {
    data.to = (data.to as string).replace(/\./g, '/');
    fixes.push('replaced . with / in to');
  }
  if ('parent' in data && typeof data.parent === 'string' && data.parent.includes('.')) {
    data.parent = (data.parent as string).replace(/\./g, '/');
    fixes.push('replaced . with / in parent');
  }

  // Fix 3: Convert path keys to snake_case (only simple cases)
  if ('path' in data && typeof data.path === 'string') {
    const original = data.path as string;
    const fixed = original.replace(/([a-z])([A-Z])/g, '$1_$2').toLowerCase();
    if (fixed !== original) {
      data.path = fixed;
      fixes.push(`converted path to snake_case: ${original} → ${fixed}`);
    }
  }

  if (fixes.length === 0) return null;

  return {
    fixed: { [opType]: data } as unknown as YOp,
    fixes,
  };
}

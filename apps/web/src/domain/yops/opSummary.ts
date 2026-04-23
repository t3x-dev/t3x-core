/**
 * L2 — plain-language summaries for YOps.
 *
 * The YOpsLogPanel shows the ledger as action blocks where the header is
 * a human sentence ("Added 4 details to trip") and the body is the raw
 * YOp + source meta. This module owns the sentence side.
 *
 * Pure. No React, no stores.
 */

import type { YOp } from '@t3x-dev/core';

type AnyOp = Record<string, unknown>;

function getPayload(op: YOp): { verb: string; value: AnyOp } | null {
  for (const [verb, value] of Object.entries(op as AnyOp)) {
    if (verb === 'source') continue;
    if (value && typeof value === 'object') {
      return { verb, value: value as AnyOp };
    }
  }
  return null;
}

function formatValue(v: unknown): string {
  if (v === null) return 'null';
  if (typeof v === 'string') return JSON.stringify(v);
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  if (Array.isArray(v)) return `[${v.length} items]`;
  if (typeof v === 'object') return `{${Object.keys(v as object).length} fields}`;
  return String(v);
}

function leaf(path: string): string {
  const slash = path.lastIndexOf('/');
  return slash === -1 ? path : path.slice(slash + 1);
}

function parent(path: string): string | null {
  const slash = path.lastIndexOf('/');
  return slash === -1 ? null : path.slice(0, slash);
}

/**
 * Turn a YOp into a short plain-language sentence.
 *
 * Covers the common verbs explicitly and falls back to a generic
 * `{verb} {path}` for the long tail so the panel never shows an empty row.
 */
export function summarizeOp(op: YOp): string {
  const payload = getPayload(op);
  if (!payload) return 'unknown operation';

  const { verb, value } = payload;
  const path = typeof value.path === 'string' ? value.path : undefined;

  switch (verb) {
    case 'define':
      return path ? `Created ${path}` : 'Created node';

    case 'drop':
      return path ? `Removed ${path}` : 'Removed node';

    case 'rename': {
      const to = typeof value.to === 'string' ? value.to : undefined;
      return path && to ? `Renamed ${path} → ${to}` : 'Renamed';
    }

    case 'set': {
      if (!path) return 'Set value';
      const slotName = leaf(path);
      const parentName = parent(path);
      const val = formatValue(value.value);
      return parentName ? `Set ${parentName}.${slotName} to ${val}` : `Set ${slotName} to ${val}`;
    }

    case 'unset':
      if (!path) return 'Removed slot';
      return `Removed ${path}`;

    case 'populate': {
      const slots = value.values;
      const keys =
        slots && typeof slots === 'object' && !Array.isArray(slots)
          ? Object.keys(slots as Record<string, unknown>)
          : [];
      if (!path) return `Populated ${keys.length} slot${keys.length === 1 ? '' : 's'}`;
      if (keys.length === 0) return `Populated ${path}`;
      if (keys.length <= 3) return `Added ${keys.join(', ')} to ${path}`;
      return `Added ${keys.length} details to ${path}`;
    }

    case 'append':
      return path ? `Appended to ${path}` : 'Appended value';

    case 'move': {
      const from = typeof value.from === 'string' ? value.from : undefined;
      const to = typeof value.to === 'string' ? value.to : undefined;
      return from && to ? `Moved ${from} → ${to}` : 'Moved node';
    }

    case 'clone': {
      const from = typeof value.from === 'string' ? value.from : undefined;
      const to = typeof value.to === 'string' ? value.to : undefined;
      return from && to ? `Cloned ${from} → ${to}` : 'Cloned node';
    }

    case 'nest': {
      const under = typeof value.under === 'string' ? value.under : undefined;
      const keys = Array.isArray(value.keys) ? (value.keys as unknown[]).length : 0;
      return under ? `Nested ${keys} key${keys === 1 ? '' : 's'} under ${under}` : 'Nested keys';
    }

    case 'fold':
      return path ? `Folded ${path}` : 'Folded node';

    case 'merge': {
      const into = typeof value.into === 'string' ? value.into : undefined;
      return into ? `Merged into ${into}` : 'Merged nodes';
    }

    case 'split':
      return path ? `Split ${path}` : 'Split node';

    case 'sort':
      return path ? `Sorted ${path}` : 'Sorted node';

    case 'unique':
      return path ? `Deduped ${path}` : 'Deduped values';

    case 'pick':
      return path ? `Picked keys in ${path}` : 'Picked keys';

    case 'omit':
      return path ? `Omitted keys in ${path}` : 'Omitted keys';

    case 'assert':
      return path ? `Asserted on ${path}` : 'Asserted';

    case 'relate': {
      const from = typeof value.from === 'string' ? value.from : undefined;
      const to = typeof value.to === 'string' ? value.to : undefined;
      const type = typeof value.type === 'string' ? value.type : 'related';
      return from && to ? `Linked ${from} → ${to} (${type})` : 'Linked nodes';
    }

    case 'unrelate': {
      const from = typeof value.from === 'string' ? value.from : undefined;
      const to = typeof value.to === 'string' ? value.to : undefined;
      return from && to ? `Unlinked ${from} → ${to}` : 'Unlinked nodes';
    }

    default:
      return path ? `${verb} ${path}` : verb;
  }
}

/** Verb portion of an op — used for badge/tag styling. */
export function verbOf(op: YOp): string {
  return getPayload(op)?.verb ?? 'unknown';
}

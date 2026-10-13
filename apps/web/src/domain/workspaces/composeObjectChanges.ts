import type { TransitionProtocolValue, WorkspaceAuthoringCard } from '@t3x-dev/api-client';
import { parsePath } from '@t3x-dev/yops';

type Value = TransitionProtocolValue | undefined;
type ObjectNode = Record<string, TransitionProtocolValue> & {
  key: string;
  slots: Record<string, TransitionProtocolValue>;
  children: TransitionProtocolValue[];
};

export interface ComposeObjectCard extends WorkspaceAuthoringCard {
  /** Display ownership only. These are the actual API records, not new lineage IDs. */
  objectChange?: { sources: WorkspaceAuthoringCard[]; beforePath?: string; afterPath?: string };
  /** Original record for a non-node fragment of a mixed ancestor change. */
  sourceCards?: WorkspaceAuthoringCard[];
}

export interface ComposeObjectFieldChange {
  scope: 'slot' | 'structure';
  key: string;
  before: Value;
  after: Value;
}

function record(value: Value): Record<string, TransitionProtocolValue> | undefined {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value : undefined;
}

export function isComposeObject(value: Value): value is ObjectNode {
  const node = record(value);
  return Boolean(
    node && typeof node.key === 'string' && record(node.slots) && Array.isArray(node.children)
  );
}

export function composeValuesEqual(before: Value, after: Value): boolean {
  if (Object.is(before, after)) return true;
  if (Array.isArray(before) && Array.isArray(after)) {
    return (
      before.length === after.length &&
      before.every((value, index) => composeValuesEqual(value, after[index]))
    );
  }
  const left = record(before);
  const right = record(after);
  if (!left || !right) return false;
  const keys = Object.keys(left);
  return (
    keys.length === Object.keys(right).length &&
    keys.every((key) => Object.hasOwn(right, key) && composeValuesEqual(left[key], right[key]))
  );
}

function childKeys(value: Value): Value {
  return isComposeObject(value)
    ? value.children.map((child) => record(child)?.key ?? child)
    : undefined;
}

function addressableChildren(value: ObjectNode | undefined) {
  return (
    !value ||
    (value.children.every(isComposeObject) &&
      new Set(value.children.map((child) => (child as ObjectNode).key)).size ===
        value.children.length)
  );
}

/** A slot remains one field, including array/object values. No business labels are inferred. */
export function composeObjectFieldChanges(before: Value, after: Value): ComposeObjectFieldChange[] {
  if (!isComposeObject(before) && !isComposeObject(after)) return [];
  const left = isComposeObject(before) ? before : undefined;
  const right = isComposeObject(after) ? after : undefined;
  const changes = [
    ...new Set([...Object.keys(left?.slots ?? {}), ...Object.keys(right?.slots ?? {})]),
  ]
    .filter((key) => !composeValuesEqual(left?.slots[key], right?.slots[key]))
    .map(
      (key): ComposeObjectFieldChange => ({
        scope: 'slot',
        key,
        before: left?.slots[key],
        after: right?.slots[key],
      })
    );
  if (left && right && left.key !== right.key)
    changes.unshift({ scope: 'structure', key: 'key', before: left.key, after: right.key });
  for (const key of new Set([...Object.keys(left ?? {}), ...Object.keys(right ?? {})])) {
    if (['key', 'slots', 'children'].includes(key)) continue;
    if (!composeValuesEqual(left?.[key], right?.[key]))
      changes.push({ scope: 'structure', key, before: left?.[key], after: right?.[key] });
  }
  // Child additions/deletions belong to their own objects; collection order still needs a record.
  const beforeKeys = childKeys(before);
  const afterKeys = childKeys(after);
  if (
    Array.isArray(beforeKeys) &&
    Array.isArray(afterKeys) &&
    addressableChildren(left) &&
    addressableChildren(right) &&
    beforeKeys.length === afterKeys.length &&
    beforeKeys.every((key) => afterKeys.includes(key)) &&
    !composeValuesEqual(beforeKeys, afterKeys)
  ) {
    changes.push({ scope: 'structure', key: 'children', before: beforeKeys, after: afterKeys });
  }
  if (
    (!addressableChildren(left) || !addressableChildren(right)) &&
    !composeValuesEqual(left?.children, right?.children)
  )
    changes.push({
      scope: 'structure',
      key: 'children',
      before: left?.children,
      after: right?.children,
    });
  return changes;
}

function segment(key: string) {
  return !key || /[/[\]="\\]/.test(key) ? JSON.stringify(key) : key;
}

/** Normalize display locations using actual snapshot members; never rewrite source operations. */
export function composeObjectPath(path: string, document: Value): string {
  let value = document;
  const parts: string[] = [];
  for (const part of parsePath(path)) {
    if (part.type === 'key') {
      parts.push(segment(part.value));
      const fields = record(value);
      value = fields && Object.hasOwn(fields, part.value) ? fields[part.value] : undefined;
    } else {
      const list = Array.isArray(value) ? value : [];
      const child =
        part.type === 'index'
          ? list[part.value]
          : list.find((item) => String(record(item)?.[part.key]) === part.value);
      const key = record(child)?.key;
      parts.push(
        typeof key === 'string' && list.filter((item) => record(item)?.key === key).length === 1
          ? `[key=${segment(key)}]`
          : part.type === 'index'
            ? `[${part.value}]`
            : `[${part.key}=${segment(part.value)}]`
      );
      value = child;
    }
  }
  return parts.join('/');
}

function objectsAt(value: Value, path: string, nodes: Map<string, ObjectNode>) {
  if (isComposeObject(value)) {
    nodes.set(path, value);
    objectsAt(value.children, path ? `${path}/children` : 'children', nodes);
  } else if (Array.isArray(value)) {
    const keys = value.map((child) => record(child)?.key);
    // Do not invent identity for ordinary arrays or ambiguous duplicate keys.
    if (keys.some((key) => typeof key !== 'string') || new Set(keys).size !== keys.length) return;
    value.forEach((child, index) =>
      objectsAt(child, `${path ? `${path}/` : ''}[key=${segment(keys[index] as string)}]`, nodes)
    );
  } else {
    const fields = record(value);
    if (fields)
      Object.entries(fields).forEach(([key, child]) =>
        objectsAt(child, path ? `${path}/${segment(key)}` : segment(key), nodes)
      );
  }
}

function inside(path: string, parent: string) {
  return path === parent || !parent || path.startsWith(`${parent}/`);
}

function owner(nodes: Map<string, ObjectNode>, path: string): string | undefined {
  return [...nodes.keys()]
    .filter((candidate) => inside(path, candidate))
    .sort((left, right) => right.length - left.length)[0];
}

/** Keep non-node content of a mixed ancestor change, including relations and tree order. */
function unownedCards(card: WorkspaceAuthoringCard): WorkspaceAuthoringCard[] {
  if (
    composeValuesEqual(card.before, card.after) ||
    isComposeObject(card.before) ||
    isComposeObject(card.after)
  )
    return [];
  const left = record(card.before);
  const right = record(card.after);
  const child = (key: string, before: Value, after: Value): WorkspaceAuthoringCard => ({
    nodeId: card.nodeId,
    path: card.path ? `${card.path}/${key}` : key,
    before,
    after,
  });
  if (left || right)
    return [...new Set([...Object.keys(left ?? {}), ...Object.keys(right ?? {})])].flatMap((key) =>
      unownedCards(child(segment(key), left?.[key], right?.[key]))
    );
  if (Array.isArray(card.before) || Array.isArray(card.after)) {
    const b = Array.isArray(card.before) ? card.before : [];
    const a = Array.isArray(card.after) ? card.after : [];
    const keyed = [...b, ...a].every((value) => typeof record(value)?.key === 'string');
    if (
      keyed &&
      new Set(b.map((value) => record(value)!.key)).size === b.length &&
      new Set(a.map((value) => record(value)!.key)).size === a.length
    ) {
      const bKeys = b.map((value) => record(value)!.key as string);
      const aKeys = a.map((value) => record(value)!.key as string);
      if (
        bKeys.length === aKeys.length &&
        bKeys.every((key) => aKeys.includes(key)) &&
        !composeValuesEqual(bKeys, aKeys)
      )
        return [card];
      return [...new Set([...bKeys, ...aKeys])].flatMap((key) =>
        unownedCards(child(`[key=${segment(key)}]`, b[bKeys.indexOf(key)], a[aKeys.indexOf(key)]))
      );
    }
  }
  return [card];
}

/** Derive one row per structural object from immutable snapshots; keep source records intact. */
export function composeObjectChangeCards(
  cards: readonly WorkspaceAuthoringCard[],
  before?: TransitionProtocolValue,
  after?: TransitionProtocolValue,
  options: { includeUnchanged?: boolean } = {}
): ComposeObjectCard[] {
  const left = new Map<string, ObjectNode>();
  const right = new Map<string, ObjectNode>();
  objectsAt(before, '', left);
  objectsAt(after, '', right);
  for (const card of cards) {
    // Old responses can still provide complete object/ancestor snapshots in their cards.
    if (before === undefined) objectsAt(card.before, card.beforePath ?? card.path, left);
    if (after === undefined) objectsAt(card.after, card.afterPath ?? card.path, right);
  }
  const projected = new Map<string, ComposeObjectCard>();
  const fallback: ComposeObjectCard[] = [];
  const add = (
    source: WorkspaceAuthoringCard,
    beforePath?: string,
    afterPath?: string,
    keepUnchanged = false
  ) => {
    const b = beforePath === undefined ? undefined : left.get(beforePath);
    const a = afterPath === undefined ? undefined : right.get(afterPath);
    if (!b && !a) return;
    const fields = composeObjectFieldChanges(b, a);
    const structural = !b || !a || beforePath !== afterPath;
    if (
      !fields.length &&
      !structural &&
      !(options.includeUnchanged && keepUnchanged && composeValuesEqual(b, a))
    )
      return;
    // A nonempty wrapper has no own change; its individual children carry the change.
    if (structural && !fields.length && (a ?? b)!.children.length > 0 && beforePath === afterPath)
      return;
    if (structural && !fields.length && (a ?? b)!.children.length > 0 && (!b || !a)) return;
    const key = JSON.stringify([beforePath, afterPath]);
    const existing = projected.get(key);
    if (existing) {
      if (!existing.objectChange!.sources.includes(source))
        existing.objectChange!.sources.push(source);
      return;
    }
    projected.set(key, {
      nodeId: source.nodeId,
      path: afterPath ?? beforePath!,
      beforePath: b ? beforePath : undefined,
      afterPath: a ? afterPath : undefined,
      before: b,
      after: a,
      objectChange: {
        sources: [source],
        beforePath: b ? beforePath : undefined,
        afterPath: a ? afterPath : undefined,
      },
    });
  };
  for (const card of cards) {
    if ((card as ComposeObjectCard).objectChange || (card as ComposeObjectCard).sourceCards) {
      fallback.push(card);
      continue;
    }
    const beforePath = composeObjectPath(
      card.beforePath ?? card.path,
      card.before === undefined ? (after ?? before) : (before ?? after)
    );
    const afterPath = composeObjectPath(
      card.afterPath ?? card.path,
      card.after === undefined ? (before ?? after) : (after ?? before)
    );
    const beforeOwner = owner(left, beforePath);
    const afterOwner = owner(right, afterPath);
    const paths = new Set(
      [...left.keys(), ...right.keys()].filter(
        (path) => inside(path, beforePath) || inside(path, afterPath)
      )
    );
    if (beforeOwner !== undefined) paths.add(beforeOwner);
    if (afterOwner !== undefined) paths.add(afterOwner);
    const relocated = card.beforePath !== undefined && beforePath !== afterPath;
    // The surviving collection must not be mistaken for a deleted/added child.
    if (!relocated && beforeOwner && afterOwner && beforeOwner !== afterOwner) {
      if (inside(beforeOwner, afterOwner)) paths.delete(afterOwner);
      if (inside(afterOwner, beforeOwner)) paths.delete(beforeOwner);
    }
    for (const path of paths) {
      let oldPath = path;
      let newPath = path;
      if (relocated) {
        const movedPath = inside(path, beforePath)
          ? afterPath + path.slice(beforePath.length)
          : undefined;
        const originalPath = inside(path, afterPath)
          ? beforePath + path.slice(afterPath.length)
          : undefined;
        if (left.has(path) && movedPath !== undefined && right.has(movedPath)) newPath = movedPath;
        else if (right.has(path) && originalPath !== undefined && left.has(originalPath))
          oldPath = originalPath;
        else if (inside(path, beforePath) && movedPath !== undefined) newPath = movedPath;
        else if (originalPath !== undefined) oldPath = originalPath;
      }
      add(
        card,
        left.has(oldPath) ? oldPath : undefined,
        right.has(newPath) ? newPath : undefined,
        path === beforeOwner || path === afterOwner
      );
    }
    if (!paths.size) {
      if (options.includeUnchanged || !composeValuesEqual(card.before, card.after))
        fallback.push(card);
    } else if (beforeOwner === undefined && afterOwner === undefined) {
      fallback.push(
        ...unownedCards(card).map((fragment) => ({ ...fragment, sourceCards: [card] }))
      );
    }
  }
  return [...projected.values(), ...fallback];
}

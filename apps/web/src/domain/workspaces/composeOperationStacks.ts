import type { TransitionProtocolValue, WorkspaceAuthoringAction } from '@t3x-dev/api-client';
import { applyYOps, type YOp, YOpSchema, type YValue } from '@t3x-dev/yops';
import { composeDraftChangeCards } from './composeDraftChanges';
import {
  composeObjectFieldChanges,
  composeValuesEqual,
  isComposeObject,
} from './composeObjectChanges';

export interface OperationFieldCard {
  path: string;
  op: 'set' | 'unset';
  before?: TransitionProtocolValue;
  after?: TransitionProtocolValue;
}

export interface OperationStackItem {
  actionId: string;
  sequence: number;
  index: number;
  name: string;
  path: string;
  fields: OperationFieldCard[];
  unavailable?: string;
}

export interface OperationStack {
  name: string;
  path: string;
  items: OperationStackItem[];
}

function segment(key: string) {
  return !key || /[/[\]="\\]/.test(key) ? JSON.stringify(key) : key;
}

function fieldCards(
  path: string,
  before: TransitionProtocolValue | undefined,
  after: TransitionProtocolValue | undefined
): OperationFieldCard[] {
  if (composeValuesEqual(before, after)) return [];
  if (isComposeObject(before) || isComposeObject(after)) {
    const fields = composeObjectFieldChanges(before, after);
    if (fields.length)
      return fields.map((field) => ({
        path: `${path}/${field.scope === 'slot' ? 'slots/' : ''}${segment(field.key)}`,
        op: field.after === undefined ? 'unset' : 'set',
        before: field.before,
        after: field.after,
      }));
  }
  const left = before && typeof before === 'object' && !Array.isArray(before) ? before : null;
  const right = after && typeof after === 'object' && !Array.isArray(after) ? after : null;
  if (left || right) {
    const keys = new Set([...Object.keys(left ?? {}), ...Object.keys(right ?? {})]);
    if (keys.size)
      return [...keys].flatMap((key) =>
        fieldCards(`${path ? `${path}/` : ''}${segment(key)}`, left?.[key], right?.[key])
      );
  }
  return [{ path: path || '(root)', op: after === undefined ? 'unset' : 'set', before, after }];
}

function operationIdentity(op: YOp) {
  const [name, value] = Object.entries(op).find(([key]) => key !== 'source')!;
  const fields = value as { path?: string; from?: string; to?: string };
  return { name, path: fields.path ?? fields.from ?? fields.to ?? '(root)' };
}

/** Field cards are a display projection of one recorded action, not compiled primitives. */
export function composeActionOperationItems(
  action: WorkspaceAuthoringAction,
  before?: TransitionProtocolValue
): OperationStackItem[] {
  const items: OperationStackItem[] = [];
  let current = before;
  for (const [index, raw] of action.operations.entries()) {
    const parsed = YOpSchema.safeParse(raw);
    if (!parsed.success) continue;
    const op = parsed.data as YOp;
    const { name, path } = operationIdentity(op);
    if (name === 'assert') {
      if (current !== undefined) {
        const result = applyYOps(current as YValue, [op]);
        if (!result.ok) current = undefined;
      }
      continue;
    }
    const item: OperationStackItem = {
      actionId: action.actionId,
      sequence: action.sequence,
      index: index + 1,
      name,
      path,
      fields: [],
    };
    if (current === undefined) item.unavailable = 'Earlier action value unavailable.';
    else {
      const result = applyYOps(current as YValue, [op]);
      if (!result.ok) {
        item.unavailable = 'Operation replay unavailable.';
        current = undefined;
      } else {
        const after = result.doc as TransitionProtocolValue;
        const cards = composeDraftChangeCards(
          [{ nodeId: action.actionId, path: '', before: current, after }],
          current,
          after
        );
        item.fields = cards.flatMap((card) => fieldCards(card.path, card.before, card.after));
        current = after;
      }
    }
    items.push(item);
  }
  return items;
}

export function composeOperationStacks(items: readonly OperationStackItem[]): OperationStack[] {
  const groups = new Map<string, OperationStack>();
  for (const item of [...items].sort((a, b) => b.sequence - a.sequence || b.index - a.index)) {
    const key = JSON.stringify([item.name, item.path]);
    const group = groups.get(key) ?? { name: item.name, path: item.path, items: [] };
    group.items.push(item);
    groups.set(key, group);
  }
  return [...groups.values()];
}

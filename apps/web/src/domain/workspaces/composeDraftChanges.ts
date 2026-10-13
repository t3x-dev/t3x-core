import type { TransitionProtocolValue, WorkspaceAuthoringCard } from '@t3x-dev/api-client';
import { composeObjectChangeCards } from './composeObjectChanges';

type Value = TransitionProtocolValue | undefined;

function record(value: Value): Record<string, TransitionProtocolValue> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value : null;
}

function segment(key: string) {
  return !key || /[/[\]="\\]/.test(key) ? JSON.stringify(key) : key;
}

function keyedNodes(value: Value) {
  if (value === undefined) return new Map<string, TransitionProtocolValue>();
  if (!Array.isArray(value)) return null;
  const nodes = new Map<string, TransitionProtocolValue>();
  for (const item of value) {
    const node = record(item);
    if (!node || typeof node.key !== 'string' || nodes.has(node.key)) return null;
    nodes.set(node.key, item);
  }
  return nodes;
}

function children(card: WorkspaceAuthoringCard): WorkspaceAuthoringCard[] {
  const before = record(card.before);
  const after = record(card.after);
  const beforeNodes = keyedNodes(card.before);
  const afterNodes = keyedNodes(card.after);
  const child = (key: string, left: Value, right: Value) => {
    const path = card.path ? `${card.path}/${key}` : key;
    return {
      nodeId: card.nodeId,
      path,
      beforePath: left === undefined ? undefined : path,
      afterPath: right === undefined ? undefined : path,
      before: left,
      after: right,
    };
  };
  if (before || after) {
    return [...new Set([...Object.keys(before ?? {}), ...Object.keys(after ?? {})])].map((key) =>
      child(segment(key), before?.[key], after?.[key])
    );
  }
  // Named nodes retain their structural order. Ordinary arrays remain whole values.
  if (beforeNodes && afterNodes) {
    return [...new Set([...beforeNodes.keys(), ...afterNodes.keys()])].map((key) =>
      child(`[key=${segment(key)}]`, beforeNodes.get(key), afterNodes.get(key))
    );
  }
  return [];
}

function unchanged(card: WorkspaceAuthoringCard) {
  return JSON.stringify(card.before) === JSON.stringify(card.after);
}

/** Structural business objects stay together; older generic documents keep their field view. */
export function composeDraftChangeCards(
  cards: readonly WorkspaceAuthoringCard[],
  before?: TransitionProtocolValue,
  after?: TransitionProtocolValue
) {
  const visit = (card: WorkspaceAuthoringCard): WorkspaceAuthoringCard[] => {
    if (unchanged(card)) return [];
    if (card.before === undefined || card.after === undefined) return [card];
    const bothObjects = record(card.before) && record(card.after);
    const bothNodeLists =
      Array.isArray(card.before) &&
      Array.isArray(card.after) &&
      keyedNodes(card.before) &&
      keyedNodes(card.after);
    if (bothObjects) return children(card).flatMap(visit);
    if (bothNodeLists) {
      const nested = children(card).flatMap(visit);
      if (nested.length) return nested;
    }
    return [card];
  };
  return composeObjectChangeCards(cards, before, after).flatMap((card) =>
    card.objectChange ? [card] : visit(card)
  );
}

function atPath(card: WorkspaceAuthoringCard, path: string): WorkspaceAuthoringCard | undefined {
  if (card.path === path) return card;
  if (card.path && !path.startsWith(`${card.path}/`)) return undefined;
  for (const child of children(card)) {
    const match = atPath(child, path);
    if (match) return match;
  }
  return undefined;
}

/** Keep the actual action owner while reading a selected field inside its snapshot. */
export function composeCardsAtPath(cards: readonly WorkspaceAuthoringCard[], path: string) {
  return cards.flatMap((card) => {
    const projected = atPath(card, path);
    return projected && !unchanged(projected) ? [projected] : [];
  });
}

export function composeDraftValueAtPath(document: TransitionProtocolValue, path: string) {
  return atPath({ nodeId: '', path: '', after: document }, path)?.after;
}

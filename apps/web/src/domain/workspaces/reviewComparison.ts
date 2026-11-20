import type { TransitionProtocolValue } from '@t3x-dev/api-client';
import { composeValuesEqual } from './composeObjectChanges';
import { type DraftStructureNode, isSemanticEnvelope, walkDraftStructure } from './draftStructure';

export interface ReviewComparisonRow {
  node: DraftStructureNode;
  before?: DraftStructureNode;
  after?: DraftStructureNode;
  kind: 'added' | 'removed' | 'changed' | 'unchanged';
}

/** Align exact read-model paths, including semantic keys and recorded relations. */
export function reviewComparisonRows(before: unknown, after: unknown): ReviewComparisonRow[] {
  const walk = (value: unknown) => {
    const nodes = walkDraftStructure(value);
    if (isSemanticEnvelope(value)) {
      nodes.push(
        ...walkDraftStructure({ relations: value.content.relations }).map((node) => ({
          ...node,
          path: `content/${node.path}`,
          parentPath: node.parentPath ? `content/${node.parentPath}` : 'content',
        }))
      );
    }
    return nodes;
  };
  const previous = new Map(walk(before).map((node) => [node.path, node]));
  const next = new Map(walk(after).map((node) => [node.path, node]));
  const rows = [...new Set([...previous.keys(), ...next.keys()])].map(
    (path): ReviewComparisonRow => {
      const left = previous.get(path);
      const right = next.get(path);
      return {
        node: right ?? left!,
        before: left,
        after: right,
        kind: !left
          ? 'added'
          : !right
            ? 'removed'
            : composeValuesEqual(
                  left.value as TransitionProtocolValue,
                  right.value as TransitionProtocolValue
                )
              ? 'unchanged'
              : 'changed',
      };
    }
  );
  // Keep ancestors together when a new child was appended to an existing subtree.
  const children = new Map<string | null, ReviewComparisonRow[]>();
  const paths = new Set(rows.map((row) => row.node.path));
  for (const row of rows) {
    const parent =
      row.node.parentPath !== null && paths.has(row.node.parentPath) ? row.node.parentPath : null;
    children.set(parent, [...(children.get(parent) ?? []), row]);
  }
  const ordered: ReviewComparisonRow[] = [];
  const visit = (parent: string | null) => {
    for (const row of children.get(parent) ?? []) {
      ordered.push(row);
      visit(row.node.path);
    }
  };
  visit(null);
  return ordered;
}

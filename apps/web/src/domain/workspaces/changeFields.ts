import { composeNodeTitle, humanizeComposeIdentifier } from '@/domain/composePresentation';

export type FieldChangeKind = 'added' | 'changed' | 'removed';

export interface FieldChange {
  name: string;
  before: unknown;
  after: unknown;
  kind: FieldChangeKind;
}

export interface FieldChangeGroup {
  id: string;
  label: string;
  breadcrumb: string | null;
  kind: FieldChangeKind;
  fields: FieldChange[];
}

interface SemanticNode {
  crumbs: string[];
  key: string;
  slots: Record<string, unknown>;
  value: unknown;
}

const ENVELOPE_KEYS = new Set(['domain', 'version']);

/**
 * Group the changes between two Workspace documents by the node that owns them.
 * Semantic-content documents are compared node by node and slot by slot; other
 * documents are compared by top-level key.
 */
export function fieldChangeGroups(base: unknown, current: unknown): FieldChangeGroup[] {
  const before = semanticTrees(base);
  const after = semanticTrees(current);
  if (before !== null || after !== null) {
    return [
      ...semanticNodeGroups(before ?? [], after ?? []),
      ...relationGroup(semanticRelations(base), semanticRelations(current)),
    ];
  }
  return documentGroup(record(base) ?? {}, record(current) ?? {});
}

export function fieldChangeCount(groups: readonly FieldChangeGroup[]): number {
  return groups.reduce((total, group) => total + group.fields.length, 0);
}

function semanticNodeGroups(base: unknown[], current: unknown[]): FieldChangeGroup[] {
  const beforeNodes = flattenNodes(base);
  const afterNodes = flattenNodes(current);
  const ids = [...new Set([...afterNodes.keys(), ...beforeNodes.keys()])];
  return ids.flatMap((id): FieldChangeGroup[] => {
    const previous = beforeNodes.get(id);
    const next = afterNodes.get(id);
    const node = (next ?? previous)!;
    const fields = slotChanges(previous?.slots, next?.slots);
    if (fields.length === 0) return [];
    return [
      {
        id,
        label:
          composeNodeTitle(next?.value) ?? composeNodeTitle(previous?.value) ?? humanize(node.key),
        breadcrumb: node.crumbs.length ? node.crumbs.map(humanize).join(' / ') : null,
        kind: previous === undefined ? 'added' : next === undefined ? 'removed' : 'changed',
        fields,
      },
    ];
  });
}

function slotChanges(
  before: Record<string, unknown> | undefined,
  after: Record<string, unknown> | undefined
): FieldChange[] {
  const names = [...new Set([...Object.keys(after ?? {}), ...Object.keys(before ?? {})])];
  return names.flatMap((name): FieldChange[] => {
    const previous = before?.[name];
    const next = after?.[name];
    if (sameValue(previous, next)) return [];
    return [{ name: humanize(name), before: previous, after: next, kind: kindOf(previous, next) }];
  });
}

function relationGroup(before: unknown[], after: unknown[]): FieldChangeGroup[] {
  if (sameValue(before, after)) return [];
  return [
    {
      id: 'relations',
      label: 'Relations',
      breadcrumb: null,
      kind: before.length === 0 ? 'added' : after.length === 0 ? 'removed' : 'changed',
      fields: [
        {
          name: 'Count',
          before: before.length || undefined,
          after: after.length || undefined,
          kind: kindOf(before.length || undefined, after.length || undefined),
        },
      ],
    },
  ];
}

function documentGroup(
  before: Record<string, unknown>,
  after: Record<string, unknown>
): FieldChangeGroup[] {
  const fields = slotChanges(withoutEnvelope(before), withoutEnvelope(after));
  if (fields.length === 0) return [];
  return [{ id: 'document', label: 'Document', breadcrumb: null, kind: 'changed', fields }];
}

function flattenNodes(trees: unknown[]): Map<string, SemanticNode> {
  const nodes = new Map<string, SemanticNode>();
  const visit = (value: unknown, crumbs: string[]) => {
    const node = record(value);
    if (!node || typeof node.key !== 'string') return;
    nodes.set([...crumbs, node.key].join('/'), {
      crumbs,
      key: node.key,
      slots: record(node.slots) ?? {},
      value,
    });
    for (const child of Array.isArray(node.children) ? node.children : []) {
      visit(child, [...crumbs, node.key]);
    }
  };
  for (const tree of trees) visit(tree, []);
  return nodes;
}

function semanticTrees(document: unknown): unknown[] | null {
  const content = record(record(document)?.content);
  return Array.isArray(content?.trees) ? content.trees : null;
}

function semanticRelations(document: unknown): unknown[] {
  const relations = record(record(document)?.content)?.relations;
  return Array.isArray(relations) ? relations : [];
}

function withoutEnvelope(value: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(value).filter(([key]) => !ENVELOPE_KEYS.has(key)));
}

function kindOf(before: unknown, after: unknown): FieldChangeKind {
  if (before === undefined) return 'added';
  if (after === undefined) return 'removed';
  return 'changed';
}

function sameValue(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function humanize(value: string): string {
  return humanizeComposeIdentifier(value) || value;
}

import type { SemanticContent, TreeNode } from '@t3x-dev/core';
import * as yaml from 'js-yaml';
import type {
  SourceBundleItem,
  WorkspaceCandidate,
  WorkspaceYOpsDraftOperation,
} from '@/types/workspaces';

export type StructuredDiffKind = 'added' | 'modified' | 'removed';

export interface StructuredDiffChange {
  afterValue: string;
  beforeValue: string;
  evidence?: string;
  evidenceSource?: string;
  id: string;
  kind: StructuredDiffKind;
  op: string;
  path: string;
  reason: string;
  summary: string;
}

interface BuildStructuredStateDiffInput {
  baseline: SemanticContent;
  head: SemanticContent;
  workspace?: WorkspaceCandidate | null;
}

interface RawChange {
  afterValue: unknown;
  beforeValue: unknown;
  id: string;
  kind: StructuredDiffKind;
  path: string;
}

export function buildStructuredStateDiff({
  baseline,
  head,
  workspace,
}: BuildStructuredStateDiffInput): StructuredDiffChange[] {
  const baselineNodes = flattenNodes(baseline.trees ?? []);
  const headNodes = flattenNodes(head.trees ?? []);
  const rawChanges: RawChange[] = [];
  const nodePaths = Array.from(new Set([...baselineNodes.keys(), ...headNodes.keys()])).sort();

  for (const nodePath of nodePaths) {
    const baselineNode = baselineNodes.get(nodePath);
    const headNode = headNodes.get(nodePath);

    if (!baselineNode || !headNode) {
      const node = headNode ?? baselineNode;
      const slotEntries = Object.entries(node?.slots ?? {});
      const kind: StructuredDiffKind = headNode ? 'added' : 'removed';
      if (slotEntries.length === 0 && !hasDescendant(nodePaths, nodePath)) {
        rawChanges.push({
          afterValue: headNode ? 'Node created' : undefined,
          beforeValue: baselineNode ? 'Node existed' : undefined,
          id: `${kind}:${nodePath}`,
          kind,
          path: nodePath,
        });
      }
      for (const [slotKey, value] of slotEntries) {
        rawChanges.push({
          afterValue: headNode ? value : undefined,
          beforeValue: baselineNode ? value : undefined,
          id: `${kind}:${nodePath}/${slotKey}`,
          kind,
          path: `${nodePath}/${slotKey}`,
        });
      }
      continue;
    }

    const baselineSlots = baselineNode.slots ?? {};
    const headSlots = headNode.slots ?? {};
    const slotKeys = Array.from(
      new Set([...Object.keys(baselineSlots), ...Object.keys(headSlots)])
    ).sort();

    for (const slotKey of slotKeys) {
      const beforeValue = baselineSlots[slotKey];
      const afterValue = headSlots[slotKey];
      const slotPath = `${nodePath}/${slotKey}`;
      if (stableValue(beforeValue) === stableValue(afterValue)) continue;

      const arrayChanges = buildArrayTailChanges(slotPath, beforeValue, afterValue);
      if (arrayChanges) {
        rawChanges.push(...arrayChanges);
        continue;
      }

      const kind: StructuredDiffKind =
        beforeValue === undefined ? 'added' : afterValue === undefined ? 'removed' : 'modified';
      rawChanges.push({
        afterValue,
        beforeValue,
        id: `${kind}:${slotPath}`,
        kind,
        path: slotPath,
      });
    }
  }

  return rawChanges.map((change) => enrichChange(change, workspace));
}

function flattenNodes(trees: TreeNode[], prefix = ''): Map<string, TreeNode> {
  const nodes = new Map<string, TreeNode>();
  for (const node of trees) {
    const path = prefix ? `${prefix}/${node.key}` : node.key;
    nodes.set(path, node);
    for (const [childPath, child] of flattenNodes(node.children ?? [], path)) {
      nodes.set(childPath, child);
    }
  }
  return nodes;
}

function hasDescendant(paths: string[], path: string): boolean {
  return paths.some((candidate) => candidate.startsWith(`${path}/`));
}

function buildArrayTailChanges(
  path: string,
  beforeValue: unknown,
  afterValue: unknown
): RawChange[] | null {
  if (!Array.isArray(beforeValue) || !Array.isArray(afterValue)) return null;

  const sharedLength = Math.min(beforeValue.length, afterValue.length);
  const sharedPrefix = Array.from({ length: sharedLength }, (_, index) => index).every(
    (index) => stableValue(beforeValue[index]) === stableValue(afterValue[index])
  );
  if (!sharedPrefix || beforeValue.length === afterValue.length) return null;

  if (afterValue.length > beforeValue.length) {
    return afterValue.slice(beforeValue.length).map((value, index) => ({
      afterValue: value,
      beforeValue: undefined,
      id: `added:${path}/-:${String(index)}`,
      kind: 'added',
      path: `${path}/-`,
    }));
  }

  return beforeValue.slice(afterValue.length).map((value, index) => ({
    afterValue: undefined,
    beforeValue: value,
    id: `removed:${path}/${String(afterValue.length + index)}`,
    kind: 'removed',
    path: `${path}/${String(afterValue.length + index)}`,
  }));
}

function enrichChange(
  change: RawChange,
  workspace: WorkspaceCandidate | null | undefined
): StructuredDiffChange {
  const operation = findOperation(workspace?.yopsDraft.operations ?? [], change.path);
  const source = findSource(workspace?.sourceBundle ?? [], operation);
  const fieldLabel = humanizeField(change.path);
  return {
    afterValue: formatValue(change.afterValue),
    beforeValue: formatValue(change.beforeValue),
    evidence: source ? sourceExcerpt(source) : undefined,
    evidenceSource: source?.title,
    id: change.id,
    kind: change.kind,
    op: operation?.op.toUpperCase() ?? defaultOp(change.kind),
    path: change.path,
    reason: operation?.reason?.trim() || fallbackReason(change.kind, fieldLabel),
    summary: summaryFor(change.kind, fieldLabel),
  };
}

function findOperation(
  operations: WorkspaceYOpsDraftOperation[],
  changePath: string
): WorkspaceYOpsDraftOperation | undefined {
  const normalizedChange = normalizePath(changePath);
  return operations.find((operation) => {
    const normalizedOperation = normalizePath(operation.path).replace(/\/-$/, '');
    return (
      normalizedChange === normalizedOperation ||
      normalizedChange.replace(/\/-$/, '') === normalizedOperation ||
      normalizedChange.startsWith(`${normalizedOperation}/`)
    );
  });
}

function findSource(
  sources: SourceBundleItem[],
  operation: WorkspaceYOpsDraftOperation | undefined
): SourceBundleItem | undefined {
  const sourceRefs = operation?.sourceRefs ?? [];
  return sources.find((source) => sourceRefs.includes(source.id));
}

function sourceExcerpt(source: SourceBundleItem): string | undefined {
  const userTurn = source.previewTurns?.find((turn) => turn.role === 'user');
  const previewTurn = userTurn ?? source.previewTurns?.at(-1);
  return previewTurn?.content ?? source.previewText ?? source.description;
}

function normalizePath(path: string): string {
  return path
    .trim()
    .replace(/^\/+/, '')
    .replace(/\.+/g, '/')
    .replace(/\/{2,}/g, '/')
    .replace(/\/$/, '');
}

function humanizeField(path: string): string {
  const key = path.split('/').filter(Boolean).at(-1) ?? 'field';
  const parent = path.split('/').filter(Boolean).at(-2);
  if (key === '-') return parent === 'acceptance' ? 'acceptance criterion' : 'list item';
  if (key === 'problem') return 'problem statement';
  if (key === 'audience') return 'target audience';
  if (key === 'outcome') return 'desired outcome';
  if (key === 'title' && path.includes('/requirements/')) return 'requirement title';
  return key.replace(/[_-]+/g, ' ');
}

function summaryFor(kind: StructuredDiffKind, fieldLabel: string): string {
  if (kind === 'added') return `Added ${fieldLabel}`;
  if (kind === 'removed') return `Removed ${fieldLabel}`;
  return `Updated ${fieldLabel}`;
}

function fallbackReason(kind: StructuredDiffKind, fieldLabel: string): string {
  if (kind === 'added') return `This commit introduces the ${fieldLabel}.`;
  if (kind === 'removed') return `This commit removes the ${fieldLabel}.`;
  return `This commit updates the ${fieldLabel} from its parent value.`;
}

function defaultOp(kind: StructuredDiffKind): string {
  if (kind === 'added') return 'ADD';
  if (kind === 'removed') return 'REMOVE';
  return 'SET';
}

function formatValue(value: unknown): string {
  if (value === undefined) return 'No value recorded';
  if (typeof value === 'string') return value || 'Empty';
  return yaml.dump(value, { lineWidth: -1, noRefs: true, sortKeys: true }).trimEnd();
}

function stableValue(value: unknown): string {
  if (value === undefined) return 'undefined:';
  return `${typeof value}:${yaml.dump(value, { lineWidth: -1, noRefs: true, sortKeys: true })}`;
}

import type {
  WorkspaceCandidate,
  WorkspaceSchemaBinding,
  WorkspaceSchemaCandidateField,
  WorkspaceYOpsDraftOperation,
} from '@/types/workspaces';
import type {
  WorkspaceYOp,
  WorkspaceYOpsTreeNode,
  WorkspaceYOpsValidationResult,
  WorkspaceYOpsValue,
} from '@/types/workspaceYops';
import { API_V1, fetchWithTimeout, handleResponse } from './core';

interface ValidateYOpsResponse {
  ok: boolean;
  applied: number;
  preview?: {
    trees: WorkspaceYOpsTreeNode[];
    relations: unknown[];
  };
  error?: {
    op_index: number;
    code: string;
    message: string;
  };
}

export interface WorkspaceYOpsBaseline {
  trees: WorkspaceYOpsTreeNode[];
  relations: unknown[];
}

export async function validateWorkspaceYOps(
  candidate: WorkspaceCandidate,
  inheritedBaseline?: WorkspaceYOpsBaseline
): Promise<WorkspaceYOpsValidationResult> {
  const rootKey = getWorkspaceYOpsRootKey(candidate.schemaBindings);
  const baselineTrees = buildWorkspaceBaselineTrees(
    candidate,
    rootKey,
    inheritedBaseline?.trees ?? []
  );
  const baselineRelations = inheritedBaseline?.relations ?? [];
  const yops = candidate.yopsDraft.operations.map((operation) =>
    operationToYOp(operation, rootKey)
  );

  const res = await fetchWithTimeout(`${API_V1}/yops/validate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      trees: baselineTrees,
      relations: baselineRelations,
      yops,
    }),
  });
  const data = await handleResponse<ValidateYOpsResponse>(res);

  return {
    ok: data.ok,
    applied: data.applied,
    yops,
    baselineTrees,
    baselineRelations,
    previewTrees: data.preview?.trees,
    previewRelations: data.preview?.relations,
    error: data.error,
  };
}

export function getWorkspaceYOpsRootKey(bindings: WorkspaceSchemaBinding[]): string {
  const primary = bindings[0]?.schemaName.replace(/\s+Schema$/i, '') ?? 'candidate';
  return toSnakeKey(primary);
}

function buildWorkspaceBaselineTrees(
  candidate: WorkspaceCandidate,
  rootKey: string,
  inheritedTrees: WorkspaceYOpsTreeNode[]
): WorkspaceYOpsTreeNode[] {
  const root: WorkspaceYOpsTreeNode = {
    key: rootKey,
    slots: { title: candidate.title },
    children: [],
  };

  for (const field of candidate.schemaCandidate.fields) {
    addFieldToTree(root, field);
  }

  for (const operation of candidate.yopsDraft.operations) {
    seedOperationBaseline(root, operation, rootKey);
  }

  return mergeWorkspaceBaselineTrees(inheritedTrees, [root]);
}

function mergeWorkspaceBaselineTrees(
  inheritedTrees: WorkspaceYOpsTreeNode[],
  scaffoldTrees: WorkspaceYOpsTreeNode[]
): WorkspaceYOpsTreeNode[] {
  const merged = inheritedTrees.map(cloneWorkspaceTree);

  for (const scaffold of scaffoldTrees) {
    const inheritedIndex = merged.findIndex((tree) => tree.key === scaffold.key);
    if (inheritedIndex < 0) {
      merged.push(cloneWorkspaceTree(scaffold));
      continue;
    }
    merged[inheritedIndex] = mergeWorkspaceTree(merged[inheritedIndex], scaffold);
  }

  return merged;
}

function mergeWorkspaceTree(
  inherited: WorkspaceYOpsTreeNode,
  scaffold: WorkspaceYOpsTreeNode
): WorkspaceYOpsTreeNode {
  const children = inherited.children.map(cloneWorkspaceTree);
  for (const scaffoldChild of scaffold.children) {
    const inheritedIndex = children.findIndex((child) => child.key === scaffoldChild.key);
    if (inheritedIndex < 0) {
      children.push(cloneWorkspaceTree(scaffoldChild));
      continue;
    }
    children[inheritedIndex] = mergeWorkspaceTree(children[inheritedIndex], scaffoldChild);
  }

  return {
    key: inherited.key,
    slots: { ...scaffold.slots, ...inherited.slots },
    children,
  };
}

function cloneWorkspaceTree(tree: WorkspaceYOpsTreeNode): WorkspaceYOpsTreeNode {
  return {
    key: tree.key,
    slots: { ...tree.slots },
    children: tree.children.map(cloneWorkspaceTree),
  };
}

function addFieldToTree(root: WorkspaceYOpsTreeNode, field: WorkspaceSchemaCandidateField) {
  const segments = field.path.split('.').filter(Boolean).map(toSnakeKey);
  if (segments.length === 0) return;

  const parentSegments = field.children?.length ? segments : segments.slice(0, -1);
  let node = root;
  for (const segment of parentSegments) node = ensureChildNode(node, segment);

  if (!field.children?.length) {
    const slotKey = segments.at(-1);
    if (slotKey) node.slots[slotKey] = coerceFieldValue(field);
  }

  for (const child of field.children ?? []) addFieldToTree(root, child);
}

function seedOperationBaseline(
  root: WorkspaceYOpsTreeNode,
  operation: WorkspaceYOpsDraftOperation,
  rootKey: string
) {
  const yopsPath = normalizeYOpsPath(operation.path, rootKey);
  const segments = yopsPath.split('/').filter(Boolean);
  if (segments[0] !== root.key || segments.length < 2) return;

  const slotKey = segments.at(-1);
  if (!slotKey) return;

  const parentSegments = segments.slice(1, -1);
  let node = root;
  for (const segment of parentSegments) node = ensureChildNode(node, segment);

  if (operation.op === 'add' || operation.op === 'append') {
    node.slots[slotKey] = operationBaselineArrayValue(operation);
    return;
  }

  if (operation.beforeValue !== undefined) {
    node.slots[slotKey] = operation.beforeValue;
  }
}

function operationBaselineArrayValue(operation: WorkspaceYOpsDraftOperation): WorkspaceYOpsValue[] {
  const beforeValue = operation.beforeValue?.trim();
  if (!beforeValue || isEmptyBaselineLabel(beforeValue)) return [];
  if (operation.afterValue !== undefined && beforeValue === operation.afterValue.trim()) return [];
  return [operation.beforeValue ?? beforeValue];
}

function isEmptyBaselineLabel(value: string): boolean {
  return /^no\b/i.test(value);
}

function operationToYOp(operation: WorkspaceYOpsDraftOperation, rootKey: string): WorkspaceYOp {
  const path = normalizeYOpsPath(operation.path, rootKey);
  const value = operation.afterValue ?? operation.summary;

  if (operation.op === 'add' || operation.op === 'append') {
    return { append: { path: path.replace(/\/-$/, ''), value } };
  }
  if (operation.op === 'define') return { define: { path } };
  if (operation.op === 'drop') return { drop: { path } };
  if (operation.op === 'unset') return { unset: { path } };
  return { set: { path, value } };
}

function normalizeYOpsPath(path: string, rootKey: string): string {
  const withoutArrayPush = path.replace(/\/-$/, '');
  const segments = withoutArrayPush
    .split('/')
    .filter(Boolean)
    .map((segment) => toSnakeKey(segment));

  if (segments[0] === rootKey) return segments.join('/');
  return [rootKey, ...segments].join('/');
}

function coerceFieldValue(field: WorkspaceSchemaCandidateField): WorkspaceYOpsValue {
  if (field.type === 'array' || field.type.endsWith('[]')) {
    return field.value ? [field.value] : [];
  }
  return field.value ?? '';
}

function ensureChildNode(parent: WorkspaceYOpsTreeNode, key: string): WorkspaceYOpsTreeNode {
  const existing = parent.children.find((child) => child.key === key);
  if (existing) return existing;

  const child: WorkspaceYOpsTreeNode = { key, slots: {}, children: [] };
  parent.children.push(child);
  return child;
}

function toSnakeKey(value: string): string {
  return value
    .trim()
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .toLowerCase();
}

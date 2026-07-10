import type { SemanticContent, TreeNode } from '@t3x-dev/core';
import * as yaml from 'js-yaml';

export type StatePointStatus = 'changed' | 'created' | 'missing' | 'set' | 'unchanged';

export interface StatePointRow {
  depth: number;
  expandable: boolean;
  id: string;
  issueCount: number;
  key: string;
  path: string;
  sourceOp: string;
  status: StatePointStatus;
  statusLabel: string;
  type: string;
  value: string;
}

export interface StateOperationEntry {
  created_at: string;
  id: string;
  model?: string | null;
  source: string;
  turn_hash: string | null;
  yops: unknown;
}

export interface StateValidationGapLike {
  path?: string | null;
}

export interface StateWorkspaceDraftOperationLike {
  afterValue?: unknown;
  id?: string;
  op?: string;
  path?: string;
  reason?: string;
  sourceRefs?: string[];
  summary?: string;
}

export interface BuildStatePointRowsOptions {
  gaps?: StateValidationGapLike[];
  operations?: StateOperationEntry[];
}

interface OperationMark {
  label: string;
  status: StatePointStatus;
}

export interface PrdRenderRequirement {
  acceptance: string;
  priority: string;
  title: string;
}

export interface PrdRenderModel {
  audience: string;
  audienceMissing: boolean;
  metadata: Record<string, unknown>;
  outcome: string;
  problem: string;
  requirements: PrdRenderRequirement[];
  title: string;
}

function semanticContentToPlain(content: SemanticContent): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const tree of content.trees ?? []) {
    const [key, value] = treeNodeToPlain(tree);
    out[key] = value;
  }
  return out;
}

function treeNodeToPlain(node: TreeNode): [string, Record<string, unknown>] {
  const value: Record<string, unknown> = { ...(node.slots ?? {}) };
  for (const child of node.children ?? []) {
    const [childKey, childValue] = treeNodeToPlain(child);
    value[childKey] = childValue;
  }
  return [node.key, value];
}

export function buildStatePointRows(
  content: SemanticContent,
  options: BuildStatePointRowsOptions = {}
): StatePointRow[] {
  const plain = semanticContentToPlain(content);
  const rootKeys = Object.keys(plain);
  const gapPaths = buildGapPathSet(options.gaps ?? [], rootKeys);
  const operationIndex = buildOperationPathIndex(options.operations ?? []);
  const rows: StatePointRow[] = [];

  for (const [key, value] of Object.entries(plain)) {
    appendRows(rows, key, value, key, 0, gapPaths, operationIndex);
  }

  return rows;
}

export function buildCanonicalStateYaml(content: SemanticContent): string {
  return yaml
    .dump(semanticContentToPlain(content), {
      forceQuotes: false,
      lineWidth: -1,
      noRefs: true,
      quotingType: '"',
      sortKeys: false,
    })
    .trimEnd();
}

export function workspaceDraftOperationsToStateOperations(
  operations: StateWorkspaceDraftOperationLike[]
): StateOperationEntry[] {
  return operations.flatMap((operation, index) => {
    const yOp = workspaceDraftOperationToYOp(operation);
    if (!yOp) return [];
    return [
      {
        created_at: '',
        id: operation.id || 'workspace_draft_op_' + String(index + 1),
        model: null,
        source: 'workspace_draft',
        turn_hash: null,
        yops: [yOp],
      },
    ];
  });
}

export function selectPrdRenderModel(
  content: SemanticContent,
  options: { gaps?: StateValidationGapLike[] } = {}
): PrdRenderModel {
  const plain = semanticContentToPlain(content);
  const rootKey = Object.hasOwn(plain, 'prd') ? 'prd' : Object.keys(plain)[0];
  const root = toRecord(rootKey ? plain[rootKey] : null);
  const summary = toRecord(root.summary);
  const metadata = toRecord(root.metadata);
  const gapPaths = buildGapPathSet(options.gaps ?? [], rootKey ? [rootKey] : []);
  const audience = scalarToString(summary.audience);

  return {
    audience,
    audienceMissing:
      isEmptyScalar(summary.audience) || gapPaths.has(normalizePath('prd/summary/audience')),
    metadata,
    outcome: scalarToString(summary.outcome),
    problem: scalarToString(summary.problem),
    requirements: requirementsToRenderModel(root.requirements),
    title: scalarToString(root.title) || 'State document',
  };
}

function appendRows(
  rows: StatePointRow[],
  key: string,
  value: unknown,
  path: string,
  depth: number,
  gapPaths: Set<string>,
  operationIndex: Map<string, OperationMark>
) {
  const normalizedPath = normalizePath(path);
  const expandable = isExpandable(value);
  const issueCount = countDescendants(gapPaths, normalizedPath, true);
  const operation = operationIndex.get(normalizedPath);
  const childOperationCount = countDescendants(operationIndex, normalizedPath, false);
  const exactIssue = gapPaths.has(normalizedPath);
  const status = deriveStatus({
    childOperationCount,
    exactIssue,
    expandable,
    operation,
  });
  rows.push({
    depth,
    expandable,
    id: normalizedPath,
    issueCount,
    key,
    path: normalizedPath,
    sourceOp: operation?.label ?? '-',
    status,
    statusLabel: deriveStatusLabel({
      childOperationCount,
      exactIssue,
      operation,
      status,
    }),
    type: valueType(value),
    value: valueSummary(value),
  });

  if (Array.isArray(value)) {
    value.forEach((item, index) => {
      appendRows(
        rows,
        String(index),
        item,
        normalizedPath + '/' + String(index),
        depth + 1,
        gapPaths,
        operationIndex
      );
    });
    return;
  }

  const record = toRecordOrNull(value);
  if (!record) return;

  for (const [childKey, childValue] of Object.entries(record)) {
    appendRows(
      rows,
      childKey,
      childValue,
      normalizedPath + '/' + childKey,
      depth + 1,
      gapPaths,
      operationIndex
    );
  }
}

function deriveStatus(input: {
  childOperationCount: number;
  exactIssue: boolean;
  expandable: boolean;
  operation: OperationMark | undefined;
}): StatePointStatus {
  if (input.exactIssue) return 'missing';
  if (input.operation) return input.operation.status;
  if (input.expandable && input.childOperationCount > 0) return 'changed';
  return 'unchanged';
}

function deriveStatusLabel(input: {
  childOperationCount: number;
  exactIssue: boolean;
  operation: OperationMark | undefined;
  status: StatePointStatus;
}): string {
  if (input.exactIssue) return 'missing';
  if (input.operation)
    return input.operation.status === 'created' ? 'create' : input.operation.status;
  if (input.status === 'changed' && input.childOperationCount > 0) {
    return String(input.childOperationCount) + ' changes';
  }
  return 'unchanged';
}

export function buildOperationPathIndex(
  operations: StateOperationEntry[]
): Map<string, OperationMark> {
  const marks = new Map<string, OperationMark>();
  let opIndex = 0;

  for (const entry of operations) {
    for (const yOp of normalizeYOps(entry.yops)) {
      const opName = yOpName(yOp);
      if (!opName) continue;
      opIndex += 1;
      const label = paddedOperationIndex(opIndex) + ' ' + opName.toUpperCase();
      for (const mark of operationMarks(yOp, opName, label)) {
        if (!marks.has(mark.path)) marks.set(mark.path, mark);
      }
    }
  }

  return marks;
}

function operationMarks(
  yOp: Record<string, unknown>,
  opName: string,
  label: string
): Array<OperationMark & { path: string }> {
  const payload = toRecord(yOp[opName]);
  const status = statusForOperation(opName);
  const paths: string[] = [];

  const path = firstString(payload.path, payload.to, payload.from);
  if (path) paths.push(normalizePath(path));

  if (opName === 'rename' && typeof payload.to === 'string') paths.push(normalizePath(payload.to));
  if ((opName === 'move' || opName === 'clone') && typeof payload.to === 'string') {
    paths.push(normalizePath(payload.to));
  }

  if (opName === 'populate' && typeof payload.path === 'string') {
    const basePath = normalizePath(payload.path);
    const values = toRecord(payload.values);
    for (const key of Object.keys(values)) {
      paths.push(basePath + '/' + key);
    }
  }

  return Array.from(new Set(paths.filter(Boolean))).map((pathValue) => ({
    label,
    path: pathValue,
    status,
  }));
}

function statusForOperation(opName: string): StatePointStatus {
  if (opName === 'set') return 'set';
  if (opName === 'append' || opName === 'define' || opName === 'populate') return 'created';
  return 'changed';
}

function normalizeYOps(value: unknown): Array<Record<string, unknown>> {
  if (Array.isArray(value)) return value.flatMap((item) => normalizeYOps(item));
  const record = toRecordOrNull(value);
  if (!record) return [];
  if (Array.isArray(record.yops)) return normalizeYOps(record.yops);
  if (yOpName(record)) return [record];
  return [];
}

function yOpName(yOp: Record<string, unknown>): string | null {
  const names = [
    'define',
    'drop',
    'rename',
    'set',
    'unset',
    'populate',
    'append',
    'move',
    'clone',
    'nest',
    'split',
    'fold',
    'merge',
    'sort',
    'unique',
    'pick',
    'omit',
    'assert',
    'relate',
    'unrelate',
  ];
  return names.find((name) => Object.hasOwn(yOp, name)) ?? null;
}

function workspaceDraftOperationToYOp(
  operation: StateWorkspaceDraftOperationLike
): Record<string, unknown> | null {
  const opName = typeof operation.op === 'string' ? operation.op.trim().toLowerCase() : '';
  const path = typeof operation.path === 'string' ? operation.path.trim() : '';
  if (!opName || !path) return null;

  if (opName === 'set') return { set: { path, value: operation.afterValue ?? '' } };
  if (opName === 'add' || opName === 'append') {
    return { append: { path: path.replace(/(?:\/|\.)-$/, ''), value: operation.afterValue ?? '' } };
  }
  if (opName === 'populate' && isPlainRecord(operation.afterValue)) {
    return { populate: { path, values: operation.afterValue } };
  }
  if (opName === 'create' || opName === 'define') return { define: { path } };
  if (opName === 'delete' || opName === 'drop') return { drop: { path } };
  if (opName === 'unset') return { unset: { path } };
  return null;
}

function buildGapPathSet(gaps: StateValidationGapLike[], rootKeys: string[]): Set<string> {
  const paths = new Set<string>();
  for (const gap of gaps) {
    const raw = typeof gap.path === 'string' ? gap.path.trim() : '';
    if (!raw) continue;
    const normalized = normalizePath(raw);
    paths.add(normalized);
    for (const rootKey of rootKeys) {
      const root = normalizePath(rootKey);
      if (normalized !== root && !normalized.startsWith(root + '/')) {
        paths.add(root + '/' + normalized);
      }
    }
  }
  return paths;
}

function countDescendants(
  collection: Set<string> | Map<string, unknown>,
  path: string,
  includeExact: boolean
): number {
  let count = 0;
  for (const key of collection.keys()) {
    if (key === path) {
      if (includeExact) count += 1;
      continue;
    }
    if (key.startsWith(path + '/')) count += 1;
  }
  return count;
}

function requirementsToRenderModel(value: unknown): PrdRenderRequirement[] {
  if (Array.isArray(value)) return value.flatMap((item) => requirementToRenderModel(item));
  const record = toRecordOrNull(value);
  if (!record) return [];
  return Object.entries(record).flatMap(([key, item]) => requirementToRenderModel(item, key));
}

function requirementToRenderModel(value: unknown, fallbackTitle = ''): PrdRenderRequirement[] {
  const record = toRecordOrNull(value);
  if (!record) return [];
  return [
    {
      acceptance: scalarToString(record.acceptance),
      priority: scalarToString(record.priority),
      title: scalarToString(record.title) || fallbackTitle,
    },
  ];
}

function valueType(value: unknown): string {
  if (Array.isArray(value) || isArrayLikeRecord(value)) return 'array';
  if (value === null) return 'null';
  return typeof value === 'object' ? 'object' : typeof value;
}

function valueSummary(value: unknown): string {
  if (Array.isArray(value)) return itemCount(value.length);
  if (isArrayLikeRecord(value)) return itemCount(Object.keys(toRecord(value)).length);
  if (value && typeof value === 'object') return '-';
  if (isEmptyScalar(value)) return 'empty';
  return String(value);
}

function itemCount(count: number): string {
  return String(count) + ' item' + (count === 1 ? '' : 's');
}

function isExpandable(value: unknown): boolean {
  return Array.isArray(value) || (value !== null && typeof value === 'object');
}

function isArrayLikeRecord(value: unknown): boolean {
  const record = toRecordOrNull(value);
  if (!record) return false;
  const keys = Object.keys(record);
  return keys.length > 0 && keys.every((key) => /^\d+$/.test(key));
}

function isEmptyScalar(value: unknown): boolean {
  return value === null || value === undefined || value === '';
}

function scalarToString(value: unknown): string {
  if (isEmptyScalar(value)) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return '';
}

function normalizePath(path: string): string {
  return path
    .replace(/^\$\.?/, '')
    .replace(/\[(\d+)\]/g, '.$1')
    .replace(/\\/g, '/')
    .replace(/\./g, '/')
    .replace(/\/+/g, '/')
    .replace(/^\/+|\/+$/g, '');
}

function paddedOperationIndex(index: number): string {
  return String(index).padStart(2, '0');
}

function firstString(...values: unknown[]): string | null {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value;
  }
  return null;
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function toRecord(value: unknown): Record<string, unknown> {
  return toRecordOrNull(value) ?? {};
}

function toRecordOrNull(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

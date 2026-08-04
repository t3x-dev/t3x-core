import { canonicalizeYOps, parseYOpsYaml } from '@t3x-dev/core';
import type { WorkspaceYOpsDraftOperation } from '@/types/workspaces';
import type { WorkspaceYOpsValue } from '@/types/workspaceYops';

type RawYOp = Record<string, unknown>;

export type WorkspaceYOpsScriptParseResult =
  | { ok: true; operations: WorkspaceYOpsDraftOperation[] }
  | { ok: false; error: string };

interface ParseWorkspaceYOpsScriptOptions {
  currentOperations: WorkspaceYOpsDraftOperation[];
  rootKey: string;
}

const SUPPORTED_OPS = new Set([
  'set',
  'append',
  'add',
  'define',
  'create',
  'drop',
  'delete',
  'unset',
]);

export function parseWorkspaceYOpsScript(
  script: string,
  { currentOperations, rootKey }: ParseWorkspaceYOpsScriptOptions
): WorkspaceYOpsScriptParseResult {
  if (!script.trim()) return { ok: true, operations: [] };

  const parsed = parseYOpsYaml(script);
  if (!parsed.ok) return { ok: false, error: parsed.error };

  const rawOps: RawYOp[] = [];
  for (const [index, op] of (parsed.ops as unknown[]).entries()) {
    if (!isRecord(op)) {
      return { ok: false, error: `YOps operation ${index + 1} must use a mapping.` };
    }
    rawOps.push(op);
  }

  const canonicalOps = canonicalizeYOps(rawOps);
  const operations: WorkspaceYOpsDraftOperation[] = [];

  for (const [index, rawOp] of canonicalOps.entries()) {
    const converted = workspaceOperationFromRawYOp(rawOp, index, currentOperations, rootKey);
    if (!converted.ok) return converted;
    operations.push(converted.operation);
  }

  return { ok: true, operations };
}

function workspaceOperationFromRawYOp(
  rawOp: RawYOp,
  index: number,
  currentOperations: WorkspaceYOpsDraftOperation[],
  rootKey: string
): { ok: true; operation: WorkspaceYOpsDraftOperation } | { ok: false; error: string } {
  const opNames = Object.keys(rawOp).filter((key) => key !== 'source');
  if (opNames.length !== 1) {
    return {
      ok: false,
      error: `YOps operation ${index + 1} must contain exactly one operation key.`,
    };
  }

  const opName = opNames[0]?.trim().toLowerCase() ?? '';
  if (!SUPPORTED_OPS.has(opName)) {
    return {
      ok: false,
      error: `Unsupported Workspace YOps operation "${opName}" at row ${index + 1}.`,
    };
  }

  const payload = rawOp[opNames[0] ?? ''];
  if (!isRecord(payload)) {
    return { ok: false, error: `YOps operation ${index + 1} must use a mapping payload.` };
  }

  const path = typeof payload.path === 'string' ? payload.path.trim() : '';
  if (!path) return { ok: false, error: `YOps operation ${index + 1} is missing path.` };

  const workspaceOpName = workspaceOperationName(opName);
  const workspacePath = normalizeWorkspacePath(path, rootKey, workspaceOpName === 'add');
  const existing = findExistingOperation(currentOperations, workspaceOpName, workspacePath, index);
  const next: WorkspaceYOpsDraftOperation = {
    id: existing?.id ?? `op_manual_${index + 1}`,
    op: workspaceOpName,
    path: workspacePath,
    summary: operationSummary(payload, existing, workspaceOpName, workspacePath),
    ...(existing?.beforeValue !== undefined ? { beforeValue: existing.beforeValue } : {}),
    ...(operationReason(payload, existing) ? { reason: operationReason(payload, existing) } : {}),
    ...(operationSourceRefs(payload, existing)?.length
      ? { sourceRefs: operationSourceRefs(payload, existing) }
      : {}),
  };

  if (workspaceOpName === 'set' || workspaceOpName === 'add') {
    if (!('value' in payload)) {
      return {
        ok: false,
        error: `${workspaceOpName.toUpperCase()} operation ${index + 1} is missing value.`,
      };
    }
    next.afterValue = workspaceYOpsValue(payload.value);
  }

  return { ok: true, operation: next };
}

function workspaceOperationName(opName: string): WorkspaceYOpsDraftOperation['op'] {
  if (opName === 'append' || opName === 'add') return 'add';
  if (opName === 'create' || opName === 'define') return 'define';
  if (opName === 'delete' || opName === 'drop') return 'drop';
  return opName;
}

function normalizeWorkspacePath(path: string, rootKey: string, append: boolean): string {
  const segments = path
    .replace(/\/-$/, '')
    .split('/')
    .map((segment) => segment.trim())
    .filter(Boolean);
  if (segments[0] !== rootKey) segments.unshift(rootKey);
  const normalized = segments.join('/');
  return append ? `${normalized}/-` : normalized;
}

function findExistingOperation(
  currentOperations: WorkspaceYOpsDraftOperation[],
  opName: string,
  path: string,
  index: number
): WorkspaceYOpsDraftOperation | undefined {
  const normalizedPath = path.replace(/\/-$/, '');
  return (
    currentOperations.find(
      (operation) =>
        workspaceOperationName(operation.op) === opName &&
        operation.path.replace(/\/-$/, '') === normalizedPath
    ) ?? currentOperations[index]
  );
}

function operationSummary(
  payload: Record<string, unknown>,
  existing: WorkspaceYOpsDraftOperation | undefined,
  opName: string,
  path: string
): string {
  if (typeof payload.summary === 'string' && payload.summary.trim()) return payload.summary.trim();
  if (existing?.summary) return existing.summary;
  if (opName === 'add') return `Append ${path.replace(/\/-$/, '')} from edited YOps.`;
  if (opName === 'define') return `Define ${path} from edited YOps.`;
  if (opName === 'drop') return `Drop ${path} from edited YOps.`;
  if (opName === 'unset') return `Unset ${path} from edited YOps.`;
  return `Set ${path} from edited YOps.`;
}

function operationReason(
  payload: Record<string, unknown>,
  existing: WorkspaceYOpsDraftOperation | undefined
): string | undefined {
  if (typeof payload.reason === 'string' && payload.reason.trim()) return payload.reason.trim();
  return existing?.reason;
}

function operationSourceRefs(
  payload: Record<string, unknown>,
  existing: WorkspaceYOpsDraftOperation | undefined
): string[] | undefined {
  const sourceRefs = payload.source_refs ?? payload.sourceRefs;
  if (Array.isArray(sourceRefs)) {
    const refs = sourceRefs.filter(
      (ref): ref is string => typeof ref === 'string' && ref.trim().length > 0
    );
    if (refs.length > 0) return refs;
  }
  return existing?.sourceRefs;
}

function workspaceYOpsValue(value: unknown): WorkspaceYOpsValue {
  if (
    value === null ||
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean'
  ) {
    return value;
  }
  if (Array.isArray(value)) return value.map(workspaceYOpsValue);
  if (isRecord(value)) {
    return Object.fromEntries(
      Object.entries(value).map(([key, childValue]) => [key, workspaceYOpsValue(childValue)])
    );
  }
  return String(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

export function workspaceYOpsScriptForEditor(lines: string[]): string {
  const text = lines.join('\n');
  return text.startsWith('yops:') ? text : 'yops:\n';
}

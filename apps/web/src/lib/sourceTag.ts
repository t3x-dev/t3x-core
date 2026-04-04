import type { YOp } from '@t3x-dev/core';

export type SourceTag = 'user' | 'llm' | 'both';

function parseTurnTag(from: string): number | null {
  const match = from.match(/^T(\d+)/);
  return match ? Number.parseInt(match[1], 10) - 1 : null;
}

function getRootKey(op: YOp): string | null {
  if ('define' in op) return op.define.key;
  if ('populate' in op) return op.populate.path.split('.')[0];
  if ('set' in op) return op.set.path.split('.')[0];
  if ('unset' in op) return op.unset.path.split('.')[0];
  if ('drop' in op) return op.drop.path.split('.')[0];
  if ('rename' in op) return op.rename.path.split('.')[0];
  return null;
}

function getFrom(op: YOp): string | null {
  if ('populate' in op) return op.populate.from ?? null;
  if ('set' in op) return op.set.from ?? null;
  return null;
}

export function deriveSourceTags(
  delta: YOp[],
  messages: Array<{ role: string }>
): Record<string, SourceTag> {
  const rolesPerNode = new Map<string, Set<string>>();

  for (const op of delta) {
    const key = getRootKey(op);
    const from = getFrom(op);
    if (!key || !from) continue;

    const turnIdx = parseTurnTag(from);
    if (turnIdx == null || turnIdx < 0 || turnIdx >= messages.length) continue;

    const role = messages[turnIdx].role;
    if (!rolesPerNode.has(key)) {
      rolesPerNode.set(key, new Set());
    }
    rolesPerNode.get(key)!.add(role);
  }

  const result: Record<string, SourceTag> = {};
  for (const [key, roles] of rolesPerNode) {
    if (roles.has('user') && roles.has('assistant')) {
      result[key] = 'both';
    } else if (roles.has('user')) {
      result[key] = 'user';
    } else {
      result[key] = 'llm';
    }
  }
  return result;
}

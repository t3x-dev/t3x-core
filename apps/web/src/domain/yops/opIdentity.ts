import type { SourcedYOp, YOp } from '@t3x-dev/core';

const IDENTITY_SEPARATOR = '\u0000';

export type OpIdentity = {
  kind: string;
  primaryPath: string | null;
  payloadHash: string;
};

type OpBody = Record<string, unknown>;

type IdentityInput = SourcedYOp | YOp | Record<string, unknown>;

export function stripYOpSource(op: IdentityInput): OpBody {
  const { source: _drop, ...body } = op as unknown as OpBody;
  return body;
}

export function getOpKind(op: IdentityInput): string {
  const body = stripYOpSource(op);
  return Object.keys(body)[0] ?? 'unknown';
}

export function getPrimaryPath(op: IdentityInput): string | null {
  const body = stripYOpSource(op);
  const kind = Object.keys(body)[0];
  if (!kind) return null;

  const payload = body[kind];
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return null;

  const fields = payload as Record<string, unknown>;
  if (typeof fields.path === 'string') return fields.path;
  if (typeof fields.from === 'string' && typeof fields.to === 'string') {
    return `${fields.from}->${fields.to}`;
  }
  if (typeof fields.from === 'string') return fields.from;
  return null;
}

export function buildOpIdentity(op: IdentityInput): OpIdentity {
  const body = stripYOpSource(op);
  return {
    kind: getOpKind(op),
    primaryPath: getPrimaryPath(op),
    payloadHash: hashString(stableJson(body)),
  };
}

export function opIdentityKey(identity: OpIdentity): string {
  return [identity.kind, identity.primaryPath ?? '', identity.payloadHash].join(IDENTITY_SEPARATOR);
}

export function opPathKey(identity: OpIdentity): string {
  return [identity.kind, identity.primaryPath ?? ''].join(IDENTITY_SEPARATOR);
}

function stableJson(value: unknown): string {
  return JSON.stringify(sortJsonValue(value));
}

function sortJsonValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortJsonValue);
  }

  if (!value || typeof value !== 'object') {
    return value;
  }

  const object = value as Record<string, unknown>;
  return Object.keys(object)
    .sort()
    .reduce<Record<string, unknown>>((sorted, key) => {
      sorted[key] = sortJsonValue(object[key]);
      return sorted;
    }, {});
}

function hashString(value: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

import {
  type CommitV2,
  type ObjectDescriptor,
  type ObjectResolver,
  type ProtocolObject,
  parseSerializedTransitionObject,
  serializeTransitionObject,
  verifyCommitV2,
} from '@t3x-dev/core';

/** Records for repository/graph.ndjson; membership is distinct from object identity. */
export type ArchiveRepositoryRecord =
  | { record: 'object'; descriptor: ObjectDescriptor; canonicalJson: string }
  | { record: 'commit'; digest: string }
  | { record: 'ref'; name: string; head: string | null };

export class ArchiveRepositoryGraphError extends Error {
  constructor(
    readonly code:
      | 'INVALID_RECORD'
      | 'LIMIT_EXCEEDED'
      | 'DUPLICATE_RECORD'
      | 'INCOMPLETE_GRAPH'
      | 'INVALID_GRAPH'
  ) {
    // Archive content, source names, and protocol parser diagnostics may be private.
    super(code);
    this.name = 'ArchiveRepositoryGraphError';
  }
}

const DIGEST = /^sha256:[a-f0-9]{64}$/;
const encoder = new TextEncoder();
function fail(code: ArchiveRepositoryGraphError['code']): never {
  throw new ArchiveRepositoryGraphError(code);
}

function object(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function keys(value: Record<string, unknown>, expected: string[]) {
  const actual = Object.keys(value);
  return actual.length === expected.length && expected.every((key) => actual.includes(key));
}
function digest(value: unknown): value is string {
  return typeof value === 'string' && DIGEST.test(value);
}

/**
 * Validate an archive-local repository graph with the canonical protocol verifier.
 * No DB/network fallback, writes, policy evaluation, replay, or restore authorization.
 * The caller must first verify the archive envelope and the other five payloads.
 */
export async function verifyArchiveRepositoryGraph(records: Iterable<unknown>) {
  const objects = new Map<string, { value: ProtocolObject; bytes: Uint8Array }>();
  const commits = new Set<string>();
  const refs = new Map<string, string | null>();
  let recordCount = 0;
  let totalBytes = 0;
  for (const record of records) {
    if (++recordCount > 100_000) fail('LIMIT_EXCEEDED');
    if (!object(record)) fail('INVALID_RECORD');
    if (record.record === 'object') {
      if (
        !keys(record, ['record', 'descriptor', 'canonicalJson']) ||
        typeof record.canonicalJson !== 'string' ||
        !object(record.descriptor) ||
        !keys(record.descriptor, ['kind', 'schema', 'digest'])
      )
        fail('INVALID_RECORD');
      const bytes = encoder.encode(record.canonicalJson);
      totalBytes += bytes.byteLength;
      if (bytes.byteLength > 4 * 1024 * 1024 || totalBytes > 64 * 1024 * 1024)
        fail('LIMIT_EXCEEDED');
      try {
        const value = parseSerializedTransitionObject(record.canonicalJson);
        const serialized = serializeTransitionObject(value);
        if (
          serialized.canonicalJson !== record.canonicalJson ||
          serialized.descriptor.kind !== record.descriptor.kind ||
          serialized.descriptor.schema !== record.descriptor.schema ||
          serialized.descriptor.digest !== record.descriptor.digest
        )
          fail('INVALID_RECORD');
        if (objects.has(serialized.descriptor.digest)) fail('DUPLICATE_RECORD');
        objects.set(serialized.descriptor.digest, { value, bytes });
      } catch (error) {
        if (error instanceof ArchiveRepositoryGraphError) throw error;
        fail('INVALID_RECORD');
      }
    } else if (record.record === 'commit') {
      if (!keys(record, ['record', 'digest']) || !digest(record.digest)) fail('INVALID_RECORD');
      if (commits.has(record.digest)) fail('DUPLICATE_RECORD');
      commits.add(record.digest);
    } else if (record.record === 'ref') {
      if (
        !keys(record, ['record', 'name', 'head']) ||
        typeof record.name !== 'string' ||
        !record.name.trim() ||
        record.name.length > 255 ||
        [...record.name].some((char) => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127) ||
        (record.head !== null && !digest(record.head))
      )
        fail('INVALID_RECORD');
      if (refs.has(record.name)) fail('DUPLICATE_RECORD');
      refs.set(record.name, record.head);
    } else fail('INVALID_RECORD');
  }

  const resolver: ObjectResolver = {
    async get(descriptor) {
      const found = objects.get(descriptor.digest);
      if (!found) fail('INCOMPLETE_GRAPH');
      return new Uint8Array(found.bytes);
    },
  };
  for (const head of refs.values()) {
    if (head !== null && !commits.has(head)) fail('INCOMPLETE_GRAPH');
  }
  // Verify every member, not only reachable heads: detached history is still evidence.
  for (const member of commits) {
    const value = objects.get(member)?.value;
    if (!value) fail('INCOMPLETE_GRAPH');
    if (value.schema !== 't3x/commit/v2') fail('INVALID_GRAPH');
    const commit = value as CommitV2;
    for (const parent of commit.parents) {
      if (!commits.has(parent.digest)) fail('INCOMPLETE_GRAPH');
    }
    try {
      await verifyCommitV2(commit, resolver);
    } catch (error) {
      if (error instanceof ArchiveRepositoryGraphError) throw error;
      fail('INVALID_GRAPH');
    }
  }
  return Object.freeze({
    qualification: 'structural_only' as const,
    objectCount: objects.size,
    commitCount: commits.size,
    refCount: refs.size,
  });
}

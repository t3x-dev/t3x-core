import { describe, expect, it } from 'vitest';
import {
  createProjectArchiveManifest,
  describeProjectArchiveEntry,
  PROJECT_ARCHIVE_ENTRY_CONTRACT,
  type ProjectArchiveEntryKind,
  validateProjectArchiveManifest,
  verifyProjectArchive,
} from '../backup/project-archive';

const encoder = new TextEncoder();
const kinds = Object.keys(PROJECT_ARCHIVE_ENTRY_CONTRACT) as ProjectArchiveEntryKind[];

function fixture() {
  const payloads = new Map(
    kinds.map((kind, index) => {
      const content = encoder.encode(`${JSON.stringify({ kind, index })}\n`);
      return [PROJECT_ARCHIVE_ENTRY_CONTRACT[kind].path, content] as const;
    })
  );
  const manifest = createProjectArchiveManifest({
    exportedAt: new Date('2026-09-02T00:00:00.000Z'),
    source: {
      projectId: 'project-1',
      projectName: 'Verified project',
      coreSchemaVersion: 72,
      commitModel: 'CommitV2',
    },
    entries: kinds
      .map((kind) =>
        describeProjectArchiveEntry(
          kind,
          payloads.get(PROJECT_ARCHIVE_ENTRY_CONTRACT[kind].path)!,
          1
        )
      )
      .reverse(),
  });
  return { manifest, payloads };
}

function withPayload(kind: ProjectArchiveEntryKind, content: Uint8Array, records: number) {
  const { manifest, payloads } = fixture();
  payloads.set(PROJECT_ARCHIVE_ENTRY_CONTRACT[kind].path, content);
  return {
    payloads,
    manifest: createProjectArchiveManifest({
      exportedAt: new Date(manifest.exportedAt),
      source: manifest.source,
      entries: manifest.entries.map((entry) =>
        entry.kind === kind ? describeProjectArchiveEntry(kind, content, records) : entry
      ),
    }),
  };
}

describe('project archive manifest', () => {
  it('creates a canonical, tenant-safe manifest independent of input entry order', () => {
    const { manifest } = fixture();

    expect(manifest.entries.map(({ kind }) => kind)).toEqual(kinds);
    expect(manifest.restorePolicy).toEqual({
      createsNewProject: true,
      visibility: 'private',
      authority: 'server_resolved_target_namespace',
      restoresMemberships: false,
      restoresCredentials: false,
      restoresBilling: false,
    });
    expect(validateProjectArchiveManifest(manifest)).toMatchObject({ valid: true, errors: [] });
  });

  it('streams and verifies every declared payload without loading an archive at once', async () => {
    const { manifest, payloads } = fixture();
    const result = await verifyProjectArchive(manifest, async function* readEntry(path) {
      const content = payloads.get(path)!;
      yield content.subarray(0, 3);
      yield content.subarray(3);
    });

    expect(result).toMatchObject({
      valid: true,
      errors: [],
      verifiedEntries: kinds.length,
    });
    expect(result.totalBytes).toBe(
      [...payloads.values()].reduce((sum, value) => sum + value.length, 0)
    );
  });

  it('rejects manifest tampering before reading payload bytes', async () => {
    const { manifest } = fixture();
    const tampered = {
      ...manifest,
      restorePolicy: { ...manifest.restorePolicy, visibility: 'public' },
    };
    let reads = 0;
    const result = await verifyProjectArchive(tampered, function* () {
      reads++;
      yield new Uint8Array();
    });

    expect(result.valid).toBe(false);
    expect(result.errors).toContain(
      'restorePolicy must preserve the tenant-safe v1 restore boundary'
    );
    expect(reads).toBe(0);
  });

  it('rejects undeclared fields instead of admitting credential or billing overlays', () => {
    const { manifest } = fixture();
    const tampered = {
      ...manifest,
      billingAccountId: 'must-not-enter-a-project-archive',
      entries: [
        { ...manifest.entries[0]!, providerCredential: 'must-not-enter-an-entry' },
        ...manifest.entries.slice(1),
      ],
    };

    const result = validateProjectArchiveManifest(tampered);

    expect(result.valid).toBe(false);
    expect(result.errors).toContain('manifest contains unknown or missing fields');
    expect(result.errors).toContain('entries[0] contains unknown or missing fields');
  });

  it('rejects missing payload kinds and duplicate paths', () => {
    const { manifest } = fixture();
    const entries = manifest.entries.slice(0, -1);
    entries.push({ ...entries[0]!, kind: entries[0]!.kind });
    const tampered = { ...manifest, entries };

    const result = validateProjectArchiveManifest(tampered);

    expect(result.valid).toBe(false);
    expect(result.errors).toContain('entry paths must be unique');
    expect(result.errors.some((error) => error.includes('outputs payload'))).toBe(true);
  });

  it('rejects truncated, oversized, and digest-mismatched payloads', async () => {
    const { manifest, payloads } = fixture();
    const first = manifest.entries[0]!;

    const truncated = await verifyProjectArchive(manifest, function* readEntry(path) {
      const content = payloads.get(path)!;
      yield path === first.path ? content.subarray(1) : content;
    });
    expect(truncated.errors).toContain(`${first.path}: byte length does not match the manifest`);

    const oversized = await verifyProjectArchive(manifest, function* readEntry(path) {
      const content = payloads.get(path)!;
      yield path === first.path ? new Uint8Array(content.length + 1) : content;
    });
    expect(oversized.errors).toContain(
      `${first.path}: entry exceeds its declared or configured byte bound`
    );

    const corrupted = await verifyProjectArchive(manifest, function* readEntry(path) {
      const content = payloads.get(path)!;
      yield path === first.path ? encoder.encode('x'.repeat(content.length)) : content;
    });
    expect(corrupted.errors).toContain(`${first.path}: SHA-256 digest does not match the manifest`);
  });

  it('enforces caller-selected import bounds before reading an entry', async () => {
    const { manifest } = fixture();
    let reads = 0;
    const result = await verifyProjectArchive(
      manifest,
      function* () {
        reads++;
        yield new Uint8Array();
      },
      { maxEntryBytes: 1, maxTotalBytes: 1 }
    );

    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain('exceeds the configured verification bounds');
    expect(reads).toBe(0);
  });

  it.each([
    ['project_metadata', '{private source text', 1, 'invalid JSON'],
    ['project_metadata', '{}{}', 1, 'invalid JSON'],
    ['project_metadata', '[]', 1, 'JSON objects'],
    ['project_metadata', '{}', 0, 'record count'],
    ['source_evidence', '{"id":1}\nnot-json\n', 2, 'invalid JSON'],
    ['source_evidence', '{"id":1}\n\n', 1, 'invalid JSON'],
    ['source_evidence', 'null\n', 1, 'JSON objects'],
    ['source_evidence', '{}\n{}\n', 1, 'record count'],
    ['source_evidence', '{}\n', 2, 'record count'],
    ['source_evidence', '', 1, 'record count'],
  ] as const)('rejects digest-valid malformed/count-mismatched %s payload %s', async (kind, text, records, error) => {
    const archive = withPayload(kind, encoder.encode(text), records);
    const result = await verifyProjectArchive(archive.manifest, function* (path) {
      yield archive.payloads.get(path)!;
    });
    expect(result.valid).toBe(false);
    expect(result.verifiedEntries).toBe(kinds.length - 1);
    expect(result.errors.some((message) => message.includes(error))).toBe(true);
    expect(result.errors.join(' ')).not.toContain('private source text');
  });

  it.each([
    '{}\n{}\n',
    '{}\r\n{}\r\n',
    '{}\n{}',
  ])('accepts supported NDJSON framing: %j', async (text) => {
    const archive = withPayload('source_evidence', encoder.encode(text), 2);
    const result = await verifyProjectArchive(archive.manifest, function* (path) {
      for (const byte of archive.payloads.get(path)!) yield Uint8Array.of(byte);
    });
    expect(result.valid).toBe(true);
  });

  it('accepts empty zero-record NDJSON and multibyte UTF-8 split across chunks', async () => {
    for (const [content, records] of [
      ['', 0],
      ['{"name":"项目 🌏"}\n', 1],
    ] as const) {
      const archive = withPayload('source_evidence', encoder.encode(content), records);
      expect(
        (
          await verifyProjectArchive(archive.manifest, function* (path) {
            for (const byte of archive.payloads.get(path)!) yield Uint8Array.of(byte);
          })
        ).valid
      ).toBe(true);
    }
  });

  it('rejects malformed UTF-8 instead of decoding replacement characters', async () => {
    const archive = withPayload(
      'source_evidence',
      Uint8Array.from([123, 34, 120, 34, 58, 34, 255, 34, 125, 10]),
      1
    );
    const result = await verifyProjectArchive(archive.manifest, function* (path) {
      for (const byte of archive.payloads.get(path)!) yield Uint8Array.of(byte);
    });
    expect(result.valid).toBe(false);
    expect(result.verifiedEntries).toBe(kinds.length - 1);
  });

  it('caps each encoded JSON record, not the aggregate size of a multi-record stream', async () => {
    const text = `${JSON.stringify({ value: 'x'.repeat(120) })}\n`;
    const archive = withPayload('source_evidence', encoder.encode(text.repeat(3)), 3);
    const read = function* (path: string) {
      yield archive.payloads.get(path)!;
    };
    const bytes = encoder.encode(text).length - 1;
    expect(
      (await verifyProjectArchive(archive.manifest, read, { maxRecordBytes: bytes })).valid
    ).toBe(true);
    const tooSmall = await verifyProjectArchive(archive.manifest, read, {
      maxRecordBytes: bytes - 1,
    });
    expect(tooSmall.errors).toContain(
      'source/evidence.ndjson: JSON record exceeds the configured byte bound'
    );
  });

  it.each([
    0,
    -1,
    NaN,
    Infinity,
    1.5,
  ])('rejects invalid record byte bound %s without reading', async (maxRecordBytes) => {
    const { manifest } = fixture();
    let reads = 0;
    const result = await verifyProjectArchive(
      manifest,
      function* () {
        reads++;
        yield new Uint8Array();
      },
      { maxRecordBytes }
    );
    expect(result.valid).toBe(false);
    expect(reads).toBe(0);
  });
});

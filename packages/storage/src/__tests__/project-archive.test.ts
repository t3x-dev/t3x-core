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
      const content = encoder.encode(`${kind}:${index}\n`);
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
});

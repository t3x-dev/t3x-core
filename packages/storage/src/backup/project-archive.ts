import { createHash } from 'node:crypto';

export const PROJECT_ARCHIVE_SCHEMA = 't3x.project-archive/v1' as const;
export const PROJECT_ARCHIVE_VERSION = 1 as const;

export const PROJECT_ARCHIVE_ENTRY_CONTRACT = Object.freeze({
  project_metadata: Object.freeze({
    path: 'project/metadata.json',
    mediaType: 'application/json',
  }),
  source_evidence: Object.freeze({
    path: 'source/evidence.ndjson',
    mediaType: 'application/x-ndjson',
  }),
  repository_graph: Object.freeze({
    path: 'repository/graph.ndjson',
    mediaType: 'application/x-ndjson',
  }),
  governance_evidence: Object.freeze({
    path: 'governance/evidence.ndjson',
    mediaType: 'application/x-ndjson',
  }),
  workspace_state: Object.freeze({
    path: 'workspace/state.ndjson',
    mediaType: 'application/x-ndjson',
  }),
  outputs: Object.freeze({
    path: 'outputs/artifacts.ndjson',
    mediaType: 'application/x-ndjson',
  }),
} as const);

export type ProjectArchiveEntryKind = keyof typeof PROJECT_ARCHIVE_ENTRY_CONTRACT;

export interface ProjectArchiveEntryDescriptor {
  kind: ProjectArchiveEntryKind;
  path: string;
  mediaType: string;
  bytes: number;
  records: number;
  digest: { algorithm: 'sha256'; hex: string };
}

export interface ProjectArchiveManifestV1 {
  schema: typeof PROJECT_ARCHIVE_SCHEMA;
  version: typeof PROJECT_ARCHIVE_VERSION;
  exportedAt: string;
  source: {
    projectId: string;
    projectName: string;
    coreSchemaVersion: number;
    commitModel: 'CommitV2';
  };
  restorePolicy: {
    createsNewProject: true;
    visibility: 'private';
    authority: 'server_resolved_target_namespace';
    restoresMemberships: false;
    restoresCredentials: false;
    restoresBilling: false;
  };
  entries: ProjectArchiveEntryDescriptor[];
  archiveDigest: { algorithm: 'sha256'; hex: string };
}

export interface ProjectArchiveManifestInput {
  exportedAt?: Date;
  source: ProjectArchiveManifestV1['source'];
  entries: ProjectArchiveEntryDescriptor[];
}

export interface ProjectArchiveValidationResult {
  valid: boolean;
  errors: string[];
  manifest?: ProjectArchiveManifestV1;
}

export interface ProjectArchiveVerificationResult extends ProjectArchiveValidationResult {
  verifiedEntries: number;
  totalBytes: number;
}

export type ProjectArchiveEntryReader = (
  path: string
) => AsyncIterable<Uint8Array> | Iterable<Uint8Array>;

export interface ProjectArchiveVerificationLimits {
  maxEntryBytes?: number;
  maxTotalBytes?: number;
  /** Maximum encoded bytes per JSON object, excluding the NDJSON line delimiter. */
  maxRecordBytes?: number;
}

const SHA256_HEX = /^[a-f0-9]{64}$/;
const ENTRY_KINDS = Object.keys(PROJECT_ARCHIVE_ENTRY_CONTRACT) as ProjectArchiveEntryKind[];
const ENTRY_KIND_ORDER = new Map(ENTRY_KINDS.map((kind, index) => [kind, index]));
const DEFAULT_MAX_ENTRY_BYTES = 256 * 1024 * 1024;
const DEFAULT_MAX_TOTAL_BYTES = 1024 * 1024 * 1024;
const DEFAULT_MAX_RECORD_BYTES = 4 * 1024 * 1024;

/** Bounded syntax/framing validation only, not graph closure or protocol verification. */
function entryRecordValidator(entry: ProjectArchiveEntryDescriptor, maxRecordBytes: number) {
  let decoder = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true });
  let text = '';
  let bytes = 0;
  let records = 0;
  const append = (part: Uint8Array) => {
    bytes += part.byteLength;
    if (bytes > maxRecordBytes)
      throw new RangeError('JSON record exceeds the configured byte bound');
    text += decoder.decode(part, { stream: true });
  };
  const finishRecord = () => {
    text += decoder.decode();
    let value: unknown;
    try {
      value = JSON.parse(text);
    } catch {
      // Do not return archive content (potentially private source text) in diagnostics.
      throw new TypeError('payload contains invalid JSON');
    }
    if (!isRecord(value)) throw new TypeError('payload records must be JSON objects');
    records++;
    if (records > entry.records) throw new TypeError('record count does not match the manifest');
    text = '';
    bytes = 0;
    decoder = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true });
  };
  return {
    write(chunk: Uint8Array) {
      if (entry.mediaType === 'application/json') {
        append(chunk);
        return;
      }
      let offset = 0;
      for (let newline = chunk.indexOf(10); newline !== -1; newline = chunk.indexOf(10, offset)) {
        append(chunk.subarray(offset, newline));
        finishRecord();
        offset = newline + 1;
      }
      append(chunk.subarray(offset));
    },
    finish() {
      if (entry.mediaType === 'application/json' || bytes > 0) finishRecord();
      if (records !== entry.records)
        throw new TypeError('record count does not match the manifest');
    },
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasExactKeys(value: Record<string, unknown>, expected: readonly string[]): boolean {
  const actual = Object.keys(value).sort();
  return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function isNonNegativeSafeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

function isPositiveSafeInteger(value: unknown): value is number {
  return isNonNegativeSafeInteger(value) && value > 0;
}

function isCanonicalInstant(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const instant = new Date(value);
  return Number.isFinite(instant.getTime()) && instant.toISOString() === value;
}

function orderedEntries(entries: ProjectArchiveEntryDescriptor[]): ProjectArchiveEntryDescriptor[] {
  return [...entries].sort((left, right) => {
    const kindOrder =
      (ENTRY_KIND_ORDER.get(left.kind) ?? Number.MAX_SAFE_INTEGER) -
      (ENTRY_KIND_ORDER.get(right.kind) ?? Number.MAX_SAFE_INTEGER);
    return kindOrder || left.path.localeCompare(right.path);
  });
}

function archiveDigestPayload(manifest: Omit<ProjectArchiveManifestV1, 'archiveDigest'>): string {
  return JSON.stringify({
    schema: manifest.schema,
    version: manifest.version,
    exportedAt: manifest.exportedAt,
    source: {
      projectId: manifest.source.projectId,
      projectName: manifest.source.projectName,
      coreSchemaVersion: manifest.source.coreSchemaVersion,
      commitModel: manifest.source.commitModel,
    },
    restorePolicy: {
      createsNewProject: manifest.restorePolicy.createsNewProject,
      visibility: manifest.restorePolicy.visibility,
      authority: manifest.restorePolicy.authority,
      restoresMemberships: manifest.restorePolicy.restoresMemberships,
      restoresCredentials: manifest.restorePolicy.restoresCredentials,
      restoresBilling: manifest.restorePolicy.restoresBilling,
    },
    entries: manifest.entries.map((entry) => ({
      kind: entry.kind,
      path: entry.path,
      mediaType: entry.mediaType,
      bytes: entry.bytes,
      records: entry.records,
      digest: { algorithm: entry.digest.algorithm, hex: entry.digest.hex },
    })),
  });
}

function sha256(value: string | Uint8Array): string {
  return createHash('sha256').update(value).digest('hex');
}

function validateEntry(value: unknown, index: number, errors: string[]): void {
  if (!isRecord(value)) {
    errors.push(`entries[${index}] must be an object`);
    return;
  }
  if (!hasExactKeys(value, ['bytes', 'digest', 'kind', 'mediaType', 'path', 'records'])) {
    errors.push(`entries[${index}] contains unknown or missing fields`);
  }
  const kind = value.kind;
  if (typeof kind !== 'string' || !(kind in PROJECT_ARCHIVE_ENTRY_CONTRACT)) {
    errors.push(`entries[${index}].kind is not supported`);
    return;
  }
  const contract = PROJECT_ARCHIVE_ENTRY_CONTRACT[kind as ProjectArchiveEntryKind];
  if (value.path !== contract.path) errors.push(`entries[${index}].path does not match its kind`);
  if (value.mediaType !== contract.mediaType) {
    errors.push(`entries[${index}].mediaType does not match its kind`);
  }
  if (!isNonNegativeSafeInteger(value.bytes)) {
    errors.push(`entries[${index}].bytes must be a non-negative safe integer`);
  }
  if (!isNonNegativeSafeInteger(value.records)) {
    errors.push(`entries[${index}].records must be a non-negative safe integer`);
  }
  if (!isRecord(value.digest)) {
    errors.push(`entries[${index}].digest must be a lowercase SHA-256 digest`);
  } else if (
    !hasExactKeys(value.digest, ['algorithm', 'hex']) ||
    value.digest.algorithm !== 'sha256' ||
    typeof value.digest.hex !== 'string' ||
    !SHA256_HEX.test(value.digest.hex)
  ) {
    errors.push(`entries[${index}].digest must be a lowercase SHA-256 digest`);
  }
}

/**
 * Validate the immutable archive envelope without reading payload bytes.
 * Payload verification is performed separately by verifyProjectArchive.
 */
export function validateProjectArchiveManifest(input: unknown): ProjectArchiveValidationResult {
  const errors: string[] = [];
  if (!isRecord(input)) return { valid: false, errors: ['manifest must be an object'] };
  if (
    !hasExactKeys(input, [
      'archiveDigest',
      'entries',
      'exportedAt',
      'restorePolicy',
      'schema',
      'source',
      'version',
    ])
  ) {
    errors.push('manifest contains unknown or missing fields');
  }

  if (input.schema !== PROJECT_ARCHIVE_SCHEMA) errors.push('manifest schema is unsupported');
  if (input.version !== PROJECT_ARCHIVE_VERSION) errors.push('manifest version is unsupported');
  if (!isCanonicalInstant(input.exportedAt))
    errors.push('exportedAt must be a canonical UTC instant');

  if (!isRecord(input.source)) {
    errors.push('source must be an object');
  } else {
    if (
      !hasExactKeys(input.source, ['commitModel', 'coreSchemaVersion', 'projectId', 'projectName'])
    ) {
      errors.push('source contains unknown or missing fields');
    }
    if (!isNonEmptyString(input.source.projectId)) errors.push('source.projectId is required');
    if (!isNonEmptyString(input.source.projectName)) errors.push('source.projectName is required');
    if (!isPositiveSafeInteger(input.source.coreSchemaVersion)) {
      errors.push('source.coreSchemaVersion must be a positive safe integer');
    }
    if (input.source.commitModel !== 'CommitV2') errors.push('source.commitModel must be CommitV2');
  }

  if (!isRecord(input.restorePolicy)) {
    errors.push('restorePolicy must be an object');
  } else {
    if (
      !hasExactKeys(input.restorePolicy, [
        'authority',
        'createsNewProject',
        'restoresBilling',
        'restoresCredentials',
        'restoresMemberships',
        'visibility',
      ])
    ) {
      errors.push('restorePolicy contains unknown or missing fields');
    }
    if (
      input.restorePolicy.createsNewProject !== true ||
      input.restorePolicy.visibility !== 'private' ||
      input.restorePolicy.authority !== 'server_resolved_target_namespace' ||
      input.restorePolicy.restoresMemberships !== false ||
      input.restorePolicy.restoresCredentials !== false ||
      input.restorePolicy.restoresBilling !== false
    ) {
      errors.push('restorePolicy must preserve the tenant-safe v1 restore boundary');
    }
  }

  if (!Array.isArray(input.entries)) {
    errors.push('entries must be an array');
  } else {
    input.entries.forEach((entry, index) => validateEntry(entry, index, errors));
    const kinds = input.entries
      .filter(isRecord)
      .map((entry) => entry.kind)
      .filter((kind): kind is string => typeof kind === 'string');
    for (const kind of ENTRY_KINDS) {
      const count = kinds.filter((candidate) => candidate === kind).length;
      if (count !== 1) errors.push(`entries must contain exactly one ${kind} payload`);
    }
    if (input.entries.length !== ENTRY_KINDS.length) {
      errors.push(`entries must contain exactly ${ENTRY_KINDS.length} payloads`);
    }
    const paths = input.entries
      .filter(isRecord)
      .map((entry) => entry.path)
      .filter((path): path is string => typeof path === 'string');
    if (new Set(paths).size !== paths.length) errors.push('entry paths must be unique');

    const currentOrder = input.entries
      .filter(isRecord)
      .map((entry) => entry.kind)
      .filter((kind): kind is ProjectArchiveEntryKind =>
        typeof kind === 'string' ? kind in PROJECT_ARCHIVE_ENTRY_CONTRACT : false
      );
    if (
      currentOrder.length === ENTRY_KINDS.length &&
      currentOrder.join('\0') !== ENTRY_KINDS.join('\0')
    ) {
      errors.push('entries must use canonical kind order');
    }
  }

  if (!isRecord(input.archiveDigest)) {
    errors.push('archiveDigest must be a lowercase SHA-256 digest');
  } else if (
    !hasExactKeys(input.archiveDigest, ['algorithm', 'hex']) ||
    input.archiveDigest.algorithm !== 'sha256' ||
    typeof input.archiveDigest.hex !== 'string' ||
    !SHA256_HEX.test(input.archiveDigest.hex)
  ) {
    errors.push('archiveDigest must be a lowercase SHA-256 digest');
  }

  if (errors.length > 0) return { valid: false, errors };
  const manifest = input as unknown as ProjectArchiveManifestV1;
  const { archiveDigest, ...payload } = manifest;
  if (archiveDigest.hex !== sha256(archiveDigestPayload(payload))) {
    return { valid: false, errors: ['archiveDigest does not match the manifest'] };
  }
  return { valid: true, errors: [], manifest };
}

/** Build a canonical manifest after all payload descriptors have been produced. */
export function createProjectArchiveManifest(
  input: ProjectArchiveManifestInput
): ProjectArchiveManifestV1 {
  const payload: Omit<ProjectArchiveManifestV1, 'archiveDigest'> = {
    schema: PROJECT_ARCHIVE_SCHEMA,
    version: PROJECT_ARCHIVE_VERSION,
    exportedAt: (input.exportedAt ?? new Date()).toISOString(),
    source: {
      projectId: input.source.projectId,
      projectName: input.source.projectName,
      coreSchemaVersion: input.source.coreSchemaVersion,
      commitModel: input.source.commitModel,
    },
    restorePolicy: {
      createsNewProject: true,
      visibility: 'private',
      authority: 'server_resolved_target_namespace',
      restoresMemberships: false,
      restoresCredentials: false,
      restoresBilling: false,
    },
    entries: orderedEntries(input.entries).map((entry) => ({
      ...entry,
      digest: { ...entry.digest },
    })),
  };
  const manifest: ProjectArchiveManifestV1 = {
    ...payload,
    archiveDigest: { algorithm: 'sha256', hex: sha256(archiveDigestPayload(payload)) },
  };
  const validation = validateProjectArchiveManifest(manifest);
  if (!validation.valid) throw new TypeError(validation.errors.join('; '));
  return manifest;
}

/**
 * Verify every payload using bounded streaming reads. This is suitable for
 * untrusted imports and does not require loading the entire archive in memory.
 */
export async function verifyProjectArchive(
  input: unknown,
  readEntry: ProjectArchiveEntryReader,
  limits: ProjectArchiveVerificationLimits = {}
): Promise<ProjectArchiveVerificationResult> {
  const validation = validateProjectArchiveManifest(input);
  if (!validation.valid || !validation.manifest) {
    return { ...validation, verifiedEntries: 0, totalBytes: 0 };
  }

  const maxEntryBytes = limits.maxEntryBytes ?? DEFAULT_MAX_ENTRY_BYTES;
  const maxTotalBytes = limits.maxTotalBytes ?? DEFAULT_MAX_TOTAL_BYTES;
  const maxRecordBytes = limits.maxRecordBytes ?? DEFAULT_MAX_RECORD_BYTES;
  if (
    !isPositiveSafeInteger(maxEntryBytes) ||
    !isPositiveSafeInteger(maxTotalBytes) ||
    !isPositiveSafeInteger(maxRecordBytes)
  ) {
    return {
      valid: false,
      errors: ['verification limits must be positive safe integers'],
      verifiedEntries: 0,
      totalBytes: 0,
    };
  }

  let verifiedEntries = 0;
  let totalBytes = 0;
  const errors: string[] = [];
  for (const entry of validation.manifest.entries) {
    if (entry.bytes > maxEntryBytes || totalBytes + entry.bytes > maxTotalBytes) {
      errors.push(`${entry.path} exceeds the configured verification bounds`);
      break;
    }
    const digest = createHash('sha256');
    const records = entryRecordValidator(entry, maxRecordBytes);
    let recordError: string | undefined;
    let entryBytes = 0;
    try {
      for await (const chunk of readEntry(entry.path)) {
        if (!(chunk instanceof Uint8Array)) throw new TypeError('entry reader returned non-bytes');
        entryBytes += chunk.byteLength;
        if (entryBytes > entry.bytes || entryBytes > maxEntryBytes) {
          throw new RangeError('entry exceeds its declared or configured byte bound');
        }
        digest.update(chunk);
        if (!recordError) {
          try {
            records.write(chunk);
          } catch (error) {
            recordError = error instanceof Error ? error.message : 'invalid payload records';
          }
        }
      }
    } catch (error) {
      errors.push(`${entry.path}: ${error instanceof Error ? error.message : String(error)}`);
      continue;
    }
    totalBytes += entryBytes;
    if (entryBytes !== entry.bytes) {
      errors.push(`${entry.path}: byte length does not match the manifest`);
      continue;
    }
    if (digest.digest('hex') !== entry.digest.hex) {
      errors.push(`${entry.path}: SHA-256 digest does not match the manifest`);
      continue;
    }
    if (!recordError) {
      try {
        records.finish();
      } catch (error) {
        recordError = error instanceof Error ? error.message : 'invalid payload records';
      }
    }
    if (recordError) {
      errors.push(`${entry.path}: ${recordError}`);
      continue;
    }
    verifiedEntries++;
  }

  return {
    valid: errors.length === 0,
    errors,
    manifest: validation.manifest,
    verifiedEntries,
    totalBytes,
  };
}

/** Utility for exporters that have already streamed or encoded one payload. */
export function describeProjectArchiveEntry(
  kind: ProjectArchiveEntryKind,
  content: Uint8Array,
  records: number
): ProjectArchiveEntryDescriptor {
  if (!isNonNegativeSafeInteger(records)) throw new TypeError('records must be non-negative');
  const contract = PROJECT_ARCHIVE_ENTRY_CONTRACT[kind];
  return {
    kind,
    path: contract.path,
    mediaType: contract.mediaType,
    bytes: content.byteLength,
    records,
    digest: { algorithm: 'sha256', hex: sha256(content) },
  };
}

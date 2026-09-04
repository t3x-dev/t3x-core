# Project archive verification boundary

`packages/storage/src/backup/project-archive.ts` verifies the versioned archive
envelope and its six fixed-path payloads. An archive is untrusted input, not an
instruction to restore owners, credentials, memberships or billing information.

Verification checks:

- Exact manifest fields, canonical entry ordering and the manifest digest.
- Declared payload lengths, SHA-256 digests and configured entry/total byte limits.
- Strict UTF-8 decoding without replacement characters.
- One JSON object for `project/metadata.json`.
- One JSON object per non-empty NDJSON line for the other payloads. LF and CRLF
  are accepted; the final line delimiter is optional. Empty zero-record NDJSON
  is allowed, but blank lines are rejected rather than silently dropped.
- Exact agreement between parsed record counts and the manifest.
- A default 4 MiB encoded-byte limit per record, configurable with
  `maxRecordBytes`. A caller may also lower `maxEntryBytes` and `maxTotalBytes`.

Records are buffered individually, not as a whole archive. A valid digest cannot
make invalid JSON, an invalid record count, or an oversized record acceptable.
JSON syntax diagnostics never echo the offending private payload text.

This is **framing and integrity verification**, not complete project recovery.
Per-record domain schemas, canonical protocol-object verification, reference
closure, required attachments, a consistent authorized export, and atomic restore
into a new private project remain tracked by #1418. `valid: true` from this layer
does not establish those higher-level properties or authorize database writes.
Future consumers must use the existing protocol verifiers rather than duplicate
hashing/replay semantics. No account or commercial data is imported by this code.

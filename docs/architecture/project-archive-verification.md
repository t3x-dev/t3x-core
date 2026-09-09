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

## Repository payload domain checks

`verifyArchiveRepositoryGraph` separately checks `repository/graph.ndjson` records:

- `object`: exact `descriptor` and `canonicalJson`, verified by the protocol parser
  and canonical serializer. A matching archive checksum alone is insufficient.
- `commit`: a digest declaring membership in the source project's history.
- `ref`: a name and nullable head that must reference a declared member.

Every member, including detached history, passes the shared CommitV2 structural
verifier. Every parent must be a declared member; all required protocol objects
resolve from this archive only. Duplicate records and unknown fields are rejected.
The verifier bounds records (100,000), individual canonical objects (4 MiB), and
their combined bytes (64 MiB). Diagnostics do not disclose archived content.

The result explicitly says `structural_only`. It neither re-evaluates historical
policy nor executes deterministic replay, and historical actor IDs do not grant
current access. This helper does not prove that an exporter included every source
record, uncommitted workspace, attachment or governance resource. It must be
composed with envelope verification and those remaining domain checks before any
restore. No route or write is enabled by this slice; #1418 remains open.

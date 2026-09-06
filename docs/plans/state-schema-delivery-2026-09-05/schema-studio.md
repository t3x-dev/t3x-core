# Schema Studio candidate and adoption contract

Issues #1516–#1519. One Studio belongs to each target project (`main`); a redundant Studio selector is omitted. Candidates are application preparation state, not new protocol envelopes or Workspace bindings.

Candidate identity is derived from target project, artifact version ID and immutable artifact hash. Concurrent additions/retries return the same candidate. `latest` resolves to the newest published release once (publication order, not a semver upgrade policy); existing candidates never float. Expected hashes reject stale selections.

The table stores references only. Every read, compare and apply must recheck source project authority, release lifecycle and manifest integrity. Missing/deleted/revoked/archived sources become unavailable, with source labels and private metadata redacted. Removal only deletes the target candidate. Private README, presentation resources and source manifests are not copied into the candidate table. Licenses are reported as declared, never inferred. Reference addition grants no redistribution rights.

Apply is a separate explicit operation. Importing a private definition into another project requires source edit authority, so a read-only source grant cannot redistribute private structure to target readers. Public definitions require a supported declared redistribution license; built-in T3X definitions are repository-owned. Applied definitions are retained as exact project-scoped composition snapshots for reproducibility. Later source revocation blocks new previews/adoptions but does not rewrite an already authorized applied snapshot.

Reuse the existing composition compiler, diff, snapshot resolver, Workspace revision CAS and diagnostic invalidation. No AI is required. Published monolithic Schemas are selected whole; module composition uses declared Module capabilities/imports and compiler checks. Tags never confer runtime capability.

Candidate verification: PostgreSQL migration suite passed (including upgrade from v74 and duplicate-pin constraint); candidate API tests cover concurrent retries, expected-hash mismatch, target write/source read denial, revoked-source redaction, latest pinning, archive and deletion. The complete API suite initially passed 1,314 tests with one metadata-contract failure for an undeclared OpenAPI tag. Routes now reuse the existing YSchema tag; the candidate and metadata suites pass after that correction. No assertion was disabled.

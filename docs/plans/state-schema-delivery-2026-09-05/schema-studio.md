# Schema Studio candidate and adoption contract

Issues #1516–#1519. One Studio belongs to each target project (`main`); a redundant Studio selector is omitted. Candidates are application preparation state, not new protocol envelopes or Workspace bindings.

Candidate identity is derived from target project, artifact version ID and immutable artifact hash. Concurrent additions/retries return the same candidate. `latest` resolves to the newest published release once (publication order, not a semver upgrade policy); existing candidates never float. Expected hashes reject stale selections.

The table stores references only. Every read, compare and apply must recheck source project authority, release lifecycle and manifest integrity. Missing/deleted/revoked/archived sources become unavailable, with source labels and private metadata redacted. Removal only deletes the target candidate. Private README, presentation resources and source manifests are not copied into the candidate table. Licenses are reported as declared, never inferred. Reference addition grants no redistribution rights.

Apply is a separate explicit operation. Importing a private definition into another project requires source edit authority, so a read-only source grant cannot redistribute private structure to target readers. Public definitions require a supported declared redistribution license; built-in T3X definitions are repository-owned. Applied definitions are retained as exact project-scoped composition snapshots for reproducibility. Later source revocation blocks new previews/adoptions but does not rewrite an already authorized applied snapshot.

Reuse the existing composition compiler, diff, snapshot resolver, Workspace revision CAS and diagnostic invalidation. No AI is required. Published monolithic Schemas are selected whole; module composition uses declared Module capabilities/imports and compiler checks. Tags never confer runtime capability.

Candidate verification: PostgreSQL migration suite passed (including upgrade from v74 and duplicate-pin constraint); candidate API tests cover concurrent retries, expected-hash mismatch, target write/source read denial, revoked-source redaction, latest pinning, archive and deletion. The complete API suite initially passed 1,314 tests with one metadata-contract failure for an undeclared OpenAPI tag. Routes now reuse the existing YSchema tag; the candidate and metadata suites pass after that correction. No assertion was disabled.

## Review/apply API

`POST schema-studio/preview` accepts selected candidate IDs, an optional target Workspace and optional comparison candidate IDs. It returns the compiled definition, declaration issues, render plan/origins, exact sources, target contract differences and a deterministic review hash. Comparison describes definition changes, not data migration or execution. Module requirements/conflicts come from the native V2 compiler; whole published Schemas cannot be combined through hidden-field removal.

`POST schema-studio/apply` re-resolves everything and requires target edit authority, an allowed source import, the review hash and target revision. Snapshot creation and Workspace CAS happen in one database transaction. The resulting exact binding uses the existing Workspace schema resolver. Old candidate fields, operations, validation override and extraction proposal are invalidated. No content Commit or AI execution is created by binding adoption.

Tests exercise repeatable hashes/diffs, missing candidates, module dependency failures, whole-Schema boundaries, source/target authority, stale review rejection, concurrent apply (one success / one conflict), old diagnostic invalidation and exact snapshot resolution after source withdrawal. Initial tests found incomplete metadata in the synthetic unbound comparison baseline; it now uses a valid empty YSchema contract. One test expected 400 for review-required, corrected to the existing 409 contract. No checks were disabled.

## Studio experience — #1519

The default Studio surface now uses persistent candidates and real backend previews. Selection, source versions, definition reading, X-ray/code, comparison, checks, and explicit review/apply share the pinned API contract. The old detailed definition workbench remains available behind an explicit advanced action.

Required V2 imports project their last matching provider as included/locked. Legacy V1 `requires` remain suggestions under the existing open V2 adapter; no core is mandatory merely because it is tagged as core. Published whole Schemas are adopted atomically. Missing declared dependencies block apply through the native compiler. Definition checks and execution results are separate.

Schemas defaults to Active when Workspaces have bindings. Active reads current Workspace revisions and diagnostics, shows exact source versions/hashes, and links back to Workspace review/history. Other visible releases link to Browse and must enter a new review before replacing a binding. Existing releases never silently move to latest. Release discovery is paginated; absence of an alternative in the displayed catalog page is not a claim that a source is up to date.

[Real browser screenshots and failure classification](verification/studio-experience/README.md).

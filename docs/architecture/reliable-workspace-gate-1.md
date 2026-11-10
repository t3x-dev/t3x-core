# Reliable Workspace Gate 1

- Status: frozen acceptance baseline (2026-10-29)
- Owner: [@RwdEnvelope](https://github.com/RwdEnvelope)
- Milestone: [Reliable Workspace - Gate 1](https://github.com/t3x-dev/t3x-core/milestone/2)
- Owning Epic: [#1677](https://github.com/t3x-dev/t3x-core/issues/1677)

This document is the maintained acceptance contract for principal-private
server Workspaces that target a shared branch/ref. It freezes requirements and
evidence boundaries; it is not evidence that the implementation has passed the
gate.

The contract is application/product behavior. It does not add protocol nouns,
put identity inside the deterministic kernel, or make Draft a live shared
document.

## Release gates

The three product gaps remain independent gates. Passing one never implies that
another passed.

| Gate | Required outcome | Tracking | Current status |
| --- | --- | --- | --- |
| 1. Concurrency correctness | Private principal Workspaces, unified authorized writes, CAS Commit, explicit reconciliation, and protected-ref/optional-PR enforcement across Web/CLI/MCP | [Milestone 2](https://github.com/t3x-dev/t3x-core/milestone/2), [Epic #1677](https://github.com/t3x-dev/t3x-core/issues/1677) | Tasks 02-07 and 09 are implemented in the working change; live browser plus actual CLI/MCP process release acceptance remains open |
| 2. Fixed artifact/version | Prepare and deploy a fixed Commit/Artifact with exact version tracing and rollback | [Epic #1706](https://github.com/t3x-dev/t3x-core/issues/1706) | Tasks 10–11 provide deterministic portable receipts plus append-only preview deployment and rollback evidence; external runtime adapters remain later work |
| 3. Offline recovery | Complete export/import/restore and recovery in a clean environment | Tasks 11-14 in the delivery matrix; GitHub Epic required before implementation | Not started; does not block Gate 1 implementation |

## Frozen behavior

1. Principal A and principal B may target the same project branch/ref but own
   distinct persisted Workspaces.
2. `workspace_id` selects a Workspace. `project_id`, browser, browser profile,
   port, hostname, or claimed user ID cannot select or authorize a Draft.
3. The same principal's Web, CLI and MCP/Codex clients see the same Draft only
   when they explicitly select the same `workspace_id`.
4. Another principal cannot list, read or mutate an uncommitted Draft. Phase one
   has no cross-principal Draft-sharing grant.
5. Every supported write surface delegates to one authorized application
   command boundary carrying server-derived actor/delegator, `workspace_id`, a
   durable request identity, expected Workspace revision and expected ref head.
6. Commit/ref advance is compare-and-swap. Of incompatible advances from one
   old head, at most one succeeds. A losing Workspace and its Draft remain
   intact.
7. A Workspace whose target ref advanced is marked behind. No background
   overwrite, implicit rebase, automatic conflict choice or silent Draft loss
   is permitted.
8. Reconciliation exposes a deterministic preview and an explicit choice:
   sync/adopt, structured resolution, or discard. The choice and its actor are
   auditable.
9. `AUTH_DISABLED` remains an explicit local adapter bypass. It cannot qualify
   the two-principal release gate.
10. A PR is an optional collaboration path, not the definition of Commit. Ref
    protection is enforced at authoritative ref advance; stale PR readiness or
    PR creation alone can never merge.

These rules consume the canonical authority work in
[#1417](https://github.com/t3x-dev/t3x-core/issues/1417). They must not create a
second role, owner or permission evaluator.

## Execution order

| Task | GitHub owner | Depends on | Entry condition | Exit condition |
| --- | --- | --- | --- | --- |
| 01. Freeze baseline | [#1677](https://github.com/t3x-dev/t3x-core/issues/1677), @RwdEnvelope | None | Three gaps and the two-principal behavior are known | This contract, milestone, Epic, child issues, owners and evidence states exist |
| 02. Close one task loop | [#1678](https://github.com/t3x-dev/t3x-core/issues/1678), @RwdEnvelope | 01 | Frozen Draft/Review/Commit meaning | Full-stack E2E proves Draft -> Review -> Commit -> history -> fixed-State export and continuation from an exact historical Commit without a PR |
| 07. Ownership and least privilege | [#1683](https://github.com/t3x-dev/t3x-core/issues/1683), @RwdEnvelope | 01, #1417 | Canonical principal facts available | Cross-principal Workspace access fails closed across supported transports |
| 03. Unified write entry | [#1679](https://github.com/t3x-dev/t3x-core/issues/1679), @RwdEnvelope | 02, 07 | Lifecycle and authority contracts fixed | Every supported writer supplies the same guarded command facts |
| 04. Concurrency gate | [#1680](https://github.com/t3x-dev/t3x-core/issues/1680), @RwdEnvelope | 03 | No supported raw write bypass | Parallel Commit produces one advance and stable, non-destructive losers |
| 05. Branch notice and sync | [#1681](https://github.com/t3x-dev/t3x-core/issues/1681), @RwdEnvelope | 04 | Ref CAS result is authoritative | Behind detection plus preview/sync/discard passes with two principals |
| 06. Structured conflict resolution | [#1682](https://github.com/t3x-dev/t3x-core/issues/1682), @RwdEnvelope | 05 | Revision-bound reconciliation preview exists | Conflicts resolve or discard explicitly, deterministically and audibly |
| 09. Optional PR and protected refs | [#1684](https://github.com/t3x-dev/t3x-core/issues/1684), @RwdEnvelope | 04; coordinates with 06 | Ref CAS and Review/Decision evidence are authoritative | Direct Commit and PR merge obey policy; stale readiness never advances a protected ref |

Tasks 02 and 07 may proceed in parallel. After they land, follow 03 -> 04; then
run 05 -> 06 while 09 proceeds in parallel. Total Gate 1 acceptance waits for
both 06 and 09. Do not start with UI conflict or PR controls before the
ownership and CAS laws are executable.

## Requirement and evidence matrix

Evidence status uses four values:

- **landed**: a relevant implementation/test exists and has been identified;
- **partial**: a useful foundation exists but does not meet the complete row;
- **missing**: the required boundary or qualification test is not present;
- **pending qualification**: implementation may exist, but the Gate 1 suite has
  not recorded a clean result.

| ID | Requirement | Owning issue | Implementation boundary | Existing automated evidence | Status |
| --- | --- | --- | --- | --- | --- |
| RW-01 | One persisted Workspace is bound to one server-derived principal and one project/ref basis | [#1683](https://github.com/t3x-dev/t3x-core/issues/1683) | `packages/api/src/middleware/workspace-access.ts`; `packages/storage/src/queries/drafts.ts`; Workspace owner schema/index | `packages/api/src/__tests__/workspace-ownership.smoke.test.ts`; `packages/storage/src/__tests__/workspace-drafts.test.ts` | Landed in this change: owner identity is persisted, owner-filtered, unique per project/ref/owner, and enforced before Workspace route handling |
| RW-02 | Same principal + same `workspace_id` gives Web/CLI/MCP one Draft; different principals remain isolated | [#1679](https://github.com/t3x-dev/t3x-core/issues/1679), [#1683](https://github.com/t3x-dev/t3x-core/issues/1683) | `packages/api/src/middleware/workspace-access.ts`; `packages/api-client/src/workspace-authoring.ts`; `packages/mcp/src/tools/core/edit.ts`; `apps/cli/src/commands/workspace.ts`; Web Workspace hooks | `packages/api/src/__tests__/workspace-ownership.smoke.test.ts`; `packages/api/src/__tests__/contracts/workspace-writer-entrypoints.test.ts`; CLI and MCP Workspace edit tests | Landed in this change: Web, CLI and MCP use one explicit Workspace API capability for Draft and exact Schema actions; authenticated Web/MCP convergence and cross-principal denial are executable |
| RW-03 | Draft -> Review -> Commit -> history -> fixed-State export is one revision-bound task loop | [#1678](https://github.com/t3x-dev/t3x-core/issues/1678) | `packages/application/src/transition`; `packages/application/src/change/reviewSnapshots.ts`; exact historical branching and repository delivery/API routes | `apps/web/e2e/flows/workspace-post-commit.spec.ts`; `packages/api/src/__tests__/branches.test.ts`; `packages/api/src/__tests__/workspace-authoring-persistence.test.ts`; relevant Web hook/component tests | Landed in this change: full-stack E2E covers same-branch continuation, fixed export, and an independently committed Workspace pinned to an older Commit while `main` remains newer |
| RW-04 | Every supported write uses one authorized application command boundary | [#1679](https://github.com/t3x-dev/t3x-core/issues/1679) | `packages/application/src/workspace-authoring`; `packages/api/src/routes/workspace-authoring.openapi.ts`; `packages/api-client/src/workspace-authoring.ts` | Workspace authoring, API route, CLI, MCP and source-entry contract tests | Landed in this change: current writers are classified as migrated, explicit legacy adapter or prohibited; supported external writers have no storage mutation capability |
| RW-05 | Commit/ref advance checks exact Workspace revision, Review facts, `expected_head` and durable request identity | [#1680](https://github.com/t3x-dev/t3x-core/issues/1680) | `packages/application/src/repository/writers.ts`; `packages/application/src/transition/lifecycle.ts`; storage transaction | r5/r6/r7-style mixed-entry contention, exact retry, lost-response and rollback tests; formal `test:workspace-concurrency-gate` qualification | Landed in this change: one incompatible Commit advances, losers retain their Drafts, and exact retries reuse the atomic receipt |
| RW-06 | Ref advance preserves other Drafts and makes their behind state explicit | [#1681](https://github.com/t3x-dev/t3x-core/issues/1681) | `packages/storage/src/queries/transition-commits.ts`; `packages/api/src/lib/workspace-reconciliation.ts`; Workspace projection/API client | `packages/api/src/__tests__/workspace-ownership.smoke.test.ts`; `packages/api/src/__tests__/workspace-reconciliation.test.ts`; `apps/web/src/__tests__/hooks/workspaces/useProjectWorkspaces.test.ts` | Landed in this change: atomic ref advance emits `branch.advanced`; another principal's private Draft stays unchanged and its projection reports the newer target head |
| RW-07 | Preview/sync/adopt/discard is revision-bound, explicit, idempotent and auditable | [#1681](https://github.com/t3x-dev/t3x-core/issues/1681) | reconciliation service, exact API routes and shared Web/CLI/MCP API-client capability | `pnpm test:workspace-reconciliation-gate`; reconciliation service/route, Web, CLI, MCP and two-principal tests | Landed in this change: Base/Ours/Theirs preview and adopt/cancel/discard require exact revision, head and preparation digest; decisions are idempotent and audited |
| RW-08 | Structured conflicts use Base/Ours/Theirs, stable identities and explicit per-conflict choices | [#1682](https://github.com/t3x-dev/t3x-core/issues/1682) | deterministic Workspace three-way preparation, complete resolution application, bound-Schema validation and reconciliation UI | `pnpm test:workspace-structured-conflict-gate`; service, route, Web resolver, CLI and MCP tests | Landed in this change: type, mapping, collection and deletion conflicts remain structural; every conflict needs an exact choice and the complete result is revalidated before write |
| RW-09 | Actor/delegator, input revisions, choices and outcomes remain auditable without exposing private Drafts | [#1683](https://github.com/t3x-dev/t3x-core/issues/1683), [#1682](https://github.com/t3x-dev/t3x-core/issues/1682) | Workspace owner projection, authoring ledger, reconciliation archives, review snapshots and API response projections | ownership smoke, authoring, reconciliation and structured-conflict gate tests | Landed in this change: private projections fail closed; server-derived actor/delegator, preparation, revisions, conflict IDs, choices and outcomes are archived without exposing another Draft |
| RW-10 | Gate 1 is qualified by two authenticated principals across Web/CLI/MCP, not by ports or `AUTH_DISABLED` | [#1677](https://github.com/t3x-dev/t3x-core/issues/1677) | self-hosted auth/API/Web/MCP composition and acceptance harness | Automated authenticated identities `test-a` and `test-b` prove distinct same-ref Workspaces and cross-principal denial; task 04 composes API contention with Web/CLI/MCP adapter contracts | Partial: task 07 identity and task 04 concurrency qualification passed; live browser plus actual CLI/MCP process acceptance remains open for the complete Gate 1 release |
| RW-11 | Direct Commit and optional PR merge obey protected-ref policy, recompute stale readiness and keep create/review/merge distinct | [#1684](https://github.com/t3x-dev/t3x-core/issues/1684) | `packages/api/src/routes/pull-requests.openapi.ts`; `packages/api/src/lib/merge-checks.ts`; `packages/application/src/repository/reviewed-merge.ts`; storage/API/Web/CLI/MCP merge boundaries | `pnpm test:workspace-protected-ref-gate`; protected-ref two-principal, stale-head, multi-Commit, structured-audit and entrypoint contract tests | Landed in this change: protected refs require server-selected policy, proposer and accepting decider remain distinct, stale readiness cannot advance, and one PR accepts the complete multi-Commit source head |

## Task 02 verification

Task 02 is implemented and verified in the working change. The implementation
pins a new branch Workspace to an explicitly selected historical Commit,
preserves that Commit's immutable source evidence and decision policy, and
allows the branch to advance independently without creating a PR or moving the
original branch.

- Baseline: `origin/dev` at `b5b5d0bfe85f21313aed41e62bd44b16f703bf4f`.
- Full-stack Web E2E: all four post-Commit scenarios passed, including the
  historical C1 -> branch C3 path while `main` remains at C2.
- Full repository verification: `pnpm check` and `pnpm test` passed; the test
  run completed 31/31 workspace tasks successfully.
- First full-test attempt: environment failure because the WebUI development
  server held the Next.js build directory. It was stopped and the unchanged
  test suite then passed. This was not an assertion or product failure.

## Task 07 verification

Task 07 is implemented and verified in the working change. Workspace ownership
is derived from the authenticated server principal, persisted with the Draft,
and enforced before route handlers may read Workspace metadata. Project or ref
membership alone never authorizes access to another principal's Workspace.

- Baseline: `origin/dev` at `b5b5d0bfe85f21313aed41e62bd44b16f703bf4f`.
- Two authenticated fixtures named `test-a` and `test-b` target the same project
  and `main`, but create and list distinct private Workspaces.
- `test-a`'s Web credential and a separate user-bound MCP API credential resolve
  to the same human owner and the same Draft; `test-b` receives a generic 404
  for list/read/write, reconciliation, Review and Commit attempts against it.
- Owner identity comes only from verified authentication. Claimed body, query,
  project, branch, browser, hostname and port values cannot select or authorize
  another Draft. `AUTH_DISABLED` remains the only explicit local bypass.
- Workspace realtime events carry owner routing labels. Live delivery and replay
  use the same principal filter; legacy unowned events are visible only with the
  explicit local bypass.
- Revoking the user-bound MCP credential is observed on its next request.
- Targeted evidence passed: Workspace ownership/API group 15/15, storage
  ownership 1/1, and migrations 25/25. `pnpm check` passed with the repository's
  existing warnings, and `pnpm test` completed 31/31 workspace tasks
  successfully. The API suite passed 1738 tests with 21 skipped; the WebUI suite
  passed 2341 tests.
- First targeted API attempt failed before assertions because embedded
  PostgreSQL could not allocate shared memory inside the sandbox. The unchanged
  test passed outside that sandbox. An attempted parallel migration run also
  collided on the embedded PostgreSQL `postmaster.pid`; the unchanged migration
  suite passed serially. Both were environment/test-infrastructure failures, not
  assertion or product failures.

## Task 03 verification

Task 03 is implemented and verified in the working change. The Workspace chat
behavior is the capability baseline: both content Draft actions and exact Schema
actions are now available through the shared API client used by external
surfaces, without exposing storage mutations.

- Web content publication, CLI `workspace edit`, and MCP `t3x_edit mode=draft`
  append to the same immutable Draft action ledger.
- CLI `workspace schema` and MCP `t3x_edit mode=schema` call the exact Schema
  settings confirmation, snapshot generation and Draft application service used
  by Workspace chat. Nested Node/Slot additions remain separate confirmations.
- Every external command carries an explicit `project_id`, `workspace_id`,
  durable request identity, expected Workspace revision, expected composition
  revision and expected ref head. Actor identity is derived from authenticated
  server context; strict request schemas reject caller-supplied actors.
- The write inventory classifies each current path as `migrated`,
  `legacy_adapter` or `prohibited`. The evaluation runner remains prohibited
  from Workspace persistence until it adopts the guarded API client capability.
- Source-entry contract tests prove Web, CLI and MCP do not import storage or
  call `upsertWorkspaceDraft`/`transactWorkspaceAuthoring`. Existing legacy
  Workspace PATCH paths are metadata-only once a ledger exists.
- Authenticated `test-a` Web initialization followed by `test-a` MCP publication
  is visible from Web in the same Workspace; `test-b` still receives the generic
  private-Workspace denial.
- A user-bound machine credential records the machine as actor and its human
  user as delegator; both facts are derived from the authenticated credential,
  never accepted from the request body.
- Targeted authoring, Schema, ownership, authority and entrypoint evidence
  passed 72/72. The final repository run completed 31/31 tasks successfully;
  the API suite passed 1743 tests with 21 skipped, and the WebUI suite passed
  2341/2341 tests.
- First attempts exposed test and build-order issues rather than hidden product
  failures: stale generated API-client declarations were rebuilt; a new source
  contract test used the wrong repository-relative path; the service-key fixture
  lacked its required project scope; and one extraction test still expected the
  pre-delegation actor shape. Each was corrected and rerun. One full parallel
  run also ended in the WebUI suite under resource contention; the unchanged
  WebUI suite passed 2341/2341 in isolation before the final full run passed.

## Task 04 verification

Task 04 is implemented and has an executable release gate in the working
change. The server still owns authority and performs Commit graph persistence,
ref CAS, Workspace renewal and durable request-receipt persistence in one
transaction.

- An r5/r6/r7-style qualification prepares three incompatible Transitions from
  the same empty `main` head and labels their clients Web, CLI and MCP. Parallel
  Commit produces exactly one success and two stable `CONFLICT` responses with
  protocol code `STALE_BASE`.
- Each losing Workspace row is compared byte-for-byte with its pre-race value;
  the failed Commit transaction leaves neither a Commit nor a request receipt.
- Repeating the winner with the exact request ID and facts returns the original
  Commit with `reused: true`. Reusing the ID with changed `expected_head` returns
  `TRANSITION_COMMAND_CONFLICT`.
- A lost-response test discards the first successful result and retries the
  exact command. The server returns the persisted receipt without running the
  Workspace projection again, and only one Commit exists.
- Failure injection after Commit graph persistence but before Workspace
  projection completes proves that the ref, graph, receipt and Workspace all
  roll back together.
- The structured Web editor now preserves its unsaved local buffer when a
  Web/CLI/MCP update advances the Workspace revision. Review is paused and the
  user must explicitly load the remote Draft before local input can be
  discarded; background refresh never replaces it silently.
- `pnpm test:workspace-concurrency-gate` composes the API race/atomicity suite,
  Web buffer test and CLI/MCP Commit adapter contracts. It writes
  `test-results/qualification/workspace-concurrency-gate.json`; the full-stack
  workflow runs it and uploads the report with the release qualification
  artifacts.
- The local gate passed 45/45 tests: API 20, Web 3, CLI 4 and MCP 18.
- The final repository regression completed 31/31 tasks successfully; the API
  suite passed 1745 tests with 21 skipped, and the WebUI suite passed 2342/2342.

## Task 05 verification

Task 05 is implemented with an explicit, revision-bound reconciliation
protocol. A ref advance never rewrites another principal's Draft in the
background.

- An authoritative Commit/ref transaction emits a durable `branch.advanced`
  event carrying the ref, previous head and new head. Web invalidates the
  affected Workspace projections and shows the behind state.
- Preview is read-only and returns deterministic Base, Ours, Theirs, merged
  candidate, stable conflict identities and a preparation digest. The server
  verifies that the Draft Base is an ancestor of the current ref head.
- Adopt, cancel and discard are separate guarded decisions. Each checks the
  exact Workspace revision, current head and preparation digest and uses a
  durable request identity. A changed head or revision rejects the decision
  without modifying the Draft.
- Non-overlapping adopt carries local edits onto the latest head. Overlapping
  adopt is refused and preserves the Draft for task 06 structured resolution;
  discard must be chosen explicitly to replace it with the latest branch State.
- Decision archives include actor/delegator, preparation digest, input basis,
  outcome and conflict IDs. Cross-principal preview and decision attempts fail
  with the same generic 404 as other private Workspace access.
- Web exposes preview and explicit choices; CLI provides `workspace sync
  preview|adopt|cancel|discard`; MCP exposes matching `t3x_edit` modes. All use
  the shared API-client capability and do not mutate storage directly.
- `pnpm test:workspace-reconciliation-gate` composes API two-principal and
  reconciliation tests, the storage event contract, Web hooks and CLI/MCP
  adapters. It passed 48/48 tests and wrote
  `test-results/qualification/workspace-reconciliation-gate.json`. The
  full-stack workflow runs and uploads this gate with the qualification
  artifacts.

## Task 06 verification

Task 06 is implemented as a deterministic extension of the task 05
preparation. It does not perform text merging or accept client-computed merged
documents as authority.

- Every overlapping JSON/YAML path retains its stable conflict ID, path and
  Base/Ours/Theirs values, including explicit absence for deletion conflicts.
  Arrays remain atomic rather than being merged by position.
- `resolve` requires exactly one `base`, `ours`, `theirs` or explicit custom
  value for every prepared conflict. Duplicate, missing, unknown or stale
  conflict IDs are rejected before mutation.
- The server reloads the exact Workspace revision and branch head, recomputes
  the preparation, applies choices deterministically and validates the complete
  candidate against the exact bound Workspace Schema. Structural errors,
  cross-field errors and readiness gaps reject the transaction and preserve the
  original Draft.
- Successful resolution rebuilds and replay-checks the Draft ledger on the
  latest branch Base. The audit archive records the server-derived
  actor/delegator, preparation digest, original ledger and basis, every conflict
  ID and every selected choice. Task 05 discard continues to archive the same
  context when the user intentionally abandons the Draft.
- Web shows Base, Your Draft and Latest branch for each conflict, prevents
  application until every conflict has a choice and then asks the server to
  validate and apply. CLI `workspace sync resolve` and MCP
  `t3x_edit mode=sync_resolve` use the same API-client capability.
- `pnpm test:workspace-structured-conflict-gate` passed 39/39 tests: API 17,
  Web 12, CLI 3 and MCP 7. It writes
  `test-results/qualification/workspace-structured-conflict-gate.json`; the
  full-stack workflow runs and uploads the report with the other qualification
  artifacts.

## Task 09 verification

Task 09 keeps PR creation, readiness verification, acceptance and ref advance
as separate authorized actions. Direct Commit remains available where the
server-selected branch policy permits it; protected refs cannot be advanced by
an unbound machine credential or by a client-claimed policy.

- Machine credentials need the exact Transition scopes for each action. A
  propose-only credential can create a PR but cannot run readiness or merge it.
- The PR author is retained as the immutable proposal actor. A protected branch
  that requires independent review rejects the same human as accepting decider;
  `test-a` proposes and `test-b` accepts in the two-principal qualification.
- Readiness is bound to the exact source and target heads. A head change makes
  the result stale and forces deterministic recomputation before any merge.
- One PR accepts the complete source head, including multiple source Commits,
  and the resulting merge Commit records both reviewed parents.
- Activity persistence and the Web Activity tab expose structured actor,
  delegator, source/target revision, decision revision, outcome and merge
  Commit facts without exposing a private Draft.
- `pnpm test:workspace-protected-ref-gate` passed 174/174 tests across API,
  application, storage, Web, CLI and MCP and wrote
  `test-results/qualification/workspace-protected-ref-gate.json`. The first
  sandboxed attempt was classified as an environment failure because embedded
  PostgreSQL could not allocate shared memory; the unchanged gate passed when
  run with the required local database permission.

## Qualification fixture

Use two registered test principals, `test-a` and `test-b`. Their credentials are
local test secrets and must not be committed or copied into evidence.

1. Both principals receive authority for the same project and target `main` at
   C0.
2. A creates Workspace A. B creates Workspace B. Each has a different
   `workspace_id` and the same target ref.
3. Web A and MCP A select Workspace A and observe the same Draft. Web B and MCP
   B do the equivalent for Workspace B.
4. All A-to-B and B-to-A Draft list/read/write attempts fail without leaking
   Draft metadata.
5. B commits C0 -> C1. A's Draft is unchanged and its Workspace reports C0 as
   its basis and C1 as the current target head.
6. A's stale Commit is rejected without moving `main` or mutating Workspace A.
7. A previews Base=C0, Theirs=C1 and Ours=Draft A, then exercises sync/adopt,
   structured resolution and discard in separate resettable scenarios.

## Evidence and closure policy

- Existing files and tests in the matrix are discovery evidence only until the
  owning issue records a clean run against its acceptance criteria.
- Each implementation PR must link its issue, the exact tests run, first-failure
  classification and any untested case.
- Browser business-flow acceptance uses Chrome for `test-a` and Edge for
  `test-b` (or equivalent isolated sessions). Browser choice is only session
  isolation, never identity.
- Gate 1 closes only when RW-01 through RW-11 are green and the milestone has no
  open required issue. Gate 2 and Gate 3 retain their independent status.

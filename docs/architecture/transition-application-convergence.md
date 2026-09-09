# Transition Application Convergence

Status: converged on the Wave 2 stack

T3X is a deterministic, repository-based change system in which incremental
operations are evaluated against an exact checkpoint, reviewed as immutable
evidence, and committed through one authoritative path.

The protocol spine remains:

```text
Result = Replay(Base, DefinitionOf(Effect))
Propose -> Verify* -> Decide -> Commit?
```

The convergence proof is checked from
[`repository-convergence-proof.json`](../../packages/api/contracts/repository-convergence-proof.json).
It anchors supported architecture claims to executable integration and contract
tests. The existing architecture inventory remains checked by
`pnpm check:architecture-inventory`.

## Why convergence was necessary

T3X evolved in two stages:

1. The original conversation and draft workflow introduced `yops_log`,
   extraction routes, and direct WebUI, CLI, and MCP writers.
2. The repository model introduced stronger authority: Workspace revisions,
   deterministic YOps, Transition, ReviewSnapshot, Decision, exact-head CAS,
   and CommitV2.

The repository model arrived before every caller and delivery mechanism had
migrated. That was architectural debt around a sound foundation, not a reason
to introduce another protocol.

Wave 0 protected Cloud-owned overlays and inventoried every live writer. Wave 1
moved active WebUI, REST, CLI, and MCP mutations to Transition application
commands and retired legacy writer code only after callers reached zero. Wave 2
re-owned the live context manifest as a Source Thread contract, retired the
unused context export and Topics workflow, and added this durable closure gate.

Historical rows and physical schemas are not deleted by this convergence. Old
YOps remain readable as archived evidence, but cannot define current repository
state.

## One authority boundary

The active lifecycle is:

```text
Source -> Workspace -> Proposal -> ReviewSnapshot -> Decision -> CommitV2 -> Evidence
```

- `@t3x-dev/transition` owns the provider-independent protocol and replay rules.
- `@t3x-dev/application` owns commands, authorization inputs, idempotency, and
  canonical application errors.
- Storage implements persistence, transactions, exact expected-head CAS, and
  immutable evidence reads.
- API, WebUI, CLI, and MCP are transports or adapters; they do not implement an
  alternate writer.
- Cloud may compose billing, usage, risk, and provider adapters around an exact
  Core pin, but those overlays do not redefine Core project state.

The executable inventories enforce both sides of that boundary:

- [`repository-writer-inventory.json`](../../packages/api/contracts/repository-writer-inventory.json)
  requires every first-party mutation surface to use Transition authority.
- [`conversation-contract-inventory.json`](../../packages/api/contracts/conversation-contract-inventory.json)
  requires every Source Thread and Generation route to have a non-legacy owner
  and prevents retired compatibility routes from returning.

## Supported claims

After the Wave 2 stack lands, T3X can accurately claim:

- repository-first deterministic incremental updates against a known base;
- replay-verifiable transitions with stable digests;
- optimistic concurrency protection through exact expected-head CAS;
- one active mutation authority across WebUI, REST, CLI, and MCP;
- immutable proposals, reviews, decisions, receipts, and CommitV2 evidence;
- historical compatibility without historical authority;
- safe Core-to-Cloud composition with explicitly owned commercial overlays;
- provider-independent domain history.

## Explicit non-claims

This architecture is not:

- Debezium-compatible CDC or database-level change streaming;
- a general-purpose event bus or Kafka-style consumer replay system;
- distributed exactly-once processing;
- full event sourcing of every system entity;
- multi-master or offline collaborative merging;
- automatic conflict-free rebasing.

Checkpointing, ordering, idempotency, and verifiable replay are useful
incremental-system disciplines. They do not turn T3X into a streaming platform.
A rebase-preview or offline-merge subsystem should only be considered when real
concurrent or offline editing requirements justify it.

## Invariants

- Do not add a fifth public protocol noun.
- Do not make `@t3x-dev/transition` depend on application, storage, transports,
  UI, clocks, randomness, LLM clients, or network clients.
- Do not shrink or rewrite the frozen YOps v1 operation union.
- Do not rewrite historical Effect, Statement, CommitV2, draft, PR, or YOps
  evidence.
- Rejected Decisions remain auditable and cannot advance repository refs.
- A stale base, stale ReviewSnapshot, missing authority, or failed replay must
  fail before commit.
- Retire compatibility code with its last caller; preserve historical evidence
  unless a separately reviewed retention policy authorizes deletion.

## Verification

Run the closure contract with:

```bash
pnpm --dir packages/api exec vitest run \
  src/__tests__/contracts/repository-convergence-proof.test.ts \
  src/__tests__/contracts/repository-writer-inventory.test.ts \
  src/__tests__/contracts/conversation-contract-inventory.test.ts
```

The proof references, but does not duplicate, the durable runtime suites for
repository writer preparation, Workspace source transitions, Decision and
Commit routes, native Verify providers, CAS contention, and source evidence.

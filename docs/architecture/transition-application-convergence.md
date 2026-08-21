# Transition Application Convergence

Status: proposed
Phase: 3
Baseline: `origin/dev` at `df6b7ffa98514b353f872116eee905308c741859`

T3X already has the protocol spine:

```text
Result = Replay(Base, DefinitionOf(Effect))
Propose -> Verify* -> Decide -> Commit?
```

The remaining problem is not a new protocol concept. It is that first-party
product surfaces still assemble project lookup, authorization, storage
transactions, compatibility writers, and response mapping in too many places.
Phase 3 introduces one internal application boundary so those surfaces call the
same use cases while the public protocol nouns stay unchanged.

## Current Inventory

The checked snapshot lives in
[`phase3-application-inventory.json`](phase3-application-inventory.json). Update
it with:

```bash
node tools/check-architecture-inventory.mjs --write
```

Verify it with:

```bash
pnpm check:architecture-inventory
```

The baseline records these facts:

| Area | Baseline |
|---|---:|
| `packages/application` | missing |
| Transition control-plane files | 4 |
| Transition control-plane lines | 2037 |
| API route files | 75 |
| API route files using `getDB` | 67 |
| API route files using `assertProjectAccess` | 53 |
| API route files using `requireTransitionAuthority` | 2 |
| Compatibility writer files | 17 |
| Surface runtime files importing `@t3x-dev/storage` | 12 |
| MCP runtime files with hardcoded actors | 2 |
| YOps v1 operations | 18 |
| `ReviewSnapshot` references | 0 |

## Decision

Add internal `@t3x-dev/application` use cases before moving more runtime
behavior between API, Web, CLI, and MCP.

The package may own:

- command and query DTOs;
- trusted request context and actor identity types;
- resource-to-project-to-authority evaluation interfaces;
- transaction, CAS, idempotency, and audit ports;
- canonical application errors;
- derived product projections.

The package must not own:

- Hono, React, Next.js, MCP SDK, Commander, or transport-specific types;
- Drizzle schema, concrete database connections, migrations, or SQL clients;
- environment reads, system clock, randomness, LLM clients, or network clients;
- new public protocol nouns or changes to State, Effect, Statement, or CommitV2.

Storage implements the persistence ports. API, Web, CLI, and MCP are composition
roots or clients, not alternate command implementations.

## Migration Order

1. Add the application package, ports, trusted context, errors, and the read-only
   transition inspection query.
2. Move propose, verify, and attach-statement commands behind the same resource
   and authority evaluator.
3. Move decide and commit commands behind one transaction, CAS, idempotency, and
   review-seal path.
4. Route first-party repository draft and merge writers through the application
   commands while keeping the existing compatibility facade.
5. Make API, MCP, Web, and CLI call the same command surface for consequential
   transition mutations.
6. Add the versioned YOps recipe compiler foundation without changing the
   frozen v1 18-op contract or existing Effect digests.
7. Add derived ChangeProjection and append-only ReviewSnapshot foundations while
   keeping existing PR records and URLs readable.

## Compatibility Rules

- Do not add a fifth public protocol noun.
- Do not make `@t3x-dev/transition` depend on application, storage, transports,
  UI, clocks, randomness, or LLMs.
- Do not shrink or rewrite the YOps v1 operation union.
- Do not rewrite historical Effect, Statement, CommitV2, draft, or PR records.
- Keep old API methods and project review URLs as compatibility aliases until a
  separate deprecation PR removes them.
- Rejected decisions remain auditable and must not advance repository refs.
- Any stale base, stale snapshot, missing authority, or failed replay must fail
  before commit.

## Open Ownership

Existing owning issues:

- [#1305](https://github.com/t3x-dev/t3x-core/issues/1305): CommitV2 writer
  convergence.
- [#1236](https://github.com/t3x-dev/t3x-core/issues/1236): MCP
  Decision/Commit automation.

Before changing a frozen architecture decision, update the relevant owning
issue or create a small owner issue for the specific application, YOps recipe,
or ReviewSnapshot decision.

## Phase 2 Prerequisite

At this baseline, these Phase 2 PRs are green but still waiting for review:

- [#1375](https://github.com/t3x-dev/t3x-core/pull/1375): Decision review seal.
- [#1376](https://github.com/t3x-dev/t3x-core/pull/1376): workspace typecheck
  gate.

Runtime migration PRs must refresh the inventory from the latest clean
`origin/dev` after these prerequisites are merged or explicitly rebased into
the branch.

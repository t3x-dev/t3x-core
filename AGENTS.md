# AGENTS.md

This file is the general guide for AI coding agents working in this repository.
`CLAUDE.md` may contain Claude-specific or deeper architecture notes, but this
file is the short cross-agent source for day-to-day development behavior.

## Project Frame

T3X is version control for structured state.

The product thesis is:

```text
Change as a verifiable object.
```

The architecture follows one deterministic State law and one small governance
lifecycle:

```text
Result = Replay(Base, DefinitionOf(Effect))
Propose -> Verify* -> Decide -> Commit?
```

`Verify*` always includes deterministic replay verification and may add zero or
more external Statements. `Commit?` exists only for accepted or authorized
overridden Decisions; rejection remains auditable without advancing history.
Preparation, retries, revisions, and post-processing compose these verbs rather
than adding kernel lifecycle hooks.

State, Effect, Statement, and CommitV2 are the four public protocol nouns.
Transition is the application/product aggregate over that immutable graph, not
a fifth envelope. Product surfaces stay task-oriented and consume derived
projections instead of mirroring protocol nouns one-to-one.

`Source -> YOps -> Commit` remains one useful product path, but it is not the
architecture. Source material can support a Proposal, YOps can implement an
Effect, and a Commit advances only after verification and Decision.

Do not reintroduce the retired graph, meaning, knowledge, or AI-first
positioning unless the README changes first.

## Transition Spine

Epic #1222 completed the internal Transition Spine architecture. The protocol
kernel and conformance bundle are implemented, and `@t3x-dev/transition` is the
public alpha leaf package for protocol contracts. Public packaging does not
loosen the protocol boundary.

Preserve these boundaries:

- keep YOps, YSchema, codecs, MutationDrivers, and Statement providers
  independently usable;
- keep protocol contracts in the leaf `@t3x-dev/transition` package;
- distinguish protocol ports, native adapters/providers, application use cases,
  and derived product projections instead of using one framework;
- integrate native components through one-way adapters rather than inheritance;
- keep database, network, LLM, runner, UI, clock, and randomness outside the
  protocol kernel;
- keep product surfaces task-oriented and derive them from shared application
  projections rather than raw protocol records;
- update the owning GitHub Issue before changing a frozen architecture
  decision.

## Repository Shape

This is a pnpm workspace with Turborepo:

- `packages/yops` — deterministic YAML operation engine.
- `packages/yschema` — WIP validation candidate with auto-fix.
- `packages/transition` — leaf protocol contracts, Replay, identity, and
  integrity verification.
- `packages/core` — engine layer for commits, diffs, merges, extraction, ylint.
- `packages/storage` — PostgreSQL persistence.
- `packages/api` — Hono route library.
- `packages/api-client` — TypeScript API client.
- `apps/local` — restricted alpha local entry package.
- `apps/web` — WebUI preview.
- `apps/api` — runnable API server.
- `apps/cli` — CLI preview.
- `apps/mcp` — MCP preview.
- `apps/runner` and `apps/agent-demo` — evaluation/demo surfaces.

Root docs are intentionally minimal. Public policy and operational docs live in
`docs/`; release automation data lives in `release/`.

## Release Surface

The public alpha npm release surface is intentionally narrow:

- `@t3x-dev/local`
- `@t3x-dev/yops`
- `@t3x-dev/transition`
- `@t3x-dev/yschema`

`@t3x-dev/local` remains public but is paused from automated release-train
publishing. The active package release train is:

- `@t3x-dev/yops`
- `@t3x-dev/transition`
- `@t3x-dev/yschema`

`RELEASE.md` and `release/surface.yaml` are the source of truth. Other packages
are internal, preview, or candidate surfaces until promoted.

Keep package access and docs aligned with restricted alpha status. Do not change
release surface, publish access, or stability wording without updating the
release docs and checks.

## Development Commands

From the repository root:

```bash
pnpm install
pnpm check
pnpm build
pnpm test
```

Useful targeted commands:

```bash
pnpm build:yops
pnpm build:core
pnpm build:api
pnpm build:webui
pnpm test:yops
pnpm test:core
pnpm test:webui
pnpm check:release-surface
pnpm standards:validate
```

Source development:

```bash
pnpm dev:api
pnpm dev:webui
```

Self-hosted evaluation:

```bash
cp .env.example .env
docker compose up -d --build
```

Docker is an evaluation path, not a production-readiness promise.

## Editing Rules

- Prefer existing patterns over new abstractions.
- Keep edits scoped to the request.
- Use `rg` for search.
- Use structured parsers or existing tooling for structured data.
- Do not move release, standards, or workflow files without updating tests and
  CODEOWNERS.
- Do not revert user changes.
- Keep generated or local working material out of git unless the task explicitly
  asks for it.

## Verification

Match verification to the change:

- Docs only: `git diff --check` and `pnpm check`.
- Release surface or policy paths: add `pnpm check:release-surface`,
  `pnpm standards:validate`, and relevant `node --test tools/__tests__/*.mjs`.
- Package/runtime changes: run the package-specific build/test plus `pnpm build`
  when practical.
- Transition Spine changes: record the clean `origin/dev` baseline; map each
  changed invariant to its native, adapter, protocol-conformance, or E2E test;
  include an adversarial case; and run `pnpm test` before review. A retry does
  not erase the first failure—classify assertion, teardown/resource, environment,
  and flaky failures separately.
- WebUI changes: run the relevant WebUI test/build and inspect in a browser when
  layout or interaction changes.

The pre-push hook runs `pnpm check` and `pnpm build`. It runs tests only when
`T3X_RUN_TESTS=1` is set.

## Important Boundaries

- YOps Apply, validation, commit hashing, diff, and merge must stay
  deterministic.
- LLMs may propose or generate; they must not be required in the deterministic
  mutation path.
- Source development defaults to no auth locally. Docker/self-hosted evaluation
  keeps auth on by default.
- CLI, MCP, WebUI, API, runner, storage, and YSchema are not all equally stable;
  keep preview/WIP/internal wording accurate.

## Where To Look

- Product overview: `README.md`
- General docs index: `docs/README.md`
- Release surface: `RELEASE.md`, `release/surface.yaml`
- Alpha limitations: `docs/limitations.md`
- Deployment/evaluation: `docs/deployment.md`
- Stability summary: `docs/stability.md`
- Stability policy: `docs/release/stability-policy.md`
- Contributor basics: `CONTRIBUTING.md`
- Security policy: `SECURITY.md`

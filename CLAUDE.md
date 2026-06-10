# CLAUDE.md

This file instructs Claude Code (claude.ai/code) when working in this
repository. For cross-agent guidance, start with [`AGENTS.md`](AGENTS.md).
Keep both files truthful and grounded in what's actually on disk — not in
historical architecture. Verify before adding claims; delete when they go stale.

## Project Overview

T3X is **version control for structured state**. Source evidence from chats,
docs, specs, prompt runs, and other structured inputs becomes schema-backed
YAML state; deterministic YOps change that state; commits, diffs, and merges
version the result.

**Core principle.** The mutation layer is deterministic and never depends on an
LLM. LLMs can propose changes as YOps YAML; a deterministic engine validates and
applies them. All structured-state mutation goes through YOps — this is the
single rule the whole architecture rests on.

## Open-Core

Two repos. You are in the public one:

| Repo | Visibility | Purpose |
|---|---|---|
| `t3x` (this repo) | Public | Core engine + self-hostable product |
| `t3x_cloud` | Private | SaaS layer: OAuth, billing, teams |

Core packages publish to npm as `@t3x-dev/*` via Changesets. `t3x_cloud` consumes them and extends the API via `createApp(options)` from `@t3x-dev/api`.

**Auth.** Public ships with username/password (`auth-local.openapi.ts`). Cloud passes `skipLocalAuth: true` and wires GitHub/Google OAuth via NextAuth.

**Local dev with the private repo.** `t3x_cloud/scripts/link-local.sh on|off` toggles symlinks to local packages.

## Repository Layout

pnpm workspace + Turborepo.

```
t3x/
├── packages/
│   ├── yops/          @t3x-dev/yops        — 18 declarative YAML operations, zero deps
│   ├── yschema/       — shared YAML validation primitives
│   ├── core/          @t3x-dev/core        — diff, merge, hash chains, extraction (deterministic)
│   ├── storage/       @t3x-dev/storage     — Postgres persistence (Drizzle)
│   ├── api/           @t3x-dev/api         — route library + createApp() factory
│   └── api-client/    @t3x-dev/api-client  — TypeScript client
├── apps/
│   ├── web/           t3x-webui            — Next.js 16 frontend (App Router + XYFlow)
│   ├── api/                                 — Hono server binary; wraps packages/api
│   ├── runner/        @t3x-dev/runner      — grey-box agent evaluation (server + library)
│   ├── cli/           @t3x-dev/cli         — command line
│   ├── mcp/           @t3x-dev/mcp         — MCP server exposing T3X tools to AI agents
│   └── agent-demo/                          — demo agent
├── biome.json
├── turbo.json
└── docker-compose.yml
```

**Note:** `packages/api` = route library; `apps/api` = runnable server that calls `createApp()`. They are not the same thing. `apps/runner` doubles as both the runner binary and the published `@t3x-dev/runner` library (no separate `packages/runner`).

## Build & Development

From the repo root:

```bash
pnpm install
pnpm build                    # all packages
pnpm test                     # all tests
pnpm lint / lint:fix
pnpm check / check:fix        # lint + format
```

Per-package:

```bash
pnpm build:core / build:storage / build:api / build:runner / build:webui
pnpm test:core  / test:storage  / test:webui / test:runner
```

Dev servers:

```bash
pnpm dev:api       # Hono API, port 8000
pnpm dev:webui     # Next.js, port 3000
pnpm dev:agent     # demo agent, port 9000
cd apps/runner && pnpm dev   # runner, port 8080
```

Single test:

```bash
# from a package directory
pnpm vitest run src/__tests__/some.test.ts
pnpm vitest run -t "creates a new project"
```

Docker:

```bash
docker compose up -d --build              # postgres + api + webui
docker compose --profile runner up -d     # adds runner
docker compose --profile n8n up -d        # adds n8n
docker compose down
```

Ports: WebUI 3000, API 8000, Postgres 5432, Runner 8080, Agent Demo 9000, n8n 5678.

**Dependency build order.** After changing a lower package, rebuild consumers:

```
core changed       → pnpm build:core && pnpm build:storage && pnpm build:api
storage changed    → pnpm build:storage && pnpm build:api
apps/api changed   → pnpm build:api  (or just pnpm dev:api for HMR)
```

Tests depend on built artefacts. If tests can't find `@t3x-dev/*`, rebuild.

## Architecture

### Package dependency graph

```
yops (@t3x-dev/yops)         ← standalone, zero deps
  └── core (@t3x-dev/core)   ← tree-primary engine
        └── storage (@t3x-dev/storage)
              └── packages/api (@t3x-dev/api)   ← route library
                    └── apps/api                ← server binary
                    └── apps/runner             ← also imports packages/api

apps/web     → storage + api-client
apps/cli     → core + api-client
apps/mcp     → core + api-client
```

### YOps engine (`packages/yops`)

Three layers, analogous to OpenAPI / Zod / Hono:

| Layer | Files | Role |
|---|---|---|
| Spec | `yops.yaml` | 18 operations — fields, rules, errors, conformance test cases |
| Registry | `spec.ts`, `registry.ts` | Parses the spec, validates handlers + field contracts |
| Engine | `engine.ts`, `handlers/` | Dispatches and executes |

`yops.yaml` is the runtime source of truth, not documentation. Every op has one handler. Ops are grouped DDL / DML / DTL / DCL. Conformance tests are language-agnostic — any engine can run them.

`@t3x-dev/core` extends the YOps registry with `relate` / `unrelate`.

### Deterministic layers

| Layer | Package | LLM? |
|---|---|---|
| YOps engine | `@t3x-dev/yops` | No |
| Core | `@t3x-dev/core` | No |
| Storage | `@t3x-dev/storage` | No |
| Agent plugins | optional (SummaryAgent, MergeAgent) | Optional |
| Product | `web`, `api`, `runner` | No |

### The Commit model

```ts
// packages/core/src/commit/types.ts
export const COMMIT_SCHEMA = 't3x/commit';   // unversioned, self-identifier

interface Commit {
  // First-class (in hash)
  hash: string;
  schema: typeof COMMIT_SCHEMA;
  parents: string[];
  author: Author;
  committed_at: string;
  content: SemanticContent;   // { trees: TreeNode[]; relations: Relation[] }

  // Second-class (not in hash)
  project_id: string;
  message: string | null;
  branch: string;
  provenance: Provenance | null;
  yops_log_ids: string[];
  sources?: { type: 'conversation' | 'import' | 'leaf'; id: string; title?: string }[] | null;
}
```

**There is one commit format.** No versioned variants. `content` is
YOps-mutated structured state + relations. Leaves own constraints (see below),
never commits. Hashing uses SHA-256 over JCS-canonicalized first-class fields
(`packages/core/src/commit/hash.ts`).

### Hash chains

- **Turn**: `parent_turn_hash → turn_hash` (SHA-256 of JCS-canonicalized turn fields).
- **Commit**: DAG via `parents: string[]`. Merge commits have multiple parents.

### Storage (`packages/storage`)

Postgres via Drizzle ORM. Embedded Postgres for local dev; Postgres for Docker/prod; Supabase adapter available.

Schema is sharded for manageability — each file hosts a group of related tables:

| File | Tables |
|---|---|
| `schema.ts` | `projects`, `conversations`, `turns`, `branches`, `agent_drafts`, `drafts`, `leaves`, `leaf_history`, `leaf_output_edits`, `pins`, `conversation_contexts`, `merge_drafts`, `deploy_agents`, `runs`, `segment_embeddings`, `saved_comparisons`, `templates`, `recipes`, `webhooks`, `share_tokens`, `users`, `accounts`, `api_keys`, `notifications`, `global_settings`, `yops_log` |
| `schema-commits.ts` | `commits`, `commit_rewrites`, `frame_lineage` |
| `schema-trees.ts` | `trees`, `tree_relations`, `knowledge_nodes`, `knowledge_edges`, `knowledge_node_members` |
| `schema-node-modifications.ts` | `node_modifications` |
| `schema-extraction-feedback.ts` | `extraction_feedback` |
| `schema-metrics.ts` | `metrics_events`, `token_usage`, `topics` |
| `schema-tree-state.ts` | Tree-state helpers (no standalone tables) |

Business logic calls functions in `queries/`, never raw SQL.

### Extraction pipeline (`packages/core/src/extractors/`)

LLM proposes YOps; the pipeline applies them deterministically. `yops_log` is the audit trail for every mutation.

| Stage | Files |
|---|---|
| Prompt build | `extractionPrompt.ts`, `yopsPrompt.ts`, `extractionStyleConfig.ts` |
| Strategy + LLM call | `strategies/`, `extractor.ts` |
| Parse | `yopsParser.ts` |
| Transforms (deterministic) | `transforms/` (`consolidate`, `nest`, `flagContradictions`, `checkRegression`) |
| Repair | `repairPrompt.ts`, `correctionPrompt.ts` |
| Compression | `compressor.ts`, `compressPrompt.ts` |
| Thresholds | `adaptiveThresholds.ts` |

Flow: `turns → prompt → LLM → YOps YAML → parser → @t3x-dev/yops engine → transforms → yops_log + commit`.

### Diff & merge (`packages/core/src/semantic/`)

**Diff** is tiered:

1. Exact match (O(N+M)) — identical subtrees skip comparison
2. Jaccard ≥ 0.3 filter to find candidate pairs (fast)
3. LCS word diff inside each matched pair
4. Classify unpaired: added / removed

**Merge** is two-phase:

1. `prepareMerge(source, target)` → returns `identical` (auto-kept), `similarPairs` (user resolves, with `word_diff` for display), `onlyInSource`, `onlyInTarget`.
2. `executeMerge(decisions, message)` → writes the merged commit.

Decisions are one of `source | target | both | edit` (custom text).

### Runner (`apps/runner`)

Grey-box agent evaluator.

- **Observer** captures agent I/O traces (LLM calls, tool invocations).
- **EvalEngine** runs test steps against traces using rule-based assertions.
- **n8n integration** for workflow execution.

```ts
import { observer, evalEngine } from '@t3x-dev/runner';

observer.registerAgent({ id: 'my-agent', endpoint: '...', type: 'http' });
const runId = observer.startRun('my-agent', { input: { query: 'hello' } });
observer.recordLLMCall(runId, prompt, response, 'gpt-4', 500);
const trace = observer.completeRun(runId, output, 'completed');
const result = await evalEngine.evaluate({ trace, test_steps: [...] });
```

### Realtime Sync

Cross-process writes (MCP, CLI, any worker) propagate to WebUI live via an
events-table outbox + `pg_notify` LISTEN relay. See
`packages/storage/REALTIME-SYNC.md` for the full architecture and event
type whitelist.

**Key rule:** New event types require updating `ALLOWED_EVENT_TYPES` in
`packages/storage/src/events.ts` and PR review.

## WebUI Architecture (`apps/web`)

### Folder map (current on disk)

```
apps/web/src/
├── app/                 — Next.js App Router (pages)
├── components/          — L4: rendering (ui/ canvas/ leaf/ merge/ diff/ shared/ …)
├── hooks/               — L3: view-level composition, organised by aggregate:
│   canvas/ commits/ conversations/ drafts/ feedback/ imports/
│   knowledge-graph/ leaves/ merge/ pins/ projects/ shared/ shares/ templates/
├── store/               — L3: Zustand state containers (passive: state + setters only)
├── queries/             — L3 reads: async fetch per aggregate
├── commands/            — L3 writes: user-intent commands (yops/ + 9 other aggregates)
├── domain/              — L2: pure functions, grouped by topic:
│   commit/ diff/ draft/ format/ leaf/ tree/ yops/ replay.ts …
├── infrastructure/      — L1: the only place fetch() lives (export/, plus per-aggregate files)
├── utils/               — cross-layer view helpers (cn, theme, motion, pageAnimations,
│                          microcopy, canvasMenuBuilders, tokenizer)
├── data/ / types/       — static data / shared type re-export surface
├── middleware.ts
└── __tests__/           — mirrors the src layout above (domain/ infrastructure/
                           components/ hooks/ stores/ utils/ …)
```

> Historical note: a flat `lib/` directory used to hold a mix of pure utils,
> I/O helpers, and view-layer constants. It was retired in 2026-04; every
> file now lives under one of `domain/` / `infrastructure/` / `utils/` /
> `components/` / `hooks/` based on its responsibility. Any new file that
> looks like "utility" should pick a layer up front — don't recreate `lib/`.

### Four-layer model — enforced by Biome

`biome.json` uses `noRestrictedImports` to make the layering mechanical, not aspirational:

| Layer | Folder | Rule |
|---|---|---|
| L1 Infrastructure | `infrastructure/` | Raw I/O. Only layer that may call `fetch()`. |
| L2 Domain | `domain/` | Pure. **Cannot import** React, components, hooks, store, queries, commands, or infrastructure. |
| L3 Composition | `hooks/`, `store/`, `queries/`, `commands/` | `store/` **cannot import** commands or infrastructure (route through queries). `hooks/` may compose. |
| L4 View | `components/` (canvas/chat/commit/leaf/merge/tree-graph/merge-view) | **Cannot import** commands or infrastructure directly. Use hooks or queries. |

Violations fail lint. Escape hatches are narrow and listed in `biome.json` `overrides`.

**Implications for new code:**
- Component fetches? → hook → query (read) or command (write).
- Store needs data? → query, never direct fetch.
- Pure derivation (selectors, replay, tree ops)? → `domain/`.
- New HTTP endpoint? → add to `infrastructure/<aggregate>.ts` (the only layer that calls `fetch()`).

### Canvas store (slice pattern)

```
canvasStore.ts              — create<CanvasState>(slices + core)
├── canvasStoreTypes.ts     — shared CanvasState + slice interfaces
├── canvasStoreUtils.ts     — pure helpers (layout, position, graph)
├── canvasMergeSlice.ts     — merge domain
├── canvasLeafSlice.ts      — leaf panel domain
├── canvasCommitSlice.ts    — commit domain
└── canvasNodeSlice.ts      — node domain
```

All consumers import from `canvasStore.ts`.

### API response envelope

```json
{ "success": true,  "data": { … } }
{ "success": false, "error": { "code": "…", "message": "…" } }
```

Snake_case on the wire and in DB columns; camelCase in JS variables; TypeScript interface fields mirror the wire format (snake_case). Don't write `commitHash` in a TS interface — write `commit_hash`.

## Data Shapes

### Turn

```json
{
  "turn_hash": "sha256:…",
  "parent_turn_hash": "sha256:…",
  "project_id": "proj_…",
  "conversation_id": "conv_…",
  "role": "user|assistant|system|tool",
  "content": "…",
  "created_at": "ISO8601"
}
```

### Commit (current — one shape, unversioned)

```json
{
  "hash": "sha256:…",
  "schema": "t3x/commit",
  "parents": ["sha256:…"],
  "author": { "type": "human|agent|system", "id": "…", "name": "…" },
  "committed_at": "ISO8601",
  "content": {
    "trees": [
      { "key": "budget", "slots": { "…": "…" }, "children": [ … ] }
    ],
    "relations": [
      { "from": "budget", "to": "activity_plan", "type": "causes" }
    ]
  },
  "project_id": "proj_…",
  "message": "…",
  "branch": "main",
  "provenance": { "method": "llm_extraction|human_curation|import|merge|squash", "model": "…" },
  "yops_log_ids": ["…"],
  "sources": [{ "type": "conversation|import|leaf", "id": "…", "title": "…" }]
}
```

First-class (hashed): `schema`, `parents`, `author`, `committed_at`, `content`.
Second-class (not hashed): `project_id`, `message`, `branch`, `provenance`, `yops_log_ids`, `sources`, UI position fields.

### Leaf

```json
{
  "id": "leaf_…",
  "commit_hash": "sha256:…",
  "type": "deploy_agent|tweet|linkedin|reddit|threads|article|email|slack|eval",
  "title": "…",
  "constraints": [
    { "id": "cst_…", "type": "require|exclude", "match_mode": "exact|semantic", "value": "…", "reason": "…" }
  ],
  "config": { "prompt_template": "…", "model": "…", "max_tokens": 4096 },
  "output": "…",
  "assertions": [
    { "id": "ast_…", "constraint_id": "cst_…", "passed": true, "details": "…", "lesson": "…" }
  ],
  "project_id": "proj_…",
  "created_at": "ISO8601"
}
```

**Constraints belong to Leaves, not Commits.** A Leaf is the application-layer artefact (tweet, email, eval, …) built from a commit's knowledge plus its own constraints.

### Pin

```json
{
  "id": "pin_…",
  "project_id": "proj_…",
  "type": "conversation|leaf",
  "ref_id": "conv_…|leaf_…",
  "selected_assertion_ids": ["ast_…"],
  "pinned_at": "ISO8601"
}
```

Pins select sources for commit construction and conversation context.

## ID Conventions

Source of truth: `ID_PREFIXES` in `packages/core/src/types/index.ts`.

| Entity | Prefix |
|---|---|
| Project | `proj_` |
| Conversation | `conv_` |
| Sentence (node) | `s_` |
| Constraint | `cst_` |
| Assertion | `ast_` |
| Leaf | `leaf_` |
| Leaf history | `lhist_` |
| Pin | `pin_` |
| API key (id) | `ak_` (raw key value: `t3xk_…`) |
| Share token | `share_` |
| Draft | `draft_` |
| Draft constraint | `dc_` |
| Relation | `rel_` |

## Invariants

1. **Determinism.** Same inputs → same outputs for every core algorithm.
2. **Append-only.** Hash chains are immutable; modifying a commit breaks verification.
3. **YOps is the only mutation path** for tree content.
4. **Evidence-backed.** Every semantic node traces to source turns.
5. **Layered WebUI.** Biome enforces L1–L4 direction; don't fight it.

## MCP Server

T3X exposes **8 umbrella tools** for AI agents (Claude Code, Cursor, …), built
by the `createMcpServer` factory in `packages/mcp/src/server.ts`. Each umbrella
dispatches to sub-actions via a `target` / `action` / etc. parameter, replacing
the earlier ~36 one-tool-per-action surface.

| Toolset | Tools |
|---|---|
| `core` (5) | `t3x_query`, `t3x_extract`, `t3x_edit`, `t3x_commit`, `t3x_generate` |
| `advanced` (3) | `t3x_diff`, `t3x_merge`, `t3x_admin` |

Layout:

- Tool definitions: `packages/mcp/src/tools/core/*.ts` and `packages/mcp/src/tools/advanced/*.ts`
- Registration: `createMcpServer` in `packages/mcp/src/server.ts` (toolset picked via `T3X_TOOLSETS` env)
- Server entry point: `apps/mcp/src/index.ts` — a thin stdio wrapper around `createMcpServer`

Register a new tool by adding a `ToolDef` + handler file under
`packages/mcp/src/tools/{core,advanced}/` and appending its entry to
`CORE_TOOLS` / `ADVANCED_TOOLS` in `server.ts`.

### Setup

```bash
pnpm build:core && pnpm --filter @t3x-dev/api-client build && pnpm --filter @t3x-dev/mcp build
pnpm dev:api
# project-level .mcp.json is already committed at repo root.
```

### Auth

- `T3X_API_KEY` env var (in MCP config) → skips browser auth.
- Otherwise, MCP opens a login page and caches the token in `~/.t3x/mcp-token.json`.
- 401 mid-session → automatic re-auth.

### Agent workflow

Umbrellas dispatch to sub-actions via `target` / `action` / etc. Typical flow:

```
Extract → Inspect → Edit → Commit:
  t3x_admin({ action: "create_project", name })            → project_id
  t3x_extract({ project_id, text })                        → draft_id
  t3x_query({ target: "draft", id: draft_id })             → nodes, revision
  t3x_edit({ draft_id, yops, if_revision })                → updated trees
  t3x_commit({ project_id, draft_id, message })            → commit_hash

Merge (advanced toolset):
  t3x_merge({ action: "prepare", source_hash, target_hash })  → autoKept, conflicts
  t3x_merge({ action: "execute", …, decisions, message })     → merge commit_hash
```

## Environment Variables

**User-facing** (shell or `.env`):

- `ANTHROPIC_API_KEY` — required for extraction, chat, generation.
- `GOOGLE_AI_STUDIO_KEY` — optional (Gemini).

**Docker-internal** (set by `docker-compose.yml`):

- `DATABASE_URL` — Postgres connection string.
- `NEXT_PUBLIC_API_URL` — API server URL (default `http://localhost:8000`).
- `AUTH_DISABLED` — defaults to `true` for self-hosted.

**Runner / n8n** (opt-in):

- `N8N_API_KEY`, `TRACE_POLICY` (`always | on_failure | on_violation`).

**Cloud-only** (live in `t3x_cloud`, not here): `GITHUB_CLIENT_ID/SECRET`, `GOOGLE_CLIENT_ID/SECRET`, `NEXTAUTH_SECRET`.

## Development Workflow

The user will often describe goals rather than code. Prefer proactive exploration over asking them to explain their own codebase:

1. Search for similar code/components first.
2. Before modifying, list the files/interfaces that will change.
3. When multiple approaches exist, present options; let the user pick.
4. When uncertain, ask a decision-shaped question, not an explanatory one.

### Code reuse

Order of preference: **reuse > extend > create new**. Before writing new code, search the project for something similar. If reuse fits, use it; if it's close, extend it; only then create new.

## Bug Fixing

**Never glue-fix.** A patch that works around missing data, a wrong type, or a broken contract hides the real problem.

Priority when something is broken:

1. Trace the data flow end-to-end; identify exactly where it breaks and why.
2. Fix the root cause — schema, persistence, type, contract.
3. Remove retired code immediately. Dead aliases and deprecated types cause the next bug. Deleting them is higher priority than adding your next feature.
4. Never patch the read path to compensate for a write-path bug.
5. Never add a compatibility shim when you can fix the source.

## Prohibited

- **No commit without explicit confirmation.** Ask before `git commit` / `git push`.
- **No AI attribution.** No `Co-Authored-By: Claude`, no "Generated with Claude Code" lines in commit messages, PR titles, or PR bodies.
- **English only** for commit messages, PR titles, PR descriptions.
- **Always reference issues.** Commit messages end with `(#N)`; PR bodies include `Resolves #N` or `Closes #N` so merging auto-closes.
- **Don't guess paths.** Grep / Glob first.
- **Don't skip verification.** Run relevant tests after changes.
- **Don't glue-fix.** Find the root cause.
- **No `console.log` in final code.** Remove debug prints before committing.

## Commit message format (Conventional Commits)

```
<type>(<scope>): <short description> (#issue)

# examples
feat(api): add V1 leaves endpoint (#123)
fix(web): resolve canvas node drag (#124)
test(storage): cover new commits query (#125)
docs: update CLAUDE.md
```

Types: `feat | fix | test | docs | refactor | chore`.

## Known Pitfalls

| Problem | Cause | Fix |
|---|---|---|
| DELETE route returns 404 | `index.ts` imports wrong file (e.g. `projects.ts` instead of `projects.openapi.ts`) | Fix the import path |
| API call fails from WebUI | Assuming API is in Next.js | API is `apps/api` (port 8000); WebUI is `apps/web` (port 3000) |
| `Cannot find module '@t3x-dev/…'` | Dependent package not built | Rebuild per the dependency order |
| Tailwind utility overridden | Global CSS outside `@layer base` | Put resets in `@layer base` or remove the conflicting rule |

## Quick Debug

```bash
# Ports
lsof -i :8000
lsof -i :3000

# Live API logs
pnpm dev:api 2>&1 | tee api.log

# Clean rebuild
pnpm clean && pnpm install && pnpm build

# Single test file / test by name
cd apps/api && pnpm vitest run src/__tests__/leaves.test.ts
cd apps/api && pnpm vitest run -t "should create leaf"
```

### Looking at the WebUI

`WebFetch` and `curl` don't work for localhost + Next.js (client-rendered shell). Use Playwright:

```bash
# With a render delay
npx playwright screenshot --wait-for-timeout=3000 \
  "http://localhost:3000/project/proj_xxx" /tmp/t3x-canvas.png

# Full scrollable capture
npx playwright screenshot --wait-for-timeout=3000 --full-page \
  "http://localhost:3000/project/proj_xxx/leaf/leaf_xxx" /tmp/t3x-leaf.png
```

Then open the screenshot with Read.

Common pages: `/project/{projectId}`, `/project/{projectId}/leaf/{leafId}`, `/project/{projectId}/merge/{mergeId}`, `/insights`.

## Search Patterns

```bash
# API route implementation
Grep: "router\.post.*leaves"      glob: "apps/api/**/*.ts"

# Type definition
Grep: "interface.*Leaf"           glob: "packages/core/**/*.ts"

# All call sites of a function
Grep: "createLeaf\\("

# Database schema definitions
Grep: "export const.*Table"       glob: "packages/storage/**/*.ts"

# Zustand stores
Grep: "create\\(.*\\).*=>"        glob: "apps/web/src/store/**/*.ts"
```

## PR Checklist

- [ ] `pnpm check` passes (lint + format)
- [ ] Related tests pass
- [ ] New code has tests
- [ ] No stray `console.log`
- [ ] Types are real (no `any` escapes)
- [ ] API changes reflected in OpenAPI schema
- [ ] Breaking changes called out in the PR body

## External References (verified paths only)

Paths that actually exist in the repo. The `docs/` directory is gitignored and is **not available** when the repo is cloned — do not link into it from committed code or CI.

| Area | Path |
|---|---|
| Project overview | `README.md` |
| WebUI primer | `apps/web/README.md` |
| API OpenAPI & merge | `apps/api/docs/openapi-summary.md`, `apps/api/docs/merge-api.md`, `apps/api/docs/api-changelog.md` |
| Runner | `apps/runner/docs/README.md`, `apps/runner/docs/ARCHITECTURE.md`, `apps/runner/docs/n8n-workflow-setup.md`, `apps/runner/docs/recipes.md` |
| Core types | `packages/core/src/types/index.ts` (ID_PREFIXES + shared interfaces) |
| Commit model | `packages/core/src/commit/types.ts`, `packages/core/src/commit/hash.ts` |
| Semantic content | `packages/core/src/semantic/types.ts` |
| Storage schema | `packages/storage/src/schema.ts` + `schema-*.ts` shards |
| API contracts | `packages/api/src/schemas/contracts.ts` |
| YOps spec | `packages/yops/yops.yaml` |

If a doc you need isn't listed here, check the source of truth in code first.

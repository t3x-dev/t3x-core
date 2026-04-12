# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

T3X is "Git for Meaning" — a semantic version control system for AI conversations. It provides evidence-backed, deterministic semantic extraction with versioning, branching, and merging capabilities similar to Git.

**Key philosophy**: The core deterministic layer never depends on LLMs. LLMs are optional plugins for enhancement (SummaryAgent, MergeAgent).

## Open-Core Architecture

T3X uses a dual-repository open-core model:

| Repository | Visibility | Purpose |
|-----------|------------|---------|
| `t3x` (this repo) | Public / Open-source | Core engine, full product, self-hosted |
| `t3x_cloud` (private) | Private | SaaS layer — OAuth, billing, team features |

### npm Packages

Core packages are published to npm as `@t3x-dev/*` via [Changesets](https://github.com/changesets/changesets):

| Package | Source | Description |
|---------|--------|-------------|
| `@t3x-dev/yops` | `packages/yops` | YOps — 18 declarative YAML operations (spec-driven) |
| `@t3x-dev/core` | `packages/core` | T3X engine — diff, merge, hash chains, extraction |
| `@t3x-dev/storage` | `packages/storage` | PostgreSQL persistence (Drizzle ORM) |
| `@t3x-dev/api` | `apps/api` | Hono API server with `createApp()` factory |

The private `t3x_cloud` repo consumes these packages from npm, extending the API with OAuth and SaaS features.

### Auth Strategy

- **Public repo (self-hosted)**: Built-in username + password registration/login via `auth-local.openapi.ts`
- **Private repo (cloud SaaS)**: GitHub & Google OAuth via NextAuth.js; local auth disabled with `skipLocalAuth: true`

### createApp() Factory

`apps/api` exports a `createApp()` factory function that supports extension by the cloud repo:

```typescript
import { createApp, CreateAppOptions } from '@t3x-dev/api';

// CreateAppOptions:
//   skipLocalAuth?: boolean     — Disable username/password routes (for SaaS)
//   middleware?: MiddlewareHandler[]  — Additional middleware (e.g., OAuth)
//   routes?: (api: OpenAPIHono) => void  — Additional routes (e.g., billing)
```

### Local Development with t3x_cloud

When developing both repos together, use the link script in `t3x_cloud`:

```bash
cd ../t3x_cloud
./scripts/link-local.sh on    # Symlink local @t3x-dev packages
./scripts/link-local.sh off   # Restore npm versions
```

## Repository Structure

This is a pnpm monorepo managed by Turborepo:

```
t3x/
├── packages/
│   ├── yops/           # @t3x-dev/yops - YOps: 18 declarative YAML operations (spec-driven)
│   ├── yschema/        # YAML schema helpers (shared validation primitives)
│   ├── core/           # @t3x-dev/core - T3X engine: diff, merge, hash chains, extraction
│   ├── storage/        # @t3x-dev/storage - PostgreSQL persistence (Drizzle ORM)
│   ├── api/            # @t3x-dev/api - createApp() factory library (Hono + OpenAPI routes)
│   └── api-client/     # @t3x-dev/api-client - TypeScript API client
├── apps/
│   ├── web/            # t3x-webui - Next.js 16 frontend (App Router + XYFlow)
│   ├── api/            # Hono API server binary — wraps packages/api via createApp()
│   ├── runner/         # @t3x-dev/runner - Grey-box agent evaluation engine (server + shared lib)
│   ├── cli/            # @t3x-dev/cli - Command line interface
│   ├── mcp/            # @t3x-dev/mcp - MCP server exposing T3X tools to AI agents
│   └── agent-demo/     # Demo agent for testing
├── biome.json          # Linting and formatting config
├── turbo.json          # Turborepo task config
└── docker-compose.yml
```

**Note:** `packages/api` is the published library containing route definitions and the `createApp()` factory; `apps/api` is the runnable server that wraps it. `apps/runner` serves both as the runner binary and the published `@t3x-dev/runner` library (no separate `packages/runner`).

## Build Commands

### Monorepo (from root)
```bash
pnpm install                    # Install all dependencies
pnpm build                      # Build all packages
pnpm test                       # Run all tests
pnpm lint                       # Biome lint
pnpm lint:fix                   # Biome lint + auto-fix
pnpm check                      # Biome check (lint + format)
pnpm check:fix                  # Biome check + auto-fix
```

### Package-specific builds
```bash
pnpm build:core                 # Build @t3x-dev/core
pnpm build:storage              # Build @t3x-dev/storage
pnpm build:webui                # Build t3x-webui
pnpm build:api                  # Build @t3x-dev/api
pnpm build:runner               # Build @t3x-dev/runner

pnpm test:core                  # Test @t3x-dev/core
pnpm test:storage               # Test @t3x-dev/storage
pnpm test:webui                 # Test t3x-webui
pnpm test:runner                # Test @t3x-dev/runner
```

### Development servers
```bash
pnpm dev:webui                  # Next.js dev server (port 3000)
pnpm dev:api                    # Hono API server (port 8000)
pnpm dev:agent                  # Demo agent (port 9000)
cd apps/runner && pnpm dev      # Runner server (port 8080)
```

### Run single test
```bash
# From package directory
vitest run src/__tests__/some.test.ts           # Specific file
vitest run -t "creates a new project"           # By test name
```

### Docker
```bash
docker compose up -d --build               # Default: postgres + api + webui
docker compose --profile runner up -d      # Include runner
docker compose --profile n8n up -d         # Include n8n workflow engine
docker compose down
```

Ports: WebUI (3000), API (8000), PostgreSQL (5432), Runner (8080), Agent Demo (9000), n8n (5678)

## Architecture

### Package Dependencies

```
packages/yops (@t3x-dev/yops)          ← standalone, zero deps

packages/core (@t3x-dev/core)
  └─► packages/yops

packages/storage (@t3x-dev/storage)
  └─► packages/core

packages/api (@t3x-dev/api)            ← route/createApp library
  ├─► packages/core
  ├─► packages/storage
  └─► apps/runner (@t3x-dev/runner)

apps/api (server binary)
  └─► packages/api

apps/web (t3x-webui)
  └─► packages/storage

apps/cli (@t3x-dev/cli)
  ├─► packages/core
  └─► packages/api-client (@t3x-dev/api-client)

apps/mcp (@t3x-dev/mcp)
  ├─► packages/core
  └─► packages/api-client
```

### YOps Architecture (packages/yops)

YOps is the declarative YAML operation engine. Three layers, like OpenAPI / Zod / Hono:

| Layer | File(s) | Role | Analogy |
|-------|---------|------|---------|
| **YOps** | `yops.yaml` | Operation spec — fields, rules, errors, test cases | OpenAPI |
| **Registry** | `registry.ts`, `spec.ts` | Parse spec, validate handlers, enforce field contracts | Zod |
| **Engine** | `engine.ts`, `handlers/` | Dispatch and execute operations | Hono |

```
yops.yaml (spec)  →  Registry (validates)  →  Engine (executes)
```

- `yops.yaml` is the runtime source of truth — parsed at init, not just documentation
- Registry validates every spec op has a handler, and validates fields before every handler call
- 18 ops organized into DDL (structure), DML (data), DTL (transform), DCL (control)
- Conformance tests in `yops.yaml` — any language can run them to verify their engine

`@t3x-dev/core` imports `@t3x-dev/yops` and extends it with `relate`/`unrelate` (T3X-specific semantic operations).

### Three-Layer Design

| Layer | Package | LLM Required? |
|-------|---------|---------------|
| **YOps Engine** | `@t3x-dev/yops` | No (deterministic) |
| **T3X Core** | `@t3x-dev/core` | No (deterministic) |
| **Storage Layer** | `@t3x-dev/storage` | No |
| **Agentic Layer** | SummaryAgent/MergeAgent plugins | Optional |
| **Product Layer** | `t3x-webui`, `@t3x-dev/api`, `@t3x-dev/runner` | No |

### Storage Architecture

T3X uses PostgreSQL (via Drizzle ORM):
- **Embedded PostgreSQL** for local development
- **Postgres** for Docker/production
- **Supabase** adapter available

Schema is split across several files in `packages/storage/src/`:

| File | Tables |
|------|--------|
| `schema.ts` | Core: `projects`, `conversations`, `turns`, `branches`, `agent_drafts`, `drafts`, `leaves`, `leaf_history`, `leaf_output_edits`, `pins`, `conversation_contexts`, `merge_drafts`, `deploy_agents`, `runs`, `segment_embeddings`, `saved_comparisons`, `templates`, `recipes`, `webhooks`, `share_tokens`, `users`, `accounts`, `api_keys`, `notifications`, `global_settings`, `yops_log` |
| `schema-commits.ts` | `commits`, `commit_rewrites`, `frame_lineage` |
| `schema-trees.ts` | `trees`, `tree_relations`, `knowledge_nodes`, `knowledge_edges`, `knowledge_node_members` |
| `schema-knowledge-conflicts.ts` | `knowledge_conflicts` |
| `schema-node-modifications.ts` | `node_modifications` |
| `schema-extraction-feedback.ts` | `extraction_feedback` |
| `schema-metrics.ts` | `metrics_events`, `token_usage`, `topics` |
| `schema-tree-state.ts` | Tree state helpers (no standalone tables) |

### Hash Chains

- **Turn chain**: `parent_turn_hash → turn_hash` (SHA-256 of JCS-canonicalized JSON)
- **Commit chain**: DAG with `parent_hashes[]`, supports branching and merging

### Extraction Pipeline (t3x-core)

Extraction converts raw conversation turns into a YOps-mutated knowledge tree. The pipeline lives in `packages/core/src/extractors/` and is LLM-assisted, but the mutation path is deterministic (YOps).

| Stage | Files | Role |
|-------|-------|------|
| **Prompt build** | `extractionPrompt.ts`, `yopsPrompt.ts`, `extractionStyleConfig.ts` | Assemble extraction or incremental-YOps prompts (style, few-shot, context) |
| **Strategy** | `strategies/yaml-strategy.ts`, `extractor.ts` | Dispatch to LLM via provider, route through chosen strategy |
| **Parse** | `yopsParser.ts` | Parse LLM-emitted YOps YAML into validated ops |
| **Relations** | `relationExtractor.ts`, `relationPrompt.ts`, `relationParser.ts` | Second LLM pass to infer inter-node relations (`relate`/`unrelate`) |
| **Transforms** | `transforms/` (`consolidate`, `nest`, `flagContradictions`, `checkRegression`) | Deterministic post-processing on the extracted tree |
| **Repair / correction** | `repairPrompt.ts`, `correctionPrompt.ts`, `fuzzyLocate.ts` | Retry prompts when parse/validation fails; locate source spans |
| **Compression** | `compressor.ts`, `compressPrompt.ts` | Optional size reduction of large extraction results |
| **Adaptive thresholds** | `adaptiveThresholds.ts` | Tune similarity/inclusion thresholds per project |

**Flow:** `turns → extraction prompt → LLM → YOps YAML → parser → apply via @t3x-dev/yops → relation pass → deterministic transforms → tree mutation`. The LLM only proposes YOps; all tree mutation goes through the YOps engine, preserving determinism and auditability (see `yops_log` table).

### Diff Engine (t3x-core)

Words-based semantic diff engine for comparing commits:
- **Two-way diff**: Compare Draft vs parent Commit (self-check scenario)
- **Three-way diff**: Merge preview with conflict detection (merge scenario)

**Design**: Storage = Sentence, Diff = Word, Merge = Three-Way

Algorithm uses tiered matching:
1. **Exact match** (O(N+M)): Identical sentences skip diff
2. **Jaccard filter** (fast): Find candidate pairs with Jaccard >= 0.3
3. **LCS word diff** (per pair): Word-level changes within matched sentences
4. **Classify remainder**: Unpaired sentences as added/removed

See `docs/specification/words-based-diff-merge-architecture.md` for full specification.

### Merge System (t3x-core)

Two-phase merge process:
1. **prepareMerge**: Analyzes source/target commits, returns merge result with:
   - `identical`: Auto-kept sentences (no user action)
   - `similarPairs`: User must choose source or target (with `word_diff` for display)
   - `onlyInSource`/`onlyInTarget`: User can keep or discard
2. **executeMerge**: Applies user decisions, generates merged commit

Resolution types: `source` | `target` | `both` (keep both sentences) | `edit` (custom text)

### Runner (apps/runner)

Grey-box agent evaluation engine:
- **Observer**: Captures agent I/O traces (LLM calls, tool invocations)
- **EvalEngine**: Runs test steps against traces using rule-based assertions
- **n8n Integration**: Workflow execution and trace collection

```typescript
// Usage pattern
import { observer, evalEngine } from '@t3x-dev/runner';

observer.registerAgent({ id: 'my-agent', endpoint: 'http://...', type: 'http' });
const runId = observer.startRun('my-agent', { input: { query: 'hello' } });
observer.recordLLMCall(runId, prompt, response, 'gpt-4', 500);
const trace = observer.completeRun(runId, output, 'completed');
const result = await evalEngine.evaluate({ trace, test_steps: [...] });
```

## WebUI Architecture (apps/web)

```
src/
├── app/                          # Next.js App Router
│   ├── api/v1/chat/stream/      # Chat streaming endpoint
│   ├── project/[projectId]/     # Project canvas page
│   │   ├── leaf/[leafId]/       # Leaf detail page
│   │   ├── merge/[mergeId]/     # Merge workspace page
│   │   └── conversation/[conversationId]/
│   ├── insights/                # Insights page
│   └── deploy/                  # Deploy & compare pages
├── components/                  # React components
│   ├── ui/                      # shadcn/ui base components
│   ├── canvas/                  # Canvas workspace (nodes, modal, panels)
│   ├── leaf/                    # Leaf-specific components
│   ├── merge/                   # Merge workspace components
│   ├── diff/                    # Diff visualization
│   ├── shared/                  # Shared UI (TurnBubble, etc.)
│   ├── conversation/            # Conversation components
│   └── optimiser/               # Agent evaluation UI
├── store/                       # Zustand state management (L3 — UI state only)
│   ├── canvasStore.ts           # Canvas store (core state + slice composition)
│   ├── canvasStoreTypes.ts      # Shared CanvasState type + slice interfaces
│   ├── canvasStoreUtils.ts      # Pure utility functions (layout, position, graph helpers)
│   ├── canvasMergeSlice.ts      # Merge domain slice
│   ├── canvasLeafSlice.ts       # Leaf panel domain slice
│   ├── canvasCommitSlice.ts     # Commit domain slice
│   ├── canvasNodeSlice.ts       # Node domain slice
│   ├── pinsStore.ts             # V4 pin management (CRUD, selectors)
│   ├── projectStore.ts          # Project state
│   ├── mergeWorkspaceStore.ts   # Full-screen merge workspace state
│   ├── commitStore.ts           # Commit list state
│   ├── commitDetailStore.ts     # Selected commit detail state
│   ├── draftWorkspaceStore.ts   # Draft workspace state
│   ├── knowledgeGraphStore.ts   # Knowledge graph view state
│   ├── chatStore.ts, chatSessionStore.ts  # Chat UI state
│   ├── searchStore.ts           # Search UI state (delegates I/O to queries/)
│   ├── sessionStore.ts, settingsStore.ts, templateStore.ts, workspaceStore.ts
│   └── optimiserStore.ts        # Agent evaluation UI state (persisted)
├── queries/                     # L3 entry points for data fetching (call infrastructure L1)
├── infrastructure/              # L1 adapters — raw API/storage I/O (mergeApi, conversationLoader, yopsLog)
├── commands/                    # User-intent commands dispatched from UI
├── hooks/                       # React hooks (useApi, useBranchCommits, useReducedMotion, …)
├── lib/                         # Shared utilities (api.ts, db.ts, diffUtils, elkLayout, highlightUtils, …)
├── utils/                       # Pure utility functions
├── data/                        # Static data
├── types/                       # Shared TypeScript types
├── middleware.ts                # Next.js middleware
└── __tests__/                   # API route tests
```

**Layering (L1/L2/L3):** `infrastructure/` is L1 (pure I/O adapters), `queries/` is the L3 entry for reads, `store/` is forbidden from touching I/O directly — stores delegate to `queries/` and `commands/`. This is the active refactor on branch `refactor/store-l1-ban-and-infrastructure-merge`.

### API Response Format
```json
{ "success": true, "data": {...} }
{ "success": false, "error": { "code": "...", "message": "..." } }
```

API uses snake_case for JSON fields, internal code uses camelCase.

### Canvas State (Zustand)
- **Nodes**: Conversations, commits (pending/committed), leaf nodes
- **Edges**: Data flow connections
- **Locking**: Committed commits and upstream nodes are immutable

### Canvas Store Architecture

The canvas store uses the Zustand slice pattern for modular state management:

```
canvasStore.ts          ← Entry point: create<CanvasState>(slices + core)
├── canvasStoreTypes.ts ← Shared types: CanvasState, slice interfaces
├── canvasStoreUtils.ts ← Pure functions: layout, position, graph traversal
├── canvasMergeSlice.ts ← Merge domain
├── canvasLeafSlice.ts  ← Leaf panel domain
├── canvasCommitSlice.ts← Commit domain
└── canvasNodeSlice.ts  ← Node domain
```

All consumers import from `canvasStore.ts` (re-exports selectors/types for backward compatibility).

## Testing

All packages use **vitest** with embedded PostgreSQL for isolated test databases:

```typescript
// Test setup pattern
import { setupTestDB, testData } from '../setup';

vi.mock('@/lib/db', () => ({
  getDB: vi.fn(() => Promise.resolve(mockDB)),
}));
```

## Key Data Formats

### Turn Record
```json
{
  "turn_hash": "sha256:...",
  "parent_turn_hash": "sha256:...",
  "project_id": "proj_...",
  "conversation_id": "conv_...",
  "role": "user|assistant|system|tool",
  "content": "...",
  "created_at": "ISO8601"
}
```

### SentenceCommit Record (Current)
```json
{
  "hash": "sha256:...",
  "schema": "t3x/commit/v4",
  "parents": ["sha256:..."],
  "author": { "type": "human|agent", "id": "...", "name": "..." },
  "committed_at": "ISO8601",
  "content": {
    "sentences": [
      {
        "id": "s_abc123",
        "text": "...",
        "source_ref": {
          "conversation_id": "conv_...",
          "turn_hash": "sha256:...",
          "start_char": 0,
          "end_char": 50
        }
      }
    ]
  },
  "project_id": "proj_...",
  "message": "...",
  "branch": "main",
  "source_refs": [
    { "type": "conversation|leaf", "id": "...", "title": "...", "assertion_lessons": ["..."] }
  ]
}
```

**Key point**: SentenceCommit content has sentences ONLY. No constraints. Constraints belong to Leaf.

**Field Classification:**
- **First-class (in hash)**: `hash`, `schema`, `parents`, `author`, `committed_at`, `content`
- **Second-class (not in hash)**: `project_id`, `message`, `branch`, `source_refs`, `position_x`, `position_y`

### Leaf Record (V4)
```json
{
  "id": "leaf_abc123",
  "commit_hash": "sha256:...",
  "type": "deploy_agent|tweet|weibo|wechat|email|article|slack|eval",
  "title": "...",
  "constraints": [
    { "id": "cst_def456", "type": "require", "match_mode": "exact|semantic", "value": "..." },
    { "id": "cst_ghi789", "type": "exclude", "match_mode": "exact|semantic", "value": "...", "reason": "..." }
  ],
  "config": { "prompt_template": "...", "model": "...", "max_tokens": 4096 },
  "output": "...",
  "assertions": [
    { "id": "ast_jkl012", "constraint_id": "cst_def456", "passed": true, "details": "...", "lesson": "..." }
  ],
  "project_id": "proj_...",
  "created_at": "ISO8601"
}
```

### Pin Record (V4)
```json
{
  "id": "pin_mno345",
  "project_id": "proj_...",
  "type": "conversation|leaf",
  "ref_id": "conv_...|leaf_...",
  "selected_assertion_ids": ["ast_..."],
  "pinned_at": "ISO8601"
}
```

### CommitV3 Record (Legacy)
```json
{
  "hash": "sha256:...",
  "schema": "commit/v3",
  "parents": ["sha256:..."],
  "author": { "name": "user", "identity": "...", "verification": "none|device|verified" },
  "committed_at": "ISO8601",
  "content": {
    "sentences": [
      { "id": "s1", "text": "...", "source": { "turn_hash": "...", "start_char": 0, "end_char": 50 } }
    ],
    "constraints": [
      { "type": "require", "id": "c1", "value": "...", "match": "exact|semantic", "source_sentence_id": "s1" },
      { "type": "exclude", "id": "c2", "value": "...", "match": "exact|semantic", "reason": "..." }
    ]
  },
  "project_id": "proj_...",
  "message": "...",
  "branch": "main"
}
```

## Important Design Constraints

1. **Determinism**: Core algorithms must be 100% reproducible — same inputs always produce same outputs
2. **Append-only**: Hash chains are immutable; any modification breaks integrity
3. **Plugin architecture**: Extractors and embedders are pluggable
4. **Evidence-backed**: Every semantic finding traces to source turns with verbatim quotes

## Environment Variables

### User-facing (`.env` or shell)

- `ANTHROPIC_API_KEY`: Required for extraction, chat, and generation
- `GOOGLE_AI_STUDIO_KEY`: Optional — Gemini models and embeddings

### Docker-internal (defaults in `docker-compose.yml`)

- `DATABASE_URL`: PostgreSQL connection string (auto-set in Docker)
- `NEXT_PUBLIC_API_URL`: T3X API server URL (default: http://localhost:8000)
- `AUTH_DISABLED`: Set `true` for self-hosted (default), `false` for production

### Runner/n8n (optional profiles)

- `N8N_API_KEY`: n8n API key
- `TRACE_POLICY`: `always` | `on_failure` | `on_violation`

### Cloud-only (in `t3x_cloud` repo, not here)

- `GITHUB_CLIENT_ID/SECRET`, `GOOGLE_CLIENT_ID/SECRET`, `NEXTAUTH_SECRET` — OAuth for SaaS

## ID Conventions

T3X uses prefixed IDs for type safety:
- `proj_` - Project IDs
- `conv_` - Conversation IDs
- `s_` - Sentence IDs (V4, e.g., `s_abc123`)
- `cst_` - Constraint IDs (V4, e.g., `cst_def456`)
- `ast_` - Assertion IDs (V4, e.g., `ast_ghi789`)
- `leaf_` - Leaf IDs (V4, e.g., `leaf_jkl012`)
- `lhist_` - Leaf history IDs (V4, e.g., `lhist_pqr678`)
- `pin_` - Pin IDs (V4, e.g., `pin_mno345`)
- `ak_` - API key IDs (raw key values use prefix `t3xk_`)
- `share_` - Share token IDs
- `draft_` - Draft IDs
- `dc_` - Draft constraint IDs
- `rel_` - Relation IDs
- Legacy: `s1`, `s2` (sentence), `c1`, `c2` (constraint), `mc1` (merged constraint) - V3 format

Source of truth: `ID_PREFIXES` in `packages/core/src/types/index.ts`.

## API Naming Conventions

- **API/Database/TypeScript types**: `snake_case` (e.g., `turn_hash`, `project_id`, `committed_at`)
- **JavaScript variables**: `camelCase` (e.g., `turnHash`, `projectId`, `committedAt`)
- **API responses**: Return `null` for absent optional fields
- **TypeScript interfaces**: Use `?` for optional fields (maps to `undefined`)

## V4 Architecture Parallel Development Rules

> Status: Active (Core types, storage, API, and WebUI integration implemented)
> Related docs: docs/specification/semantic-layer-architecture.md, docs/specification/memory-pin-system-design.md

### Contract Files (Single Source of Truth)

| File | Purpose | Can Modify Alone? |
|------|---------|-------------------|
| packages/core/src/types/index.ts | TypeScript types (V4 types live here; no separate v4/ dir) | ❌ No |
| packages/storage/src/schema.ts (+ schema-*.ts shards) | Database schema | ❌ No |
| packages/api/src/schemas/contracts.ts | API contracts | ❌ No |

Rule: Contract = Law, Implementation = Freedom

- ✅ Implement according to contracts freely
- ❌ Do NOT modify contract files without team agreement
- If contract needs change → discuss first → modify together → both review PR

### Import Rules

```typescript
// ✅ Correct: Import from @t3x-dev/core
import { SentenceCommit, Leaf, Pin, Constraint } from '@t3x-dev/core';

// ❌ Wrong: Redefine types locally
interface Leaf { ... }  // DON'T DO THIS
```

### Naming Conventions

| Layer | Convention | Example |
|-------|------------|---------|
| TypeScript types | snake_case | commit_hash, selected_pin_ids |
| DB columns | snake_case | commit_hash, selected_pin_ids |
| API JSON | snake_case | { "commit_hash": "..." } |
| JS variables | camelCase | const commitHash = ... |

### ID Prefixes

| Entity | Prefix | Example |
|--------|--------|---------|
| Sentence | s_ | s_abc123 |
| Constraint | cst_ | cst_def456 |
| Assertion | ast_ | ast_ghi789 |
| Leaf | leaf_ | leaf_jkl012 |
| LeafHistory | lhist_ | lhist_pqr678 |
| Pin | pin_ | pin_mno345 |

### V4 Architecture Summary

```
SentenceCommit  = Sentences only (pure knowledge, NO constraints)
Leaf            = Constraints + Output + Validation (application layer)
LeafHistory     = Snapshot of each generation (for rollback/comparison)
Pin             = Source selection (for commit sources + conversation context)
ConversationCtx = Per-conversation pin selection (customize LLM context)
BuiltContext    = Assembled context for LLM consumption (text + token estimate + sources)
```

### Track Assignment

- Track A (Storage/Core): commits-v4.ts, leaves.ts, pins.ts queries, context builder
- Track B (API/UI): /v1/leaves, /v1/pins routes, WebUI stores, components

## Documentation Index

At the start of a new conversation, read relevant documentation based on task type:

| Task Type | Documentation to Read |
|-----------|----------------------|
| **Product & Strategy** | `docs/product-strategy.md`, `docs/product-roadmap.md`, `docs/product-assessment.md` |
| **Product Overview** | `docs/product-overview/01-product-and-user-layer.md`, `docs/product-overview/02-architecture-and-design-layer.md`, `docs/product-overview/03-engineering-and-implementation-layer.md` |
| **Team Collaboration** | `docs/collaboration-protocol.md`, `docs/phase0-protocol.md` |
| WebUI Development | `apps/web/README.md`, `apps/web/src/store/`, `docs/frontend-rules.md`, `docs/frontend-design-principles.md`, `docs/frontend-art-template.md`, `docs/frontend-ia-map.md` |
| API / Backend Development | `apps/api/src/schemas/contracts.ts`, `docs/backend-rules.md`, `docs/API_REFERENCE.md`, `apps/api/docs/merge-api.md`, `apps/api/docs/openapi-summary.md` |
| Architecture Development | `docs/specification/semantic-layer-architecture.md`, `docs/specification/memory-pin-system-design.md` |
| Source Context / Highlighting | `docs/specification/commit-source-context-presentation.md`, `docs/specification/commit-source-context-implementation-review.md` |
| Diff / Merge Algorithms | `docs/specification/words-based-diff-merge-architecture.md` |
| Core Algorithms | `packages/core/src/types/`, `docs/specification/ring-schema.md` |
| Storage Layer | `packages/storage/src/schema.ts` (+ `schema-commits.ts`, `schema-trees.ts`, `schema-metrics.ts`, etc.) |
| Runner/Eval | `apps/runner/docs/README.md`, `apps/runner/docs/ARCHITECTURE.md`, `apps/runner/docs/n8n-workflow-setup.md` |
| Testing | `docs/LOCAL_TESTING.md`, `docs/testing/bvt-smoke.md`, `docs/testing/e2e-test-plan.md` |
| Docker / Deployment | `docs/docker.md` |
| Demo / Pitch | `docs/demo-script-investor-pitch-v2.md`, `docs/demo/demo-preparation.md` |
| Go-to-Market / Growth | `docs/go-to-market/README.md` (index for all 8 GTM docs) |
| Competitive Analysis | `docs/competitive-analysis.md`, `docs/rfcs/langfuse-integration.md` |

## Development Workflow

Users may not be familiar with code details. Claude should proactively explore; users only make decisions:

1. **After receiving requirements**: First search for similar code/components, find existing patterns
2. **Before modifying**: Analyze impact scope, list files/interfaces that will change
3. **When multiple approaches exist**: List options, ask user which to choose
4. **When uncertain**: Ask specific decision questions, rather than asking user to explain code

User only needs to: Describe goal → Answer decision questions → Accept results

### Code Reuse Principles

**Priority: Reuse > Modify > Create New**

1. **Prefer reuse**: First search if similar functionality/components/utility functions already exist in the project; reuse directly if possible
2. **Then modify**: If existing code doesn't fully match, consider extending or modifying the original version
3. **Last resort - create new**: Only create new code when reuse and modification are not feasible

Before writing code, must first answer: Does the project already have something similar?

## Known Pitfalls

| Problem | Cause | Correct Approach |
|---------|-------|------------------|
| DELETE route 404 | `index.ts` imports `projects.ts` instead of `projects.openapi.ts` | Check if import path points to correct file |
| API call fails | Assuming API is in Next.js (old architecture) | API is in `apps/api` (port 8000), WebUI is in `apps/web` (port 3000) |
| Tests can't find module | Dependency packages not built first | Run `pnpm build:core && pnpm build:storage` first |
| Tailwind styles not working | Global styles in `globals.css` (e.g., `button { background: none }`) not in `@layer`, takes precedence over Tailwind utility classes | Global reset styles must be in `@layer base`, or remove conflicting properties |

## Bug Fixing Principles

**NEVER glue-fix bugs.** Always find the root cause or architectural issue. A patch that works around missing data, wrong types, or broken contracts is NOT a fix — it hides the real problem and creates tech debt.

Priority order when something is broken:
1. **Find the root cause** — trace the data flow end-to-end, identify WHERE it breaks and WHY
2. **Fix the architecture** — if the schema is wrong, fix the schema. If the data isn't persisted, fix the persistence layer. If a type is missing, add it to the source of truth.
3. **Remove retired/deprecated code immediately** — dead code, deprecated aliases, legacy types that should have been removed are HIGHER PRIORITY than fixing new bugs. They cause confusion and mask real issues.
4. **Never patch the read path** to work around write-path bugs — fix the write path
5. **Never add compatibility shims** when you can fix the source — if the database doesn't store a field, add the column, don't reconstruct it at query time

## Prohibited Actions

- **Don't commit without asking**: Always ask the user for confirmation before running `git commit` or `git push`
- **Don't add AI markers**: Never include `Co-Authored-By`, Claude's email, or any AI-generated attribution tags in commit messages, PR titles, or PR descriptions. No "Generated with Claude Code" footer in PR body either
- **Use English only**: All commit messages, PR titles, and PR descriptions must be in English
- **Always reference issues**: When changes relate to GitHub issues, commit messages must include `(#issue)` and PR body must include `Resolves #issue` (or `Closes #issue`) so merging auto-closes them
- **Don't guess code locations**: Use Grep/Glob to search first
- **Don't assume architecture**: API and WebUI are separated after 2025-12 migration
- **Don't rush to modify**: Read code first, understand context, confirm impact scope
- **Don't skip verification**: Must run related tests after changes
- **Don't glue-fix**: Never patch symptoms — find and fix root causes

## Commit Message Standards

Project uses Conventional Commits format:

```
<type>(<scope>): <description> [Track].(#issue)

# Examples
feat(api): add V4 leaves endpoint [B1].(#123)
fix(web): resolve canvas node drag issue [B2].(#124)
test(storage): add commits-v4 query tests [A1].(#125)
docs: update CLAUDE.md with workflow rules
```

| type | Purpose |
|------|---------|
| feat | New feature |
| fix | Bug fix |
| test | Test related |
| docs | Documentation update |
| refactor | Refactoring (no behavior change) |
| chore | Build/toolchain changes |

Track markers: `[A1]`, `[A2]` = Track A (Storage/Core), `[B1]`, `[B2]` = Track B (API/UI)

## MCP Server (@t3x-dev/mcp)

T3X MCP Server exposes 36 tools for AI agents (Claude Code, Cursor, etc.) to perform semantic version control. Tool files are in `apps/mcp/src/tools/` (one file per tool) — count reflects the current directory; update this number when tools are added or removed.

### Setup

```bash
# 1. Build
pnpm build:core && cd packages/api-client && pnpm build && cd ../../apps/mcp && pnpm build

# 2. Start API server
pnpm dev:api

# 3. Configure Claude Code (project .mcp.json already exists at repo root)
# Or add to ~/.claude.json:
{
  "mcpServers": {
    "t3x": {
      "command": "node",
      "args": ["apps/mcp/dist/index.js"],
      "env": {
        "T3X_API_URL": "http://localhost:8000/api",
        "T3X_WEB_URL": "http://localhost:3000"
      }
    }
  }
}
```

### Auth

- **T3X_API_KEY env var** (highest priority): Set in MCP config, skips browser auth
- **Browser auth**: MCP opens login page, receives token via callback, stores in `~/.t3x/mcp-token.json`
- **401 auto-retry**: If token expires mid-session, MCP re-authenticates automatically

### Agent Workflow

```
Extract → Triage → Edit → Commit:
  t3x_create_project({ name })              → project_id
  t3x_extract({ project_id, text })         → draft_id
  t3x_show_draft({ draft_id })              → nodes, revision
  t3x_yops_schema()                         → learn YOps format
  t3x_edit_draft({ draft_id, yops, if_revision }) → updated trees
  t3x_commit({ project_id, draft_id })      → commit_hash

Merge:
  t3x_merge_prepare({ source_hash, target_hash }) → autoKept, conflicts
  t3x_merge_execute({ ..., decisions, message })   → merge commit_hash
```

### MCP Development

```bash
cd apps/mcp
pnpm build                    # Build MCP server
npx vitest run                # Run all tests (unit + E2E)
pnpm dev                      # Run with tsx (dev mode)
```

Tool files are in `apps/mcp/src/tools/`, one file per tool. Register new tools in `apps/mcp/src/index.ts`.

## Quick Debug Commands

```bash
# Check port usage
lsof -i :8000                    # API port
lsof -i :3000                    # WebUI port

# View API logs (real-time)
pnpm dev:api 2>&1 | tee api.log

# Clean rebuild
pnpm clean && pnpm install && pnpm build

# Test a single file
cd apps/api && pnpm vitest run src/__tests__/leaves.test.ts

# Test specific case
cd apps/api && pnpm vitest run -t "should create leaf"
```

## Viewing WebUI (Playwright)

When asked to "look at" or "check" the WebUI, use **Playwright** to capture screenshots. WebFetch does not work for localhost, and curl only returns the HTML shell (Next.js is client-rendered).

```bash
# Screenshot a page (wait for JS to render)
npx playwright screenshot --wait-for-timeout=3000 "http://localhost:3000/project/proj_xxx" /path/to/output.png

# Full page screenshot (captures scrollable content)
npx playwright screenshot --wait-for-timeout=3000 --full-page "http://localhost:3000/project/proj_xxx/leaf/leaf_xxx" /path/to/output.png
```

Then use the Read tool to view the screenshot image.

**Common pages to check:**
- Project canvas: `http://localhost:3000/project/{projectId}`
- Leaf detail: `http://localhost:3000/project/{projectId}/leaf/{leafId}`
- Merge workspace: `http://localhost:3000/project/{projectId}/merge/{mergeId}`
- Insights: `http://localhost:3000/insights`

**Note:** Screenshots are saved to the scratchpad directory for temporary use.

## Dependency Build Order

After modifying lower-level packages, rebuild the dependency chain:

```
After @t3x-dev/core changes:
  pnpm build:core && pnpm build:storage && pnpm build:api

After @t3x-dev/storage changes:
  pnpm build:storage && pnpm build:api

After apps/api changes:
  pnpm build:api (or just pnpm dev:api for hot reload)
```

**Tests depend on build**: Ensure related packages are built before running tests

## PR Submission Checklist

Confirm before submitting PR:

- [ ] `pnpm check` passes (lint + format)
- [ ] Related tests pass (`pnpm test:xxx`)
- [ ] New code has corresponding tests
- [ ] No `console.log` introduced (remove debug logs)
- [ ] Types are correct (no `any` escapes)
- [ ] API changes updated OpenAPI schema
- [ ] Breaking changes documented in PR description

## Common Search Patterns

```bash
# Find API route implementation
Grep: "router.post.*leaves"  glob: "apps/api/**/*.ts"

# Find type definition
Grep: "interface.*Leaf"  glob: "packages/core/**/*.ts"

# Find all calls to a function
Grep: "createLeaf\\("  (no glob restriction)

# Find database schema
Grep: "export const.*Table"  glob: "packages/storage/**/*.ts"

# Find Zustand store
Grep: "create\\(.*\\).*=>"  glob: "apps/web/src/store/**/*.ts"
```

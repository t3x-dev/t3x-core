# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

T3X is "Git for Meaning" — a semantic version control system for AI conversations. It provides evidence-backed, deterministic semantic extraction with versioning, branching, and merging capabilities similar to Git.

**Key philosophy**: The core deterministic layer never depends on LLMs. LLMs are optional plugins for enhancement (SummaryAgent, MergeAgent).

## Repository Structure

This is a pnpm monorepo managed by Turborepo:

```
t3x/
├── packages/
│   ├── core/           # @t3x/core - Deterministic semantic engine
│   ├── storage/        # @t3x/storage - PostgreSQL persistence (Drizzle ORM)
│   ├── api-client/     # @t3x/api-client - TypeScript API client
│   └── runner/         # @t3x/runner - Shared runner library (schemas, evaluator, trace)
├── apps/
│   ├── web/            # t3x-webui - Next.js 16 frontend (App Router + XYFlow)
│   ├── api/            # @t3x/api - Hono API server with OpenAPI
│   ├── runner/         # @t3x/runner - Grey-box agent evaluation engine (server)
│   ├── cli/            # @t3x/cli - Command line interface
│   └── agent-demo/     # Demo agent for testing
├── biome.json          # Linting and formatting config
├── turbo.json          # Turborepo task config
└── docker-compose.yml
```

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
pnpm build:core                 # Build @t3x/core
pnpm build:storage              # Build @t3x/storage
pnpm build:webui                # Build t3x-webui
pnpm build:api                  # Build @t3x/api
pnpm build:runner               # Build @t3x/runner

pnpm test:core                  # Test @t3x/core
pnpm test:storage               # Test @t3x/storage
pnpm test:webui                 # Test t3x-webui
pnpm test:runner                # Test @t3x/runner
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
apps/web (t3x-webui)
  └─► packages/storage (@t3x/storage)
        └─► packages/core (@t3x/core)

apps/api (@t3x/api)
  ├─► packages/storage
  ├─► packages/core
  └─► apps/runner (@t3x/runner)

apps/cli (@t3x/cli)
  ├─► packages/core
  └─► packages/api-client (@t3x/api-client)
```

### Three-Layer Design

| Layer | Package | LLM Required? |
|-------|---------|---------------|
| **Framework Core** | `@t3x/core` | No (deterministic) |
| **Storage Layer** | `@t3x/storage` | No |
| **Agentic Layer** | SummaryAgent/MergeAgent plugins | Optional |
| **Product Layer** | `t3x-webui`, `@t3x/api`, `@t3x/runner` | No |

### Storage Architecture

T3X uses PostgreSQL (via Drizzle ORM):
- **PGLite** for local development (PostgreSQL WASM, data in `.t3x/database/`)
- **Postgres** for Docker/production
- **Supabase** adapter available

Key tables: `projects`, `conversations`, `turns_v2`, `branches`, `commits_v3`, `drafts_v2`, `commits_v4`, `leaves`, `pins`, `leaf_history`, `conversation_contexts`, `segment_embeddings`, `merge_drafts`, `deploy_agents`, `runs`

### Hash Chains

- **Turn chain**: `parent_turn_hash → turn_hash` (SHA-256 of JCS-canonicalized JSON)
- **Commit chain**: DAG with `parent_hashes[]`, supports branching and merging

### Extractor Rings (t3x-core)

Semantic extraction happens in three rings:
- **Ring 1**: Keywords, entities, temporal anchors, preference tags
- **Ring 2**: Intent seeds, relations, facets
- **Ring 3**: Sentence-level segments

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
import { observer, evalEngine } from '@t3x/runner';

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
├── store/                       # Zustand state management
│   ├── canvasStore.ts           # Canvas store (core state + slice composition)
│   ├── canvasStoreTypes.ts      # Shared CanvasState type + slice interfaces
│   ├── canvasStoreUtils.ts      # Pure utility functions (layout, position, graph helpers)
│   ├── canvasMergeSlice.ts      # Merge domain slice (state + methods + selectors)
│   ├── canvasLeafSlice.ts       # Leaf panel domain slice
│   ├── pinsStore.ts             # V4 pin management (CRUD, selectors)
│   ├── projectStore.ts          # Project state
│   ├── mergeWorkspaceStore.ts   # Full-screen merge workspace state
│   ├── optimiserStore.ts        # Agent evaluation UI state (persisted)
│   └── agentDemoStore.ts        # Agent demo state
├── hooks/                       # React hooks
│   ├── useApi.ts                # API wrapper
│   ├── useSourceContext.ts      # V4 source context fetching
│   └── useBranchCommits.ts      # Branch commit data
├── lib/
│   ├── api.ts                   # API client functions
│   ├── db.ts                    # Database singleton
│   ├── bridgeQueries.ts         # Storage queries bridge
│   ├── diffUtils.ts             # Diff algorithm (Jaccard + LCS)
│   ├── elkLayout.ts             # ELK.js graph layout
│   └── highlightUtils.ts        # Text highlighting
└── __tests__/                   # API route tests
```

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
├── canvasStoreTypes.ts ← Shared types: CanvasState, MergeSlice, LeafPanelSlice
├── canvasStoreUtils.ts ← Pure functions: layout, position, graph traversal
├── canvasMergeSlice.ts ← Merge domain: state + 6 methods + 4 selectors
└── canvasLeafSlice.ts  ← Leaf domain: state + 4 methods
```

All consumers import from `canvasStore.ts` (re-exports selectors/types for backward compatibility).

## Testing

All packages use **vitest** with PGLite for isolated test databases:

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

### CommitV4 Record (Current)
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
        "confidence": 0.95,
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

**Key difference from V3**: CommitV4 content has sentences ONLY. No constraints. Constraints belong to Leaf.

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
4. **Evidence-backed**: Every semantic finding traces to source turns with confidence scores

## Environment Variables

Copy `.env.example` to `.env`:

- `NEXT_PUBLIC_API_URL`: T3X API server URL (default: http://localhost:8000)
- `DATABASE_URL`: PostgreSQL connection string (production/Docker)
- `ANTHROPIC_API_KEY`: For Claude API access (optional, for LLM features)
- `GOOGLE_AI_STUDIO_KEY`: For Google AI features (optional)
- `GOOGLE_CLOUD_NLP_KEY`: For Google Cloud NLP features (optional)
- `N8N_BASE_URL`: n8n workflow engine URL (default: http://localhost:5678)
- `N8N_API_KEY`: n8n API key (optional)
- `RUNNER_BASE_URL`: Runner service URL (default: http://localhost:8080)
- `TRACE_POLICY`: Runner trace policy: `always` | `on_failure` | `on_violation`

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
- Legacy: `s1`, `s2` (sentence), `c1`, `c2` (constraint), `mc1` (merged constraint) - V3 format

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
| packages/core/src/types/v4/index.ts | TypeScript types | ❌ No |
| packages/storage/src/schema-v4.ts | Database schema | ❌ No |
| apps/api/src/schemas/v4-contracts.ts | API contracts | ❌ No |

Rule: Contract = Law, Implementation = Freedom

- ✅ Implement according to contracts freely
- ❌ Do NOT modify contract files without team agreement
- If contract needs change → discuss first → modify together → both review PR

### Import Rules

```typescript
// ✅ Correct: Import from @t3x/core
import { CommitV4, Leaf, Pin, Constraint } from '@t3x/core';

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
CommitV4        = Sentences only (pure knowledge, NO constraints)
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
| **Product & Strategy** | `docs/product-strategy.md`, `docs/product-roadmap.md` |
| **Product Overview** | `docs/product-overview/01-product-and-user-layer.md`, `docs/product-overview/02-architecture-and-design-layer.md`, `docs/product-overview/03-engineering-and-implementation-layer.md` |
| **Team Collaboration** | `docs/collaboration-protocol.md` |
| WebUI Development | `apps/web/README.md`, `apps/web/src/store/`, `docs/frontend-rules.md`, `docs/frontend-design-principles.md`, `docs/frontend-art-template.md` |
| API / Backend Development | `apps/api/README.md`, `apps/api/src/schemas/v4-contracts.ts`, `docs/backend-rules.md`, `docs/API_REFERENCE.md` |
| V4 Architecture Development | `docs/specification/semantic-layer-architecture.md`, `docs/specification/memory-pin-system-design.md` |
| Source Context / Highlighting | `docs/specification/commit-source-context-presentation.md`, `docs/specification/commit-source-context-implementation-review.md` |
| Diff / Merge Algorithms | `docs/specification/words-based-diff-merge-architecture.md` |
| Core Algorithms | `packages/core/README.md`, `packages/core/src/types/` |
| Storage Layer | `packages/storage/README.md`, `packages/storage/src/schema-v4.ts` |
| Runner/Eval | `apps/runner/README.md` |
| Testing | `docs/LOCAL_TESTING.md`, `docs/testing/bvt-smoke.md` |
| Docker / Deployment | `docs/docker.md` |

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
| PGLite data lost after restart | Closing terminal directly or `kill -9` causes improper database shutdown, file corruption | Use `pnpm stop:api` for graceful stop, or `kill -TERM $(lsof -ti:8000)` |

## Prohibited Actions

- **Don't commit without asking**: Always ask the user for confirmation before running `git commit` or `git push`
- **Don't add Co-Authored-By**: Never include `Co-Authored-By` tag or Claude's email in commit messages
- **Use English only**: All commit messages, PR titles, and PR descriptions must be in English
- **Don't guess code locations**: Use Grep/Glob to search first
- **Don't assume architecture**: API and WebUI are separated after 2025-12 migration
- **Don't rush to modify**: Read code first, understand context, confirm impact scope
- **Don't skip verification**: Must run related tests after changes

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

## Quick Debug Commands

```bash
# Check port usage
lsof -i :8000                    # API port
lsof -i :3000                    # WebUI port

# View API logs (real-time)
pnpm dev:api 2>&1 | tee api.log

# Database status (PGLite files)
ls -la .t3x/database/

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
After @t3x/core changes:
  pnpm build:core && pnpm build:storage && pnpm build:api

After @t3x/storage changes:
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

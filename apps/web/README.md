# t3x-webui

Web frontend for T3X, a canvas-based semantic version control interface built with Next.js.

**Last Updated:** 2026-04-14

## Tech Stack

| Category | Current Usage |
|----------|--------------|
| Framework | Next.js 16 + React 19 (App Router) |
| Canvas | xyflow v12 (ReactFlow) |
| Styling | Tailwind CSS v4 + shadcn/ui |
| State | Zustand |
| Animation | Framer Motion |
| Layout | ELK.js (auto layout) |

## Directory Structure

The source tree follows a four-layer v2 architecture (L1 infrastructure /
L2 domain / L3 composition / L4 view) enforced by Biome. See the
**"WebUI Architecture"** section of the repo root `CLAUDE.md` for the
canonical folder map and import rules — that is the single source of truth.

Top-level layout under `src/`:

- `app/` — Next.js App Router pages
- `components/` — L4 view (canvas, leaf, merge, diff, shared, ui…)
- `hooks/` — L3 composition, organised by aggregate (canvas, commits,
  conversations, drafts, feedback, imports, knowledge-graph, leaves,
  merge, pins, projects, shared, shares, templates)
- `store/` — L3 Zustand containers (passive: state + setters only)
- `queries/` — L3 reads (async fetch per aggregate)
- `commands/` — L3 writes (yops/ + 9 other aggregates)
- `domain/` — L2 pure functions (commit, diff, draft, format, leaf, tree,
  yops, …). No React, no I/O.
- `infrastructure/` — L1 I/O adapters (the only layer that calls `fetch()`)
- `utils/` — cross-layer view helpers (cn, theme, motion, microcopy, …)
- `types/`, `data/` — shared type re-exports / static data
- `__tests__/` — mirrors the src layout above

## API Connection

WebUI calls the standalone Hono API service via the
`@/infrastructure/*` adapters (the only layer that may call `fetch()`):

| Environment | API Address |
|-------------|-------------|
| Development | `http://localhost:8000/api/v1` |

## State Management

| Store | Purpose |
|-------|---------|
| `canvasStore` | Nodes, edges, selection state, canvas operations |
| `projectStore` | Project list, current project, CRUD operations |
| `agentDemoStore` | Agent Demo page state |
| `mergeWorkspaceStore` | Merge Workspace state (decisions, preview) |
| `optimiserStore` | Agent Optimiser state (runs, filter) |
| `pinsStore` | Pin state management (fetch, add, remove, update) |

## Getting Started

```bash
# Need to start API service simultaneously
pnpm dev:api     # Terminal 1 - API (port 8000)
pnpm dev:webui   # Terminal 2 - WebUI (port 3000)
```

## Testing

```bash
pnpm --filter t3x-webui test
```

## Module Boundaries

This app follows the v2 four-layer architecture (L1 infrastructure /
L2 domain / L3 composition / L4 view) enforced by Biome
`noRestrictedImports`. See repo-root `CLAUDE.md` → "WebUI Architecture"
for the canonical rules.

Sources of truth for stable interfaces (don't change casually):

- **Wire types** — `src/types/api.ts` (re-export surface) and the API's
  OpenAPI schema in `apps/api/docs/openapi-summary.md`.
- **Infrastructure adapters** — `src/infrastructure/*.ts` (only layer
  that calls `fetch()`; renaming or removing exports breaks callers in
  `queries/`, `commands/`, and `hooks/`).
- **Canvas store shape** — `src/store/canvasStore.ts` + slice files
  (`canvasStoreTypes.ts`, `canvasMergeSlice.ts`, `canvasLeafSlice.ts`,
  `canvasCommitSlice.ts`, `canvasNodeSlice.ts`).
- **Domain primitives** — `src/domain/**` pure functions consumed by
  hooks and stores; changing signatures here ripples upward.

Internal implementations (non-exported helpers, intra-layer utilities)
can be refactored freely.

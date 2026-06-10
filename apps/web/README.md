# t3x-webui

Web frontend for T3X structured-state workflows, built with Next.js.

**Last Updated:** 2026-06-02

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
**"WebUI Architecture"** section of the repo root `AGENTS.md` for the
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

## Local Shared Access

In a one-machine local setup, WebUI can manage the standalone API host's
machine-local API URL and API key from `/settings/access`, and CLI/MCP can read
that same file.

Source precedence is:

```text
T3X_API_URL / T3X_API_KEY (environment)
-> ~/.t3x/config.json
-> built-in defaults
```

This means the settings page shows the effective values, not just the file
contents. If an environment variable is present, UI saves still update the
shared file, but the environment value remains active until removed.

The same page now includes a `Test Access` action so local users can confirm
whether the configured API is reachable, and whether the current deployment
requires or accepts the configured key.

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

## Demo Screenshots

The WebUI documentation screenshots are maintained in the docs repository. The
local screenshot script is for review/regeneration and should not make the core
repository carry generated image assets.

```bash
# From the repo root, with pnpm dev:api and pnpm dev:webui already running
pnpm screenshots:demo
```

The stable landing-only script writes ignored local review copies to
`tmp/screenshots/demo/`:

- `tmp/screenshots/demo/chat-light.png`
- `tmp/screenshots/demo/chat-dark.png`
- `tmp/screenshots/demo/chat-mobile.png`

The broader workflow screenshot set lives in the docs repository under
`static/img/screenshots/`.

## Testing

```bash
pnpm --filter t3x-webui test
```

## Module Boundaries

This app follows the v2 four-layer architecture (L1 infrastructure /
L2 domain / L3 composition / L4 view) enforced by Biome
`noRestrictedImports`. See repo-root `AGENTS.md` -> "WebUI Architecture"
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

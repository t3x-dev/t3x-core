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
│   └── api-client/     # @t3x/api-client - TypeScript API client
├── apps/
│   ├── web/            # t3x-webui - Next.js 16 frontend (App Router + XYFlow)
│   ├── api/            # @t3x/api - Hono API server with OpenAPI
│   ├── runner/         # @t3x/runner - Grey-box agent evaluation engine
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
```

### Development servers
```bash
pnpm dev:webui                  # Next.js dev server (port 3000)
pnpm dev:api                    # Hono API server (port 8000)
pnpm dev:agent                  # Demo agent (port 9000)
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

Key tables: `projects`, `conversations`, `turns_v2`, `branches`, `commits_v2`, `drafts_v2`, `commits_v3`, `segment_embeddings`

### Hash Chains

- **Turn chain**: `parent_turn_hash → turn_hash` (SHA-256 of JCS-canonicalized JSON)
- **Commit chain**: DAG with `parent_hashes[]`, supports branching and merging

### Extractor Rings (t3x-core)

Semantic extraction happens in three rings:
- **Ring 1**: Keywords, entities, temporal anchors, preference tags
- **Ring 2**: Intent seeds, relations, facets
- **Ring 3**: Sentence-level segments

## WebUI Architecture (apps/web)

```
src/
├── app/                    # Next.js App Router
│   ├── api/v1/            # REST API routes (snake_case JSON)
│   └── project/[projectId]/ # Project canvas page
├── components/            # React components
├── store/                 # Zustand state management
│   └── canvasStore.ts     # Canvas nodes/edges state
├── hooks/                 # React hooks
├── lib/
│   ├── api.ts             # API client functions
│   └── db.ts              # Database singleton
└── __tests__/             # API route tests
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

### Commit Record
```json
{
  "commit_hash": "sha256:...",
  "parent_hashes": ["sha256:..."],
  "branch": "main",
  "turn_window": { "start_turn_hash": "...", "end_turn_hash": "..." },
  "facet_snapshot": [...],
  "source_refs": [{ "type": "conversation", "conversation_id": "..." }]
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

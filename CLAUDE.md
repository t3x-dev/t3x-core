# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

T3X is "Git for Meaning" — a semantic version control system for AI conversations. It provides evidence-backed, deterministic semantic extraction with versioning, branching, and merging capabilities similar to Git.

**Key philosophy**: The core deterministic layer never depends on LLMs. LLMs are optional plugins for enhancement (SummaryAgent, MergeAgent).

## Repository Structure

```
t3x/
├── t3x-core/       # Deterministic semantic engine (TypeScript)
├── t3x-storage/    # PostgreSQL persistence layer (Drizzle ORM)
├── t3x-webui/      # Next.js 15 frontend (App Router + ReactFlow)
├── t3x-runner/     # Grey-box agent evaluation engine
├── agent-demo/     # Demo agent for testing
└── docker-compose.yml
```

## Build Commands

### t3x-core
```bash
cd t3x-core
npm install
npm run build          # tsc
npm test               # vitest (102 tests)
npm run test:watch     # watch mode
```

### t3x-storage
```bash
cd t3x-storage
npm install
npm run build          # tsc
npm test               # vitest (151 tests)
npm run db:studio      # Drizzle Studio
```

### t3x-webui
```bash
cd t3x-webui
npm install
npm run dev            # Next.js dev server (port 3000)
npm run build          # next build
npm run lint           # eslint
npm test               # vitest (44 tests)
```

### t3x-runner
```bash
cd t3x-runner
npm install
npm run build          # tsc
npm run dev            # tsx watch src/server.ts
npm run start          # node dist/server.js
```

### Run Single Test
```bash
vitest run src/__tests__/api/projects.test.ts   # specific file
vitest run -t "creates a new project"           # by test name
```

### Docker
```bash
docker-compose up                    # Start all services
docker-compose up -d                 # Background mode
docker-compose --profile n8n up      # Include n8n workflow engine
```

Ports: WebUI (3000), Core API (8000), Runner API (8080), Demo Agent (9000)

## Architecture

### Package Dependencies

```
t3x-webui ──depends──► @t3x/storage ──depends──► @t3x/core
```

### Three-Layer Design

| Layer | Package | LLM Required? |
|-------|---------|---------------|
| **Framework Core** | `@t3x/core` | No (deterministic) |
| **Storage Layer** | `@t3x/storage` | No |
| **Agentic Layer** | SummaryAgent/MergeAgent plugins | Optional |
| **Product Layer** | `t3x-webui`, `t3x-runner` | No |

### Storage Architecture

T3X uses PostgreSQL (via Drizzle ORM):
- **PGLite** for local development (PostgreSQL WASM, data in `.t3x/database/`)
- **Postgres** for production
- **Supabase** adapter available

Key tables: `projects`, `conversations`, `turns_v2`, `branches`, `commits_v2`, `drafts_v2`, `merge_results`, `segment_embeddings`

### Hash Chains

- **Turn chain**: `parent_turn_hash → turn_hash` (SHA-256 of JCS-canonicalized JSON)
- **Commit chain**: DAG with `parent_hashes[]`, supports branching and merging

### Extractor Rings (t3x-core)

Semantic extraction happens in three rings:
- **Ring 1**: Keywords, entities, temporal anchors, preference tags
- **Ring 2**: Intent seeds, relations, facets
- **Ring 3**: Sentence-level segments

## WebUI Architecture

### Directory Structure
```
t3x-webui/src/
├── app/                    # Next.js App Router
│   ├── api/v1/            # REST API routes
│   │   ├── projects/      # CRUD operations
│   │   ├── conversations/ # Conversation management
│   │   ├── turns/         # Turn (message) management
│   │   ├── commits/       # Commit operations
│   │   ├── branches/      # Branch management
│   │   └── drafts/        # Draft commit workflow
│   └── project/[projectId]/ # Project canvas page
├── components/            # React components
├── store/canvasStore.ts   # Zustand state management
├── hooks/useApi.ts        # Data fetching hooks
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

- `ANTHROPIC_API_KEY`: For Claude API access
- `T3X_DATA_DIR`: PGLite data directory (default: `.t3x/database`)
- `DATABASE_URL`: PostgreSQL connection string (production)
- `LOG_LEVEL`: Logging verbosity (debug/info/warn/error)

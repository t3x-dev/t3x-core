# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

T3X is "Git for Meaning" — a semantic version control system for AI conversations. It provides evidence-backed, deterministic semantic extraction with versioning, branching, and merging capabilities similar to Git.

**Key philosophy**: The core deterministic layer never depends on LLMs. LLMs are optional plugins for enhancement (SummaryAgent, MergeAgent).

## Repository Structure

```
t3x/
├── apps/
│   ├── api/            # Standalone REST API (Hono)
│   ├── web/            # Next.js frontend (React + ReactFlow)
│   ├── runner/         # Grey-box agent evaluation engine
│   └── agent-demo/     # Demo agent for testing
├── packages/
│   ├── core/           # Deterministic semantic engine (TypeScript)
│   └── storage/        # PostgreSQL persistence (Drizzle ORM)
├── turbo.json          # Turborepo config
├── pnpm-workspace.yaml # pnpm workspace config
└── docker-compose.yml
```

## Build Commands

This project uses **pnpm** and **Turborepo** for monorepo management.

### Install dependencies
```bash
pnpm install
```

### Build all packages
```bash
pnpm build              # Build all (parallel, cached)
pnpm build:core         # Build only @t3x/core
pnpm build:storage      # Build only @t3x/storage
pnpm build:webui        # Build only t3x-webui
pnpm build:api          # Build only @t3x/api
```

### Run tests
```bash
pnpm test               # Test all (parallel, cached)
pnpm test:core          # Test only @t3x/core
pnpm test:storage       # Test only @t3x/storage
pnpm test:webui         # Test only t3x-webui
```

### Development
```bash
pnpm dev:api            # Start API dev server (port 8000)
pnpm dev:webui          # Start webui dev server (port 3000)
pnpm dev:runner         # Start runner dev server
pnpm dev:agent          # Start agent-demo dev server
```

### Docker
```bash
docker-compose up                    # Start all services
docker-compose up -d                 # Background mode
docker-compose --profile n8n up      # Include n8n workflow engine
```

Ports: API (8000), WebUI (3000), Runner API (8080), Demo Agent (9000)

## Architecture

### Three-Layer Design

| Layer | Package | LLM Required? |
|-------|---------|---------------|
| **Framework Core** | `packages/core` | No (deterministic) |
| **Storage Layer** | `packages/storage` | No |
| **API Layer** | `apps/api` | No |
| **Agentic Layer** | SummaryAgent/MergeAgent plugins | Optional |
| **Product Layer** | `apps/web`, `apps/runner` | No |

### Storage Architecture

T3X uses dual-layer storage:
1. **JSONL Ledger** (source of truth): Append-only hash chains under `.t3x/`
2. **PostgreSQL Index** (query layer): Rebuildable from ledger, used for fast queries (PGLite for dev)

Key entities: `projects`, `conversations`, `turns`, `drafts`, `commits`, `diffs`

### Hash Chains

- **Turn chain**: `prev_turn_hash → turn_hash` (SHA-256 of JCS-canonicalized JSON)
- **Commit chain**: DAG with `parent_hashes[]`, supports branching and merging

### Extractor Rings

Semantic extraction happens in three rings:
- **Ring 1**: Keywords, entities, temporal anchors, preference tags
- **Ring 2**: Intent seeds, relations, facets
- **Ring 3**: Sentence-level segments

## Key Data Formats

### .cfpack Export Format
Portable JSON archive for sharing conversations across T3X instances. Contains: `turns`, `findings`, `commits`, `pipeline` config, with full provenance metadata.

### Turn Record (JSONL)
```json
{
  "turn_hash": "sha256:...",
  "parent_turn_hash": "sha256:...",
  "project_id": "proj_...",
  "conversation_id": "conv_...",
  "role": "user|assistant|system|tool",
  "content": "...",
  "created_at": "ISO8601",
  "schema_version": "turn_v1"
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
  "pipeline_config": {...},
  "signature": { "algo": "ed25519", "key_id": "...", "value": "..." }
}
```

## Testing

All packages use **vitest** for testing:
```bash
pnpm test                    # Run all tests
pnpm test:core               # Run core tests
pnpm test:storage            # Run storage tests
vitest run path/to/test      # Single test file
```

## Important Design Constraints

1. **Determinism**: Core algorithms must be 100% reproducible — same inputs always produce same outputs
2. **Append-only**: JSONL ledgers are immutable; any modification breaks hash chains
3. **Plugin architecture**: Extractors and embedders are pluggable via `.t3x/config.yml`
4. **Evidence-backed**: Every semantic finding traces to source turns with confidence scores

## Environment Variables

- `ANTHROPIC_API_KEY`: For Claude API access
- `GOOGLE_AI_STUDIO_KEY`: For embedding operations
- `T3X_DATA_DIR`: Database location (default: `.t3x/database`)
- `LOG_LEVEL`: Logging verbosity (debug/info/warn/error)

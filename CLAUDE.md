# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

T3X is "Git for Meaning" — a semantic version control system for AI conversations. It provides evidence-backed, deterministic semantic extraction with versioning, branching, and merging capabilities similar to Git.

**Key philosophy**: The core deterministic layer never depends on LLMs. LLMs are optional plugins for enhancement (SummaryAgent, MergeAgent).

## Repository Structure

```
t3x/
├── t3x-core/       # Deterministic semantic engine (TypeScript)
├── t3x-cli/        # Interactive shell CLI
├── t3x-webui/      # React frontend (Vite + ReactFlow)
├── t3x-runner/     # Grey-box agent evaluation engine
├── agent-demo/     # Demo agent for testing
└── docker-compose.yml
```

## Build Commands

### t3x-core (TypeScript + SQLite)
```bash
cd t3x-core
npm install
npm run build          # tsc + copy schema.sql
npm test               # vitest run
npm run test:watch     # vitest watch mode
```

### t3x-cli
```bash
cd t3x-cli
npm install
npm run build          # tsc
npm run start          # node dist/bin/t3x.js
npm test
```

### t3x-webui (React + Vite)
```bash
cd t3x-webui
npm install
npm run dev            # vite dev server
npm run build          # tsc -b && vite build
npm run lint           # eslint
```

### t3x-runner
```bash
cd t3x-runner
npm install
npm run build          # tsc
npm run dev            # tsx watch src/server.ts
npm run start          # node dist/server.js
npm test
```

### Docker
```bash
docker-compose up                    # Start all services
docker-compose up -d                 # Background mode
docker-compose --profile n8n up      # Include n8n workflow engine
```

Ports: WebUI (3000), Core API (8000), Runner API (8080), Demo Agent (9000)

## Architecture

### Three-Layer Design

| Layer | Package | LLM Required? |
|-------|---------|---------------|
| **Framework Core** | `t3x-core` | No (deterministic) |
| **Agentic Layer** | SummaryAgent/MergeAgent plugins | Optional |
| **Product Layer** | `t3x-cli`, `t3x-webui` | No |

### Storage Architecture

T3X uses dual-layer storage:
1. **JSONL Ledger** (source of truth): Append-only hash chains under `.t3x/`
2. **SQLite Index** (query layer): Rebuildable from ledger, used for fast queries

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
npm test                 # Run tests
npm run test:watch       # Watch mode
vitest run path/to/test  # Single test file
```

## Important Design Constraints

1. **Determinism**: Core algorithms must be 100% reproducible — same inputs always produce same outputs
2. **Append-only**: JSONL ledgers are immutable; any modification breaks hash chains
3. **Plugin architecture**: Extractors and embedders are pluggable via `.t3x/config.yml`
4. **Evidence-backed**: Every semantic finding traces to source turns with confidence scores

## Environment Variables

- `ANTHROPIC_API_KEY`: For Claude API access (t3x-cli)
- `T3X_CORE_URL`: Core API URL (default: http://localhost:8000)
- `LOG_LEVEL`: Logging verbosity (debug/info/warn/error)

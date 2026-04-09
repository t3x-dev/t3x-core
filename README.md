<p align="center">
  <img src=".github/assets/t3x-logo.svg" alt="T3X" width="80" />
</p>

<h1 align="center">T3X</h1>

<p align="center">
  <strong>Git for meaning.</strong>
</p>

<p align="center">
  <a href="https://t3x.dev/docs">Docs</a> &middot;
  <a href="https://t3x.dev">Website</a> &middot;
  <a href="https://discord.gg/t3x">Community</a>
</p>

<p align="center">
  <a href="./LICENSE"><img src="https://img.shields.io/badge/license-Apache--2.0-blue" alt="License" /></a>
  <a href="https://www.npmjs.com/package/@t3x-dev/core"><img src="https://img.shields.io/npm/v/@t3x-dev/core" alt="npm" /></a>
  <a href="https://github.com/t3x-dev/t3x-core/actions"><img src="https://img.shields.io/github/actions/workflow/status/t3x-dev/t3x-core/ci.yml?branch=main" alt="CI" /></a>
</p>

<br/>

<p align="center">
  <img src=".github/assets/concept.svg" alt="How T3X works" width="760" />
</p>

<br/>

## Why T3X

Every conversation with an AI produces knowledge &mdash; preferences, decisions, context, facts. Today that knowledge lives in chat logs: unstructured, unversioned, unsearchable.

T3X extracts structured meaning from conversations and puts it under version control. Like Git tracks source code, T3X tracks what you *know* &mdash; with commits, branches, diffs, and three-way merges.

**The problem with existing approaches:**

| Approach | Limitation |
|:---------|:-----------|
| Chat history | Linear, unsearchable, no structure |
| Vector databases (RAG) | Fuzzy retrieval, no versioning, no diff |
| Summary-based memory | Lossy &mdash; summaries discard nuance |
| Manual knowledge bases | Doesn't scale, falls out of date |

**What T3X does differently:**

- **Structured** &mdash; Meaning is extracted into YAML trees, not embeddings
- **Versioned** &mdash; Every change is a commit in a hash-chain DAG
- **Deterministic** &mdash; Core engine is 100% reproducible, no LLM in the loop
- **Diffable** &mdash; Word-level semantic diffs show exactly what changed
- **Mergeable** &mdash; Three-way merge with conflict resolution, like Git
- **Traceable** &mdash; Every fact links back to the original conversation with character offsets

<br/>

## How it works

T3X has a flywheel of five stages. Each stage feeds the next:

```
Conversation  ──►  Extract  ──►  YOps  ──►  Commit  ──►  Apply
     │                │            │           │            │
  raw text       YAML tree    transform    versioned     Leaf output
  (chat, doc,    (structured   (18 atomic   (hash chain,  (deploy agent,
   transcript)    meaning)      ops on       branch,       tweet, email,
                               YAML)        diff, merge)   eval assertion)
```

**1. Conversation** &mdash; Feed in any text: chat transcripts, documents, meeting notes. No format requirements.

**2. Extract** &mdash; LLM-powered extraction builds a YAML knowledge tree incrementally. Keywords, entities, preferences, relations, temporal anchors &mdash; all structured and source-traced.

**3. YOps** &mdash; 18 declarative operations to transform the YAML tree. Add, remove, rename, move, split, merge, sort &mdash; all spec-driven, all deterministic. The user reviews and approves.

**4. Commit** &mdash; Snapshot the tree into an immutable commit. SHA-256 hash chain, branching, word-level diff between commits, three-way merge with conflict resolution.

**5. Apply** &mdash; Leaf nodes consume committed knowledge for real output: deploy an agent, generate content, run assertions. The Runner evaluates quality and feeds lessons back.

> Stages 1-2 use an LLM (optional). Stages 3-5 are fully deterministic.

<br/>

## Getting started

### Option A: Docker (full stack, 30 seconds)

```bash
docker compose up -d
```

> **WebUI** &rarr; [localhost:3000](http://localhost:3000) &nbsp;&nbsp;|&nbsp;&nbsp; **API** &rarr; [localhost:8000](http://localhost:8000)

### Option B: CLI

```bash
npx @t3x-dev/cli init
```

### Option C: From source

```bash
git clone https://github.com/t3x-dev/t3x-core.git && cd t3x-core
pnpm install && pnpm build
pnpm dev:api     # API at localhost:8000
pnpm dev:webui   # WebUI at localhost:3000
```

Requires Node.js 20+ and pnpm 10+.

### Configuration

```
~/.t3x/config.json          # API keys, default server URL
<project>/.t3x/config.json  # Project-specific settings
```

The core engine works without any API key. To use the extraction module, add an LLM key &mdash; T3X supports Anthropic and Google AI.

<br/>

## YOps &mdash; Declarative YAML Operations

<p align="center">
  <img src=".github/assets/yops-architecture.svg" alt="YOps Architecture" width="680" />
</p>

YOps is the operation layer &mdash; 18 atomic, spec-driven operations on any YAML document:

```yaml
yops:
  - define:
      path: user/preferences
  - populate:
      path: user/preferences
      values: { theme: dark, language: en, notifications: true }
  - append:
      path: user/tags
      value: early-adopter
  - sort:
      path: user/tags
  - assert:
      path: user/preferences/theme
      equals: dark
```

**4 categories, 18 operations:**

| Category | Ops | Purpose |
|:---------|:----|:--------|
| **DDL** (structure) | `define` `drop` `rename` | Create, remove, rename keys |
| **DML** (data) | `set` `unset` `populate` `append` | Set values, add to sequences |
| **DTL** (transform) | `move` `clone` `nest` `split` `fold` `merge` `sort` `unique` `pick` `omit` | Reshape the tree |
| **DCL** (control) | `assert` | Validate conditions (read-only) |

The full spec lives in [`yops.yaml`](packages/yops/yops.yaml) &mdash; machine-readable, with embedded test cases. Any language can implement a conformant engine from this single file.

&rarr; [YOps package](packages/yops/) for API docs and detailed reference

<br/>

## Use T3X

### For AI agents &mdash; MCP Server

Connect any MCP-compatible agent to T3X with 47 built-in tools:

```json
{
  "mcpServers": {
    "t3x": {
      "command": "npx",
      "args": ["@t3x-dev/mcp"]
    }
  }
}
```

Works with Claude Code, Cursor, Windsurf, and others. &rarr; [MCP docs](https://t3x.dev/docs/mcp)

### For your terminal &mdash; CLI

```bash
t3x extract     # Build YAML from text (LLM-powered)
t3x commit      # Commit a snapshot
t3x diff        # Compare two commits
t3x merge       # Three-way merge
```

&rarr; [CLI reference](https://t3x.dev/docs/cli)

### For your app &mdash; API

RESTful API with OpenAPI spec. Self-host or use the managed cloud.

```bash
curl http://localhost:8000/api/v1/projects
```

&rarr; [API reference](https://t3x.dev/docs/api)

### For evaluation &mdash; Runner

Trace-based CI/CD for AI agent behavior. Capture I/O traces, run assertions, gate deployments.

&rarr; [Runner docs](https://t3x.dev/docs/runner)

<br/>

## Architecture

```
┌─────────────────────────────────────────────────────┐
│                   Product Layer                      │
│   WebUI (Next.js)  ·  API (Hono)  ·  CLI  ·  MCP   │
├─────────────────────────────────────────────────────┤
│                   Storage Layer                      │
│   PostgreSQL (Drizzle ORM)  ·  Embedded PG (dev)    │
├─────────────────────────────────────────────────────┤
│                    Core Layer                        │
│   Hash chains  ·  Diff engine  ·  Merge  ·  Extract │
├─────────────────────────────────────────────────────┤
│                   YOps Engine                        │
│   18 ops  ·  Spec-driven  ·  100% deterministic     │
└─────────────────────────────────────────────────────┘
```

**Key design principles:**

- **Deterministic core** &mdash; Same inputs always produce same outputs. No LLM in the critical path.
- **Append-only** &mdash; Hash chains are immutable. Any modification breaks integrity.
- **Evidence-backed** &mdash; Every semantic finding traces to source text with verbatim quotes.
- **Pluggable** &mdash; LLMs are optional plugins for extraction and summarization, never required.

### Project structure

```
packages/yops        # YOps — 18 declarative YAML operations (spec-driven)
packages/core        # T3X engine — diff, merge, hash chains, extraction
packages/storage     # PostgreSQL persistence (Drizzle ORM)
packages/api-client  # TypeScript API client
apps/web             # WebUI (Next.js 16 + App Router)
apps/api             # Hono API server with OpenAPI
apps/cli             # Command-line interface
apps/mcp             # MCP server (47 tools)
apps/runner          # Grey-box agent evaluation engine
```

### Build commands

```bash
pnpm build           # Build all packages
pnpm test            # Run all tests
pnpm check           # Lint + format (Biome)
pnpm check:fix       # Auto-fix
```

&rarr; [Contributing guide](./CONTRIBUTING.md)

<br/>

## Packages

| Package | npm | Description |
|:--------|:----|:------------|
| [`@t3x-dev/yops`](packages/yops/) | [![npm](https://img.shields.io/npm/v/@t3x-dev/yops)](https://www.npmjs.com/package/@t3x-dev/yops) | 18 declarative YAML operations |
| [`@t3x-dev/core`](packages/core/) | [![npm](https://img.shields.io/npm/v/@t3x-dev/core)](https://www.npmjs.com/package/@t3x-dev/core) | Diff, merge, hash chains, extraction |
| [`@t3x-dev/storage`](packages/storage/) | [![npm](https://img.shields.io/npm/v/@t3x-dev/storage)](https://www.npmjs.com/package/@t3x-dev/storage) | PostgreSQL persistence |
| [`@t3x-dev/api`](packages/api/) | [![npm](https://img.shields.io/npm/v/@t3x-dev/api)](https://www.npmjs.com/package/@t3x-dev/api) | API server library |
| [`@t3x-dev/api-client`](packages/api-client/) | [![npm](https://img.shields.io/npm/v/@t3x-dev/api-client)](https://www.npmjs.com/package/@t3x-dev/api-client) | TypeScript client |
| [`@t3x-dev/mcp`](apps/mcp/) | [![npm](https://img.shields.io/npm/v/@t3x-dev/mcp)](https://www.npmjs.com/package/@t3x-dev/mcp) | MCP server for AI agents |

<br/>

## Documentation

[t3x.dev/docs](https://t3x.dev/docs) &mdash; Quickstart, YOps reference, API reference, architecture, self-hosting.

<br/>

## License

[Apache License 2.0](./LICENSE)
